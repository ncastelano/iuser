// app/api/admin/expenses/asaas-overview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { getBalance } from '@/lib/asaas'

// Mapeamento financeiro do Asaas pro painel Financeiro > Asaas: o que está
// na conta Asaas de verdade (externo, via API deles), o que está no nosso
// banco (assinaturas + pós-pago) e o que devemos/nos devem (carteira +
// dívida de pós-pago). Tudo calculado em get_asaas_financial_overview()
// (uma função só, ver migration 20261012000000) exceto o saldo Asaas, que
// só existe do lado deles.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin.rpc('get_asaas_financial_overview')
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Saldo da conta Asaas é best-effort: se a chave não estiver configurada
    // ou a chamada falhar, o resto do painel (tudo que vem do nosso banco)
    // continua funcionando normalmente.
    let asaasBalance: number | null = null
    let asaasBalanceError: string | null = null
    try {
        const balance = await getBalance()
        asaasBalance = balance.balance
    } catch (err: any) {
        asaasBalanceError = err.message || 'Erro ao consultar saldo na Asaas'
    }

    const isSandbox = (process.env.ASAAS_API_BASE_URL || 'https://sandbox.asaas.com/api/v3').includes('sandbox')

    // Linha "Asaas" de service_expenses (taxa por transação, notas etc) —
    // mesmo padrão do card do Supabase: custo e mapeamento de uso juntos,
    // num card só, em vez de espalhado pela lista genérica de outros serviços.
    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .eq('service_name', 'Asaas')
        .maybeSingle()

    // Atividade recente: o que de fato aconteceu na Asaas, não só os totais
    // agregados acima — cada linha aqui corresponde a uma cobrança ou
    // transferência real que passou pela API deles (asaas_payment_id /
    // asaas_transfer_id), pra dar rastreabilidade de "o que foi feito lá".
    const [subPayments, postpaidPayments, paidWithdrawals] = await Promise.all([
        supabaseAdmin
            .from('subscription_payments')
            .select('id, amount, created_at, asaas_payment_id, subscriptions(profiles:user_id(name), plans(name))')
            .order('created_at', { ascending: false })
            .limit(15),
        supabaseAdmin
            .from('driver_postpaid_charges')
            .select('id, amount, created_at, asaas_payment_id, profiles:driver_id(name)')
            .eq('type', 'payment')
            .order('created_at', { ascending: false })
            .limit(15),
        supabaseAdmin
            .from('withdrawal_requests')
            .select('id, amount, resolved_at, asaas_transfer_id, profiles:user_id(name)')
            .eq('status', 'paid')
            .order('resolved_at', { ascending: false })
            .limit(15),
    ])

    const activity = [
        ...(subPayments.data || []).map((p: any) => ({
            type: 'subscription_payment' as const,
            date: p.created_at,
            amount: Number(p.amount),
            personName: p.subscriptions?.profiles?.name || null,
            detail: p.subscriptions?.plans?.name || null,
            asaasId: p.asaas_payment_id,
        })),
        ...(postpaidPayments.data || []).map((p: any) => ({
            type: 'postpaid_payment' as const,
            date: p.created_at,
            amount: Math.abs(Number(p.amount)),
            personName: p.profiles?.name || null,
            detail: null,
            asaasId: p.asaas_payment_id,
        })),
        ...(paidWithdrawals.data || []).map((w: any) => ({
            type: 'withdrawal' as const,
            date: w.resolved_at,
            amount: Number(w.amount),
            personName: w.profiles?.name || null,
            detail: null,
            asaasId: w.asaas_transfer_id,
        })),
    ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)

    return NextResponse.json({
        ...data,
        asaasBalance,
        asaasBalanceError,
        isSandbox,
        expense: expenseRow || null,
        activity,
    })
}
