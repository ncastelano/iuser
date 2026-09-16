// app/api/wallet/request-withdrawal/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
        if (!amountNumber || amountNumber <= 0 || !pixKey) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
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

        const { error: insertError } = await supabaseAdmin
            .from('withdrawal_requests')
            .insert({
                user_id: user.id,
                amount: amountNumber,
                pix_key: pixKey,
                pix_key_type: pixKeyType || null,
            })

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        console.error('Erro ao solicitar saque:', err)
        return NextResponse.json({ error: err.message || 'Erro ao solicitar saque' }, { status: 500 })
    }
}
