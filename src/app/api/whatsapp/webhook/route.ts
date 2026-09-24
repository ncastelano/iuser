// app/api/whatsapp/webhook/route.ts
//
// Endpoint público (não autenticado por sessão) que recebe as mensagens
// de TODOS os números de WhatsApp das lojas — a Meta manda o
// phone_number_id de qual número recebeu em toda mensagem, é assim que a
// gente sabe de qual loja é a conversa, sem precisar de link especial.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWhatsAppText, verifyWebhookSignature } from '@/lib/whatsappCloudApi'
import { handleIncomingMessage, matchProfileByWhatsApp, type ConversationRow, type StoreRow } from '@/lib/whatsappBotFlows'

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

// Handshake de verificação — a Meta chama isso uma vez quando você
// cadastra a URL do webhook no painel do app.
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(challenge || '', { status: 200 })
    }
    return NextResponse.json({ error: 'Verificação inválida' }, { status: 403 })
}

// A partir de 1º de outubro de 2026 a Meta cobra por mensagem de serviço
// (a que o bot manda) depois que a cota gratuita mensal do número acaba
// — antes disso era sempre grátis. O aviso de cobrança vem separado, num
// webhook de "status" (entrega/leitura), não junto da mensagem em si:
// value.statuses[i].pricing.billable. Quando vier true, lança a cobrança
// (estimativa da Meta + margem, ver service_pricing) na dívida da loja —
// vale pra pré-pago também, a mensalidade não cobre custo de terceiro.
async function chargeWhatsAppBotMessage(phoneNumberId: string, waMessageId: string) {
    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, owner_id')
        .eq('whatsapp_bot_phone_number_id', phoneNumberId)
        .maybeSingle()
    if (!store?.owner_id) return

    const { data: pricing } = await supabaseAdmin
        .from('service_pricing')
        .select('postpaid_price')
        .eq('service_type', 'whatsapp_bot_message_fee')
        .maybeSingle()

    const { error } = await supabaseAdmin
        .from('driver_postpaid_charges')
        .insert({
            driver_id: store.owner_id,
            store_id: store.id,
            type: 'whatsapp_bot_message_fee',
            amount: pricing?.postpaid_price ?? 0.25,
            wa_message_id: waMessageId,
        })
    // unique_violation (23505) = mesmo webhook reentregue, já cobramos essa mensagem.
    if (error && error.code !== '23505') {
        console.error('Erro ao cobrar mensagem de WhatsApp:', error)
    }
}

export async function POST(req: Request) {
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')
    const valid = await verifyWebhookSignature(rawBody, signature)
    if (!valid) {
        return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }

    // A partir daqui, qualquer erro interno ainda devolve 200 — webhook da
    // Meta reenvia agressivamente em caso de erro/timeout, e um bug no
    // processamento de UMA mensagem não deveria virar retry infinito.
    try {
        const payload = JSON.parse(rawBody)
        const change = payload?.entry?.[0]?.changes?.[0]?.value
        const phoneNumberId: string | undefined = change?.metadata?.phone_number_id

        // Webhook de status (entrega/leitura/falha) — é aqui que vem o aviso
        // de cobrança, nunca junto de "messages".
        const statuses = change?.statuses
        if (Array.isArray(statuses) && statuses.length > 0) {
            if (phoneNumberId) {
                for (const status of statuses) {
                    if (status?.pricing?.billable) {
                        await chargeWhatsAppBotMessage(phoneNumberId, status.id)
                    }
                }
            }
            return NextResponse.json({ ok: true })
        }

        const message = change?.messages?.[0]
        if (!message || message.type !== 'text') {
            // Reação, mídia não suportada etc. — ignora.
            return NextResponse.json({ ok: true })
        }

        // Dedup: a Meta pode reentregar o mesmo webhook mais de uma vez.
        const { error: dedupeError } = await supabaseAdmin
            .from('whatsapp_processed_messages')
            .insert({ wa_message_id: message.id })
        if (dedupeError) {
            // unique_violation = já processamos essa mensagem antes.
            return NextResponse.json({ ok: true })
        }

        const waPhone: string = message.from
        const contactName: string | null = change?.contacts?.[0]?.profile?.name || null
        const text: string = message.text?.body || ''
        if (!phoneNumberId || !waPhone) {
            return NextResponse.json({ ok: true })
        }

        const { data: store } = await supabaseAdmin
            .from('stores')
            .select('id, name, storeSlug, business_hours')
            .eq('whatsapp_bot_phone_number_id', phoneNumberId)
            .maybeSingle()
        if (!store) {
            // Número não está (mais) conectado a nenhuma loja — nada a fazer.
            return NextResponse.json({ ok: true })
        }

        let { data: convo } = await supabaseAdmin
            .from('whatsapp_conversations')
            .select('id, wa_phone, store_id, matched_profile_id, wa_contact_name, state, context')
            .eq('wa_phone', waPhone)
            .eq('store_id', store.id)
            .maybeSingle()

        if (!convo) {
            const matched = await matchProfileByWhatsApp(supabaseAdmin, waPhone)
            const { data: created } = await supabaseAdmin
                .from('whatsapp_conversations')
                .insert({
                    wa_phone: waPhone,
                    store_id: store.id,
                    matched_profile_id: matched?.id || null,
                    wa_contact_name: contactName,
                    state: 'menu',
                    context: {},
                })
                .select('id, wa_phone, store_id, matched_profile_id, wa_contact_name, state, context')
                .single()
            convo = created
        }
        if (!convo) return NextResponse.json({ ok: true })

        const result = await handleIncomingMessage(supabaseAdmin, convo as ConversationRow, store as StoreRow, text)

        await supabaseAdmin
            .from('whatsapp_conversations')
            .update({ state: result.newState, context: result.newContext, last_message_at: new Date().toISOString() })
            .eq('id', convo.id)

        await sendWhatsAppText(phoneNumberId, waPhone, result.reply)

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('Erro no webhook do WhatsApp:', err)
        return NextResponse.json({ ok: true })
    }
}
