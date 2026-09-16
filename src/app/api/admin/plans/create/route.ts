// app/api/admin/plans/create/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const CODE_PATTERN = /^[a-z0-9_]{2,40}$/

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const code = String(body.code || '').trim().toLowerCase()
    const name = String(body.name || '').trim()
    const price = Number(body.price)
    const description = body.description ? String(body.description).trim() : null
    const features = Array.isArray(body.features) ? body.features.filter((f: unknown) => typeof f === 'string' && f.trim()) : null
    const billingCycle = body.billingCycle || 'MONTHLY'
    const maxActiveSubscriptions = body.maxActiveSubscriptions ? Number(body.maxActiveSubscriptions) : null

    if (!CODE_PATTERN.test(code)) {
        return NextResponse.json({ error: 'Código inválido — use só letras minúsculas, números e "_" (2 a 40 caracteres)' }, { status: 400 })
    }
    if (!name || !price || price <= 0) {
        return NextResponse.json({ error: 'Nome e preço são obrigatórios' }, { status: 400 })
    }

    const { data: plan, error } = await supabaseAdmin
        .from('plans')
        .insert({
            code,
            name,
            price,
            description,
            features,
            billing_cycle: billingCycle,
            max_active_subscriptions: maxActiveSubscriptions,
            grants_driver: !!body.grantsDriver,
            grants_provider: !!body.grantsProvider,
            grants_store: !!body.grantsStore,
            grants_recruiter: !!body.grantsRecruiter,
            is_active: body.isActive !== false,
        })
        .select()
        .single()

    if (error) {
        const message = error.code === '23505' ? 'Já existe um plano com esse código' : error.message
        return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ success: true, plan })
}
