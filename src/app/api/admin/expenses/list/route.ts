// app/api/admin/expenses/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Serviços pagos (Supabase, Asaas, Mapbox, Firebase, hospedagem etc) que o
// iUser depende pra continuar no ar — aba "Financeiro" do admin. Também
// devolve o lucro mensal de verdade (não o MRR bruto): receita de
// assinatura + pós-pago já recebida esse mês, menos a comissão de
// indicação creditada esse mês (repasse pra quem indicou — não é receita
// da iUser, é dinheiro que já nasce devido a outra pessoa). Mesmos números
// de get_asaas_financial_overview() usados no painel Financeiro > Asaas,
// pra não ter dois cálculos de lucro diferentes no mesmo admin.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data: expenses, error } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .order('is_active', { ascending: false })
        .order('next_due_date', { ascending: true, nullsFirst: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: overview } = await supabaseAdmin.rpc('get_asaas_financial_overview')
    const monthlyRevenue = Number(overview?.subscription_revenue_this_month || 0)
        + Number(overview?.postpaid_collected_this_month || 0)
        - Number(overview?.commission_credited_this_month || 0)

    return NextResponse.json({ expenses: expenses || [], monthlyRevenue })
}
