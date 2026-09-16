// app/api/wallet/request-withdrawal/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createTransfer, type AsaasPixKeyType } from '@/lib/asaas'

// Abaixo desse valor, a taxa fixa que a Asaas cobra por transferência PIX
// comeria uma fatia grande demais do saque — trava aqui em vez de deixar a
// pessoa sacar um valor que não compensa.
const MIN_WITHDRAWAL_AMOUNT = 20

const PIX_KEY_TYPE_MAP: Record<string, AsaasPixKeyType> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'EMAIL',
    phone: 'PHONE',
    random: 'EVP',
}

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

        const { amount, pixKey, pixKeyType } = await req.json()
        const amountNumber = Number(amount)
        const mappedPixKeyType = PIX_KEY_TYPE_MAP[String(pixKeyType || '').toLowerCase()]
        if (!amountNumber || amountNumber <= 0 || !pixKey || !mappedPixKeyType) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
        }
        if (amountNumber < MIN_WITHDRAWAL_AMOUNT) {
            return NextResponse.json({ error: `Valor mínimo de saque: R$ ${MIN_WITHDRAWAL_AMOUNT.toFixed(2)}` }, { status: 400 })
        }

        // Recalcula o saldo real no servidor — nunca confia num valor vindo
        // do cliente.
        const { data: transactions, error: txError } = await supabaseAdmin
            .from('wallet_transactions')
            .select('amount')
            .eq('user_id', user.id)

        if (txError) {
            return NextResponse.json({ error: txError.message }, { status: 500 })
        }

        const balance = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0)
        if (amountNumber > balance) {
            return NextResponse.json({ error: 'Saldo insuficiente' }, { status: 400 })
        }

        // Grava o pedido como 'pending' antes de chamar a Asaas — fica um
        // registro de auditoria mesmo se a chamada cair no meio do caminho
        // (timeout, instabilidade), em vez de dinheiro sair sem rastro.
        const { data: withdrawal, error: insertError } = await supabaseAdmin
            .from('withdrawal_requests')
            .insert({
                user_id: user.id,
                amount: amountNumber,
                pix_key: pixKey,
                pix_key_type: pixKeyType,
            })
            .select('id')
            .single()

        if (insertError || !withdrawal) {
            return NextResponse.json({ error: insertError?.message || 'Erro ao registrar saque' }, { status: 500 })
        }

        try {
            const transfer = await createTransfer({
                value: amountNumber,
                pixKey,
                pixKeyType: mappedPixKeyType,
                description: 'Saque de comissão — iuser',
            })

            // Só debita a carteira depois da Asaas confirmar que aceitou a
            // transferência — mesma regra de saldo = SUM(wallet_transactions),
            // nunca uma coluna solta que possa dessincronizar.
            await supabaseAdmin
                .from('withdrawal_requests')
                .update({ status: 'paid', resolved_at: new Date().toISOString(), asaas_transfer_id: transfer.id })
                .eq('id', withdrawal.id)

            const { error: debitError } = await supabaseAdmin
                .from('wallet_transactions')
                .insert({
                    user_id: user.id,
                    type: 'withdrawal_debit',
                    amount: -amountNumber,
                    withdrawal_request_id: withdrawal.id,
                    description: 'Saque via PIX',
                })

            if (debitError) {
                console.error('Transferência enviada mas falhou ao debitar a carteira:', debitError)
            }

            return NextResponse.json({ success: true, status: 'paid' })
        } catch (transferErr: any) {
            // A Asaas recusou (saldo insuficiente na conta da plataforma,
            // chave Pix inválida etc) — fica 'failed' pra alguém revisar,
            // sem debitar nada do saldo da pessoa.
            await supabaseAdmin
                .from('withdrawal_requests')
                .update({ status: 'failed', failure_reason: transferErr.message || 'Erro desconhecido' })
                .eq('id', withdrawal.id)

            console.error('Erro ao transferir saque via Asaas:', transferErr)
            return NextResponse.json({
                error: 'Não foi possível processar o saque automaticamente agora. Ele fica registrado e alguém vai revisar.',
            }, { status: 502 })
        }
    } catch (err: any) {
        console.error('Erro ao solicitar saque:', err)
        return NextResponse.json({ error: err.message || 'Erro ao solicitar saque' }, { status: 500 })
    }
}
