// app/api/admin/plans/grant/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { profileSlug, planCode, days } = await req.json()
    const daysNumber = Number(days)
    if (!profileSlug || !planCode || !daysNumber || daysNumber <= 0) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('profileSlug', profileSlug)
        .maybeSingle()

    if (profileError || !profile) {
        return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    }

    const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('code', planCode)
        .maybeSingle()

    if (planError || !plan) {
        return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    }

    const currentPeriodEnd = new Date(Date.now() + daysNumber * 24 * 60 * 60 * 1000).toISOString()

    // Já pode existir uma assinatura em aberto pra esse mesmo plano (o
    // índice único do banco não deixaria inserir outra) — nesse caso
    // estende/sobrescreve em vez de duplicar.
    const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', profile.id)
        .eq('plan_id', plan.id)
        .in('status', ['pending', 'active'])
        .maybeSingle()

    const { error } = existing
        ? await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'active',
                source: 'admin_grant',
                current_period_end: currentPeriodEnd,
                granted_by: admin.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        : await supabaseAdmin
            .from('subscriptions')
            .insert({
                user_id: profile.id,
                plan_id: plan.id,
                status: 'active',
                source: 'admin_grant',
                current_period_end: currentPeriodEnd,
                granted_by: admin.id,
            })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
