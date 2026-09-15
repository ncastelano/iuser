// app/api/admin/codes/create/route.ts
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireCodeGenerator } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const auth = await requireCodeGenerator(req)
    if (!auth) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { grantType, days } = await req.json()
    if (grantType !== 'days' && grantType !== 'lifetime') {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    if (grantType === 'days' && (!Number.isInteger(days) || days <= 0)) {
        return NextResponse.json({ error: 'Informe a quantidade de dias' }, { status: 400 })
    }

    const code = crypto.randomBytes(5).toString('hex')

    const { data, error } = await supabaseAdmin
        .from('store_access_codes')
        .insert({
            code,
            grant_type: grantType,
            days: grantType === 'days' ? days : null,
            created_by: auth.user.id,
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
}
