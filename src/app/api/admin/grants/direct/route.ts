// app/api/admin/grants/direct/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Concede acesso direto a uma conta específica, sem ela precisar de um
// código ou pagar - equivalente a gerar+resgatar um código na hora.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { profileSlug, grantType, days } = await req.json()
    if (!profileSlug || (grantType !== 'days' && grantType !== 'lifetime')) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }
    if (grantType === 'days' && (!Number.isInteger(days) || days <= 0)) {
        return NextResponse.json({ error: 'Informe a quantidade de dias' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('profileSlug', String(profileSlug).trim())
        .maybeSingle()

    if (profileError || !profile) {
        return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
        .from('store_access_grants')
        .insert({
            profile_id: profile.id,
            source: 'code',
            source_code_id: null,
            grant_type: grantType,
            days: grantType === 'days' ? days : null,
            status: 'approved',
            reviewed_by: admin.id,
            reviewed_at: new Date().toISOString(),
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ grant: data })
}
