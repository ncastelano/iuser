// app/api/whatsapp/appointment-notice/route.ts
//
// Avisa no WhatsApp (pelo número da loja, o mesmo do bot) que o agendamento foi marcado. Quem chama é o próprio cliente logo depois
// de agendar: o servidor confere que o agendamento é dele e recente, que a loja tem o bot conectado e que o cliente conversou com a
// loja nas últimas 23 h (fora dessa janela o WhatsApp só aceita mensagem modelo aprovada, então aí não manda nada). Um aviso por
// agendamento (dedupe pela tabela whatsapp_processed_messages). Falhar aqui nunca atrapalha o agendamento.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsappCloudApi'
import { phoneCandidates } from '@/lib/whatsappBotFlows'
import { buildAppointmentNotice } from '@/lib/whatsappAppointmentNotice'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iuser.com.br'
const WINDOW_MS = 23 * 60 * 60 * 1000
const RECENT_MS = 15 * 60 * 1000

export async function POST(req: Request) {
    const { appointmentId } = await req.json().catch(() => ({}))
    if (typeof appointmentId !== 'string' || !appointmentId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const supabase = await createServerSupabase()
    await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('id, store_id, store_name, customer_id, date, time, service_name, status, direction, created_at')
        .eq('id', appointmentId)
        .maybeSingle()
    // só o próprio cliente, e só um agendamento que ele acabou de fazer na loja
    if (!appt || appt.customer_id !== user.id || appt.direction !== 'outgoing' || !appt.store_id) return NextResponse.json({ sent: false, reason: 'not_allowed' })
    if (Date.now() - new Date(appt.created_at).getTime() > RECENT_MS) return NextResponse.json({ sent: false, reason: 'too_old' })

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, whatsapp_bot_phone_number_id')
        .eq('id', appt.store_id)
        .maybeSingle()
    if (!store?.whatsapp_bot_phone_number_id) return NextResponse.json({ sent: false, reason: 'no_bot' })

    // A conversa do cliente com o bot desta loja (pelo perfil ligado a ela ou pelo número do perfil)
    let { data: convo } = await supabaseAdmin
        .from('whatsapp_conversations')
        .select('wa_phone, last_message_at')
        .eq('store_id', store.id)
        .eq('matched_profile_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!convo) {
        const { data: me } = await supabaseAdmin.from('profiles').select('whatsapp').eq('id', user.id).maybeSingle()
        const candidates = phoneCandidates((me as { whatsapp?: string | null } | null)?.whatsapp || '')
        if (candidates.length > 0) {
            const { data } = await supabaseAdmin
                .from('whatsapp_conversations')
                .select('wa_phone, last_message_at')
                .eq('store_id', store.id)
                .in('wa_phone', candidates)
                .order('last_message_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            convo = data
        }
    }
    if (!convo) return NextResponse.json({ sent: false, reason: 'no_conversation' })
    if (Date.now() - new Date(convo.last_message_at).getTime() > WINDOW_MS) return NextResponse.json({ sent: false, reason: 'outside_window' })

    // um aviso por agendamento
    const { error: dedupe } = await supabaseAdmin.from('whatsapp_processed_messages').insert({ wa_message_id: `appt-notice:${appt.id}` })
    if (dedupe) return NextResponse.json({ sent: false, reason: 'already_sent' })

    try {
        await sendWhatsAppText(store.whatsapp_bot_phone_number_id, convo.wa_phone, buildAppointmentNotice({
            storeName: store.name || appt.store_name || 'a loja',
            serviceName: appt.service_name,
            date: appt.date,
            time: appt.time,
            status: appt.status,
            appUrl: APP_URL,
        }))
        return NextResponse.json({ sent: true })
    } catch (err) {
        console.error('Erro ao avisar agendamento no WhatsApp:', err)
        // libera o dedupe para uma nova tentativa
        await supabaseAdmin.from('whatsapp_processed_messages').delete().eq('wa_message_id', `appt-notice:${appt.id}`)
        return NextResponse.json({ sent: false, reason: 'send_failed' })
    }
}
