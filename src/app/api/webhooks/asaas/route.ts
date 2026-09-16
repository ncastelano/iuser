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
    }
}

export async function POST(req: Request) {
    if (!ASAAS_WEBHOOK_TOKEN || req.headers.get('asaas-access-token') !== ASAAS_WEBHOOK_TOKEN) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const payload = (await req.json()) as AsaasWebhookPayload
    const payment = payload.payment

    // Eventos que não são de pagamento (ou pagamento avulso, sem
    // assinatura vinculada) não interessam aqui — responde 200 pra Asaas
    // não ficar reentregando o mesmo evento pra sempre.
    if (!payment?.subscription) {
        return NextResponse.json({ ok: true })
    }

    try {
        const { data: subscription } = await supabaseAdmin
            .from('subscriptions')
            .select('id, user_id, plan_id, plans(code, price)')
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

            const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans

            await creditReferralCommission({
                payingUserId: subscription.user_id,
                subscriptionId: subscription.id,
                paymentId: payment.id,
                planPrice: plan?.price ? Number(plan.price) : Number(payment.value),
            })

            // Combo dá acesso de loja de verdade, através do paywall já
            // existente (create_store_with_access) — concede um grant se
            // o usuário ainda não tiver um aprovado e não consumido.
            if (plan?.code === 'combo') {
                await grantStoreAccessForCombo(subscription.user_id)
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
    planPrice: number
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
            amount: params.planPrice * 0.5,
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

async function grantStoreAccessForCombo(userId: string) {
    const { data: existingGrant } = await supabaseAdmin
        .from('store_access_grants')
        .select('id')
        .eq('profile_id', userId)
        .eq('status', 'approved')
        .is('store_id', null)
        .maybeSingle()

    if (existingGrant) return // já tem um grant disponível, não duplica

    const { error } = await supabaseAdmin
        .from('store_access_grants')
        .insert({
            profile_id: userId,
            source: 'combo_subscription',
            grant_type: 'lifetime',
            status: 'approved',
            reviewed_at: new Date().toISOString(),
        })

    if (error) {
        console.error('Erro ao conceder acesso de loja via combo:', error)
    }
}
