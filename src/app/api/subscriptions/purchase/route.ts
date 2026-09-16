// app/api/subscriptions/purchase/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createOrGetCustomer, createSubscription, getFirstPaymentForSubscription, getPixQrCodeForPayment, ensureCustomerCpfCnpj } from '@/lib/asaas'

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

        const { planId, cpfCnpj } = await req.json()
        if (!planId) {
            return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('plans')
            .select('id, code, name, price, is_active, billing_cycle, max_active_subscriptions, promo_price, promo_starts_at, promo_ends_at')
            .eq('id', planId)
            .maybeSingle()

        if (planError || !plan || !plan.is_active) {
            return NextResponse.json({ error: 'Plano inválido' }, { status: 404 })
        }

        // Promoção temporária: nunca confia no que o client mandou — recalcula
        // a janela aqui. Fora da janela, cobra o preço normal mesmo.
        const now = Date.now()
        const promoActive = plan.promo_price && plan.promo_starts_at && plan.promo_ends_at
            && now >= new Date(plan.promo_starts_at).getTime()
            && now <= new Date(plan.promo_ends_at).getTime()
        const chargeValue = promoActive ? Number(plan.promo_price) : Number(plan.price)

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

        // Vagas limitadas (ex: plano Beta, 20 vagas) — só barra quem está
        // tentando abrir uma assinatura nova; quem já tinha uma pendente
        // (contada aqui embaixo) pode terminar de pagar normalmente.
        if (plan.max_active_subscriptions != null && !existing) {
            const { count } = await supabaseAdmin
                .from('subscriptions')
                .select('id', { count: 'exact', head: true })
                .eq('plan_id', plan.id)
                .in('status', ['pending', 'active'])

            if ((count || 0) >= plan.max_active_subscriptions) {
                return NextResponse.json({ error: 'Vagas desse plano esgotadas' }, { status: 409 })
            }
        }

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('name, cpf_cnpj')
            .eq('id', user.id)
            .maybeSingle()

        // A Asaas exige CPF/CNPJ pra criar a cobrança de verdade — se o
        // perfil ainda não tem e o cliente não mandou um agora, devolve um
        // sinal específico (needsCpf) pra tela pedir e reenviar, em vez de
        // um erro genérico.
        const cpfCnpjClean = (cpfCnpj || '').replace(/\D/g, '')
        const resolvedCpfCnpj = profile?.cpf_cnpj || cpfCnpjClean || null
        if (!resolvedCpfCnpj) {
            return NextResponse.json({ error: 'Informe seu CPF ou CNPJ pra continuar', needsCpf: true }, { status: 400 })
        }
        if (cpfCnpjClean && cpfCnpjClean !== profile?.cpf_cnpj) {
            await supabaseAdmin.from('profiles').update({ cpf_cnpj: cpfCnpjClean }).eq('id', user.id)
        }

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

            let customer: { id: string }
            if (previousSub?.asaas_customer_id) {
                customer = { id: previousSub.asaas_customer_id }
                // O customer pode ter sido criado antes da gente coletar o
                // CPF (ou de exigir isso) — garante que está preenchido lá
                // antes de tentar cobrar, senão a Asaas rejeita de novo.
                await ensureCustomerCpfCnpj(customer.id, resolvedCpfCnpj)
            } else {
                customer = await createOrGetCustomer({
                    name: profile?.name || user.email || 'Usuário iuser',
                    email: user.email,
                    cpfCnpj: resolvedCpfCnpj,
                    externalReference: user.id,
                })
            }

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
                value: chargeValue,
                description: `iuser — ${plan.name}`,
                externalReference: subscriptionRowId,
                cycle: plan.billing_cycle,
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
            invoiceUrl: payment.invoiceUrl,
        })
    } catch (err: any) {
        console.error('Erro ao criar assinatura:', err)
        return NextResponse.json({ error: err.message || 'Erro ao criar assinatura' }, { status: 500 })
    }
}
