// app/api/subscriptions/purchase/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createOrGetCustomer, createSubscription, getFirstPaymentForSubscription, getPixQrCodeForPayment } from '@/lib/asaas'

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || ''
        const token = authHeader.replace('Bearer ', '')
        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { planId } = await req.json()
        if (!planId) {
            return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('plans')
            .select('id, code, name, price, is_active')
            .eq('id', planId)
            .maybeSingle()

        if (planError || !plan || !plan.is_active) {
            return NextResponse.json({ error: 'Plano inválido' }, { status: 404 })
        }

        // Se já existe uma assinatura "em aberto" (pendente ou ativa) pra
        // esse plano, reaproveita em vez de tentar criar outra (o índice
        // único do banco rejeitaria de qualquer forma).
        const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('id, status, asaas_subscription_id')
            .eq('user_id', user.id)
            .eq('plan_id', plan.id)
            .in('status', ['pending', 'active'])
            .maybeSingle()

        if (existing?.status === 'active') {
            return NextResponse.json({ error: 'Você já tem esse plano ativo' }, { status: 409 })
        }

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('name')
            .eq('id', user.id)
            .maybeSingle()

        let subscriptionRowId: string
        let asaasSubscriptionId: string

        if (existing?.asaas_subscription_id) {
            // Retomando uma compra pendente — não cria assinatura nova na
            // Asaas, só busca de novo o QR do pagamento já existente.
            subscriptionRowId = existing.id
            asaasSubscriptionId = existing.asaas_subscription_id
        } else {
            // Reaproveita o customer Asaas de uma assinatura anterior desse
            // mesmo usuário, se existir, em vez de criar um novo toda vez.
            const { data: previousSub } = await supabaseAdmin
                .from('subscriptions')
                .select('asaas_customer_id')
                .eq('user_id', user.id)
                .not('asaas_customer_id', 'is', null)
                .limit(1)
                .maybeSingle()

            const customer = previousSub?.asaas_customer_id
                ? { id: previousSub.asaas_customer_id }
                : await createOrGetCustomer({
                    name: profile?.name || user.email || 'Usuário iuser',
                    email: user.email,
                    externalReference: user.id,
                })

            const { data: subRow, error: subInsertError } = existing
                ? await supabaseAdmin
                    .from('subscriptions')
                    .update({ asaas_customer_id: customer.id })
                    .eq('id', existing.id)
                    .select('id')
                    .single()
                : await supabaseAdmin
                    .from('subscriptions')
                    .insert({ user_id: user.id, plan_id: plan.id, status: 'pending', asaas_customer_id: customer.id })
                    .select('id')
                    .single()

            if (subInsertError || !subRow) {
                return NextResponse.json({ error: 'Erro ao registrar assinatura' }, { status: 500 })
            }
            subscriptionRowId = subRow.id

            const asaasSubscription = await createSubscription({
                customerId: customer.id,
                value: Number(plan.price),
                description: `iuser — ${plan.name}`,
                externalReference: subscriptionRowId,
            })
            asaasSubscriptionId = asaasSubscription.id

            await supabaseAdmin
                .from('subscriptions')
                .update({ asaas_subscription_id: asaasSubscriptionId, updated_at: new Date().toISOString() })
                .eq('id', subscriptionRowId)
        }

        const payment = await getFirstPaymentForSubscription(asaasSubscriptionId)
        if (!payment) {
            return NextResponse.json({ error: 'Pagamento da assinatura não encontrado' }, { status: 500 })
        }

        const pix = await getPixQrCodeForPayment(payment.id)

        return NextResponse.json({
            subscriptionId: subscriptionRowId,
            pixQrCodeImage: pix.encodedImage,
            pixCopyPaste: pix.payload,
            expirationDate: pix.expirationDate,
        })
    } catch (err: any) {
        console.error('Erro ao criar assinatura:', err)
        return NextResponse.json({ error: err.message || 'Erro ao criar assinatura' }, { status: 500 })
    }
}
