// app/api/admin/subscriptions/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Lista quem comprou (ou ganhou) cada plano — pro admin ver quantos planos
// a própria iuser está vendendo de verdade, não só o que cada usuário vê da
// própria assinatura. summary é calculado aqui (não em SQL à parte) porque
// já lemos a mesma linha pra montar a lista — mesmo espírito dos outros
// admin routes desse arquivo, sem query extra.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, source, current_period_end, created_at, plans(code, name, price), profiles!subscriptions_user_id_fkey(name, profileSlug)')
        .order('created_at', { ascending: false })
        .limit(500)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const summaryByPlan = new Map<string, { code: string; name: string; activeCount: number; monthlyRevenue: number }>()
    for (const row of data || []) {
        const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans
        if (!plan) continue
        const isActive = row.status === 'active' && (!row.current_period_end || new Date(row.current_period_end) > new Date())
        if (!isActive) continue
        const entry = summaryByPlan.get(plan.code) || { code: plan.code, name: plan.name, activeCount: 0, monthlyRevenue: 0 }
        entry.activeCount += 1
        entry.monthlyRevenue += Number(plan.price)
        summaryByPlan.set(plan.code, entry)
    }

    return NextResponse.json({
        subscriptions: data,
        summary: Array.from(summaryByPlan.values()),
    })
}
