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

    return NextResponse.json({
        ...data,
        asaasBalance,
        asaasBalanceError,
        isSandbox,
        expense: expenseRow || null,
    })
}
