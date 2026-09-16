// app/api/admin/plan-codes/create/route.ts
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { planCode, grantType, days, maxUses } = await req.json()
    if (grantType !== 'days' && grantType !== 'lifetime') {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    if (grantType === 'days' && (!Number.isInteger(days) || days <= 0)) {
        return NextResponse.json({ error: 'Informe a quantidade de dias' }, { status: 400 })
    }

    const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('code', planCode)
        .maybeSingle()

    if (planError || !plan) {
        return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    }

    const code = crypto.randomBytes(5).toString('hex')

    const { data, error } = await supabaseAdmin
        .from('plan_codes')
        .insert({
            code,
            plan_id: plan.id,
            grant_type: grantType,
            days: grantType === 'days' ? days : null,
            max_uses: Number.isInteger(maxUses) && maxUses > 0 ? maxUses : 1,
            created_by: admin.id,
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
}
