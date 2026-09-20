// app/api/webhooks/asaas/route.ts
//
// Único endpoint público não autenticado por sessão de usuário nesse
// sistema — por isso a verificação do header é obrigatória antes de
// confiar em qualquer coisa do payload.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSubscription } from '@/lib/asaas'

const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN

interface AsaasWebhookPayload {
    event: string
    payment?: {
        id: string
        subscription: string | null
        value: number
        status: string
        externalReference?: string | null
    }
}

const DRIVER_DEBT_REFERENCE_PREFIX = 'driver_debt:'

export async function POST(req: Request) {
    if (!ASAAS_WEBHOOK_TOKEN || req.headers.get('asaas-access-token') !== ASAAS_WEBHOOK_TOKEN) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const payload = (await req.json()) as AsaasWebhookPayload
    const payment = payload.payment

    // Cobrança avulsa de quitação de dívida de pós-pago (motorista) — não
    // tem assinatura vinculada, identificada pelo externalReference gravado
    // na hora de criar a cobrança (POST /api/driver-debt/pay).
    if (!payment?.subscription && payment?.externalReference?.startsWith(DRIVER_DEBT_REFERENCE_PREFIX)) {
        if (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED') {
            const driverId = payment.externalReference.slice(DRIVER_DEBT_REFERENCE_PREFIX.length)
            const { error } = await supabaseAdmin
                .from('driver_postpaid_charges')
                .insert({
                    driver_id: driverId,
                    type: 'payment',
                    amount: -Number(payment.value),
                    asaas_payment_id: payment.id,
                })
            // Índice único em asaas_payment_id (type='payment') torna
            // reentrega do mesmo evento inofensiva.
            if (error && error.code !== '23505') {
                console.error('Erro ao registrar quitação de pós-pago:', error)
                return NextResponse.json({ error: error.message }, { status: 500 })
            }
        }
        return NextResponse.json({ ok: true })
    }

    // Eventos que não são de pagamento (ou pagamento avulso não reconhecido,
    // sem assinatura vinculada) não interessam aqui — responde 200 pra
    // Asaas não ficar reentregando o mesmo evento pra sempre.
    if (!payment?.subscription) {
        return NextResponse.json({ ok: true })
    }

    try {
        const { data: subscription } = await supabaseAdmin
            .from('subscriptions')
            .select('id, user_id, plan_id')
            .eq('asaas_subscription_id', payment.subscription)
            .maybeSingle()

        if (!subscription) {
            return NextResponse.json({ ok: true }) // assinatura de outro ambiente/teste — ignora
        }

        if (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED') {
            const asaasSub = await getSubscription(payment.subscription)

            await supabaseAdmin
                .from('subscriptions')
                .update({
                    status: 'active',
                    current_period_end: asaasSub.nextDueDate ? new Date(asaasSub.nextDueDate).toISOString() : null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', subscription.id)

            // Usa o valor REALMENTE cobrado nesse pagamento (payment.value),
            // nunca o preço atual da tabela de planos — a Asaas não recobra
            // assinaturas existentes quando o admin muda o preço de um plano,
            // então usar o preço "atual" prometeria comissão maior do que o
            // dinheiro que de fato entrou (descoberto testando na prática:
            // preço subiu de R$5 pra R$50 com uma assinatura já pendente,
            // que continuou cobrando R$5 — mas a comissão ia creditar como
            // se fosse R$50).
            await creditReferralCommission({
                payingUserId: subscription.user_id,
                subscriptionId: subscription.id,
                paymentId: payment.id,
                paymentValue: Number(payment.value),
            })

            // Registro do pagamento de verdade recebido — a aba de
            // pagamentos do admin usa isso pra separar receita real de
            // plano concedido de graça. Índice único em asaas_payment_id
            // torna reentrega do mesmo evento inofensiva.
            const { error: paymentLedgerError } = await supabaseAdmin
                .from('subscription_payments')
                .insert({
                    subscription_id: subscription.id,
                    asaas_payment_id: payment.id,
                    amount: Number(payment.value),
                })
            if (paymentLedgerError && paymentLedgerError.code !== '23505') {
                console.error('Erro ao registrar pagamento de assinatura:', paymentLedgerError)
            }
        } else if (payload.event === 'PAYMENT_OVERDUE') {
            await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due', updated_at: new Date().toISOString() })
                .eq('id', subscription.id)
        }

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('Erro ao processar webhook Asaas:', err)
        // 500 faz a Asaas reentregar o evento depois — melhor que perder o
        // evento silenciosamente numa falha transitória (ex: banco fora do ar).
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// Comissão de indicação: só 1 nível, nunca em cascata — lê upline_id de
// quem pagou e para por aí. Nunca lê o upline_id do upline.
async function creditReferralCommission(params: {
    payingUserId: string
    subscriptionId: string
    paymentId: string
    paymentValue: number
}) {
    const { data: payingProfile } = await supabaseAdmin
        .from('profiles')
        .select('upline_id')
        .eq('id', params.payingUserId)
        .maybeSingle()

    if (!payingProfile?.upline_id) return

    const { error } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
            user_id: payingProfile.upline_id,
            type: 'commission_credit',
            amount: params.paymentValue * 0.5,
            source_subscription_id: params.subscriptionId,
            source_payment_id: params.paymentId,
            description: 'Comissão de indicação (50% da mensalidade)',
        })

    // Índice único em source_payment_id ignora silenciosamente reentrega
    // do mesmo evento — só loga se for um erro de verdade (outro motivo).
    if (error && error.code !== '23505') {
        console.error('Erro ao creditar comissão de indicação:', error)
    }
}

