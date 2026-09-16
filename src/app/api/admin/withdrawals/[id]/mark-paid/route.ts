// app/api/admin/withdrawals/[id]/mark-paid/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { action } = await req.json()
    if (action !== 'paid' && action !== 'reject') {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { id } = await params
    const { data: withdrawal, error: fetchError } = await supabaseAdmin
        .from('withdrawal_requests')
        .select('id, user_id, amount, status')
        .eq('id', id)
        .single()

    if (fetchError || !withdrawal) {
        return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }
    // 'failed' também pode chegar aqui: a Asaas recusou o saque automático,
    // o admin resolveu na mão (ou tentou de novo) e está só registrando.
    if (withdrawal.status !== 'pending' && withdrawal.status !== 'failed') {
        return NextResponse.json({ error: 'Esse pedido já foi resolvido' }, { status: 400 })
    }

    if (action === 'reject') {
        const { error } = await supabaseAdmin
            .from('withdrawal_requests')
            .update({ status: 'rejected', resolved_at: new Date().toISOString(), resolved_by: admin.id })
            .eq('id', id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    // "paid" significa: o admin já fez a transferência PIX de verdade, fora
    // do sistema, e está só registrando aqui. Marca o pedido e debita da
    // carteira (o saldo é a soma dos lançamentos, não uma coluna à parte).
    const { error: updateError } = await supabaseAdmin
        .from('withdrawal_requests')
        .update({ status: 'paid', resolved_at: new Date().toISOString(), resolved_by: admin.id })
        .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const { error: debitError } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
            user_id: withdrawal.user_id,
            type: 'withdrawal_debit',
            amount: -Number(withdrawal.amount),
            withdrawal_request_id: withdrawal.id,
            description: 'Saque via PIX',
        })

    if (debitError) return NextResponse.json({ error: debitError.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
