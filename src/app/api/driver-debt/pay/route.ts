// app/api/driver-debt/pay/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createOrGetCustomer, ensureCustomerCpfCnpj, createOnePixPayment, getPixQrCodeForPayment } from '@/lib/asaas'

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

        // A dívida é sempre calculada no servidor — nunca confia num valor
        // vindo do cliente.
        const { data: debtRows } = await supabaseAdmin
            .from('driver_postpaid_charges')
            .select('amount')
            .eq('driver_id', user.id)

        const debt = (debtRows || []).reduce((acc, r) => acc + Number(r.amount), 0)
        if (debt <= 0) {
            return NextResponse.json({ error: 'Nenhuma dívida pendente' }, { status: 400 })
        }

        const { cpfCnpj } = await req.json().catch(() => ({ cpfCnpj: undefined }))

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('name, cpf_cnpj')
            .eq('id', user.id)
            .maybeSingle()

        const cpfCnpjClean = (cpfCnpj || '').replace(/\D/g, '')
        const resolvedCpfCnpj = profile?.cpf_cnpj || cpfCnpjClean || null
        if (!resolvedCpfCnpj) {
            return NextResponse.json({ error: 'Informe seu CPF ou CNPJ pra continuar', needsCpf: true }, { status: 400 })
        }
        if (cpfCnpjClean && cpfCnpjClean !== profile?.cpf_cnpj) {
            await supabaseAdmin.from('profiles').update({ cpf_cnpj: cpfCnpjClean }).eq('id', user.id)
        }

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
            await ensureCustomerCpfCnpj(customer.id, resolvedCpfCnpj)
        } else {
            customer = await createOrGetCustomer({
                name: profile?.name || user.email || 'Usuário iuser',
                email: user.email,
                cpfCnpj: resolvedCpfCnpj,
                externalReference: user.id,
            })
        }

        const payment = await createOnePixPayment({
            customerId: customer.id,
            value: debt,
            description: 'iuser — quitação pós-pago motorista',
            externalReference: `driver_debt:${user.id}`,
        })

        const pix = await getPixQrCodeForPayment(payment.id)

        return NextResponse.json({
            paymentId: payment.id,
            amount: debt,
            pixQrCodeImage: pix.encodedImage,
            pixCopyPaste: pix.payload,
            expirationDate: pix.expirationDate,
            invoiceUrl: payment.invoiceUrl,
        })
    } catch (err: any) {
        console.error('Erro ao criar cobrança de dívida do motorista:', err)
        return NextResponse.json({ error: err.message || 'Erro ao criar cobrança' }, { status: 500 })
    }
}
