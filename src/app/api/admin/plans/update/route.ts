// app/api/admin/plans/update/route.ts
//
// Edita texto/config de um plano já existente — tudo exceto o código
// (imutável após criado, pra não desincronizar quem já guarda esse code)
// e o preço (fica exclusivo de /api/admin/plans/update-price, que tem o
// efeito colateral de propagar pra quem já é assinante via Asaas).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const planId = body.planId
    if (!planId) {
        return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
    }

    const name = String(body.name || '').trim()
    if (!name) {
        return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const updates = {
        name,
        description: body.description ? String(body.description).trim() : null,
        features: Array.isArray(body.features) ? body.features.filter((f: unknown) => typeof f === 'string' && f.trim()) : null,
        billing_cycle: body.billingCycle || 'MONTHLY',
        max_active_subscriptions: body.maxActiveSubscriptions ? Number(body.maxActiveSubscriptions) : null,
        grants_driver: !!body.grantsDriver,
        grants_provider: !!body.grantsProvider,
        grants_store: !!body.grantsStore,
        grants_recruiter: !!body.grantsRecruiter,
        is_active: body.isActive !== false,
    }

    const { data: plan, error } = await supabaseAdmin
        .from('plans')
        .update(updates)
        .eq('id', planId)
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, plan })
}
