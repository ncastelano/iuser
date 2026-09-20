// app/api/admin/plans/grant/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { grantPlan } from '@/lib/benefits/server'

// Atalho do painel Admin (concessão por @slug + código do plano). Não tem
// regra própria: passa pela mesma operação central de concessão, então vale
// a mesma autorização (permissão, escopo, vagas) e a mesma auditoria.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { profileSlug, planCode, days, reason } = await req.json().catch(() => ({}))
    const daysNumber = Number(days)
    if (!profileSlug || !planCode || !Number.isInteger(daysNumber)) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const [{ data: profile }, { data: plan }] = await Promise.all([
        supabaseAdmin.from('profiles').select('id').eq('profileSlug', String(profileSlug).replace(/^@/, '')).maybeSingle(),
        supabaseAdmin.from('plans').select('id').eq('code', planCode).maybeSingle(),
    ])
    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    if (!plan) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })

    const result = await grantPlan({ actorId: user.id, targetUserId: profile.id, planId: plan.id, days: daysNumber, reason: typeof reason === 'string' ? reason.slice(0, 300) : null })
    if (!result.ok) {
        return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === 'internal_error' ? 500 : 403 })
    }
    return NextResponse.json({ success: true })
}
