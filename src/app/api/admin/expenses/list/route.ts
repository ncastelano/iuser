// app/api/admin/expenses/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Serviços pagos (Supabase, Asaas, Mapbox, Firebase, hospedagem etc) que o
// iUser depende pra continuar no ar — aba "Financeiro" do admin. Também
// devolve a receita recorrente mensal (soma do monthlyRevenue por plano,
// mesmo cálculo já usado em /api/admin/subscriptions/list) pra comparar
// gasto x receita numa tacada só.
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

    const { data: subscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('status, current_period_end, plans(price)')
        .eq('status', 'active')

    const now = new Date()
    const monthlyRevenue = (subscriptions || []).reduce((sum, s: any) => {
        const isActive = !s.current_period_end || new Date(s.current_period_end) > now
        if (!isActive) return sum
        const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
        return sum + (plan ? Number(plan.price) : 0)
    }, 0)

    return NextResponse.json({ expenses: expenses || [], monthlyRevenue })
}
