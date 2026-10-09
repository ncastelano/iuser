// app/api/admin/points/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Admin → Pontuação. action 'list' (regras + ranking) e 'save' (peso, limite diário e ligado/desligado de uma regra).
// Mudar um peso vale daqui pra frente: o que já foi dado fica com o peso da época (a linha do livro-caixa guarda o valor).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json()

    if (body.action === 'save') {
        const points = Math.round(Number(body.points))
        if (!Number.isFinite(points) || points < 0 || points > 100000) return NextResponse.json({ error: 'Pontos de 0 a 100000' }, { status: 400 })
        const daily = body.daily_limit === null || body.daily_limit === '' || body.daily_limit === undefined ? null : Math.round(Number(body.daily_limit))
        if (daily !== null && (!Number.isFinite(daily) || daily < 1)) return NextResponse.json({ error: 'O limite por dia precisa ser 1 ou mais (ou vazio, sem limite)' }, { status: 400 })
        const { error } = await supabaseAdmin.from('point_rules').update({
            points, daily_limit: daily, is_active: !!body.is_active, updated_at: new Date().toISOString(), updated_by: admin.id,
        }).eq('action', String(body.rule))
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
    }

    const [{ data: rules, error }, { data: top }] = await Promise.all([
        supabaseAdmin.from('point_rules').select('*').order('sort_order'),
        supabaseAdmin.from('profile_points').select('profile_id, total').order('total', { ascending: false }).limit(20),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = (top || []).map((t) => t.profile_id)
    const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id, name, "profileSlug"').in('id', ids) : { data: [] as any[] }
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]))
    return NextResponse.json({
        rules: rules || [],
        ranking: (top || []).map((t) => ({ ...t, name: byId.get(t.profile_id)?.name || null, slug: byId.get(t.profile_id)?.profileSlug || null })),
    })
}
