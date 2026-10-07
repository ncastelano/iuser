// app/api/admin/grants/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const GRANTED_SOURCES = ['admin_grant', 'leader_grant', 'code', 'free_trial']

// Admin → Concedidos: todas as assinaturas dadas sem cobrança (admin, liderança, código, brinde), com quem
// concedeu, quando começou, quando acaba e o motivo — mais o resumo e os planos que dá pra conceder.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('id, user_id, status, source, starts_at, current_period_end, created_at, granted_by, granted_reason, plans(code, name, price), profiles!subscriptions_user_id_fkey(name, profileSlug)')
        .in('source', GRANTED_SOURCES)
        .order('created_at', { ascending: false })
        .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data || []
    const granterIds = [...new Set(rows.map((r: any) => r.granted_by).filter(Boolean))] as string[]
    const { data: granters } = granterIds.length
        ? await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('id', granterIds)
        : { data: [] as any[] }
    const granterById = new Map((granters || []).map((g: any) => [g.id, g]))

    const now = Date.now()
    const isActive = (r: any) => r.status === 'active' && (!r.current_period_end || new Date(r.current_period_end).getTime() > now)
    const grants = rows.map((r: any) => {
        const plan = Array.isArray(r.plans) ? r.plans[0] : r.plans
        const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        const g: any = r.granted_by ? granterById.get(r.granted_by) : null
        return {
            id: r.id,
            status: r.status,
            active: isActive(r),
            source: r.source,
            planCode: plan?.code,
            planName: plan?.name,
            personName: profile?.name || null,
            personSlug: profile?.profileSlug || null,
            startsAt: r.starts_at,
            endsAt: r.current_period_end,
            createdAt: r.created_at,
            grantedByName: g?.name || null,
            grantedBySlug: g?.profileSlug || null,
            reason: r.granted_reason,
        }
    })

    // Resumo dos ativos por plano
    const byPlan = new Map<string, { code: string; name: string; count: number }>()
    for (const g of grants) {
        if (!g.active || !g.planCode) continue
        const e = byPlan.get(g.planCode) || { code: g.planCode, name: g.planName, count: 0 }
        e.count += 1
        byPlan.set(g.planCode, e)
    }

    // Planos que o administrador pode conceder
    const { data: grantable } = await supabaseAdmin.rpc('get_grantable_plans', { p_actor: admin.id })

    return NextResponse.json({
        grants,
        activeCount: grants.filter((g) => g.active).length,
        plans: Array.from(byPlan.values()),
        grantable: ((grantable as any[]) || []).map((p) => ({ code: p.code, name: p.name })),
    })
}
