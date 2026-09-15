// app/api/admin/permissions/set/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { profileSlug, canGenerateCodes } = await req.json()
    if (!profileSlug || typeof canGenerateCodes !== 'boolean') {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('profileSlug', String(profileSlug).trim())
        .maybeSingle()

    if (profileError || !profile) {
        return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            can_generate_store_codes: canGenerateCodes,
            store_codes_granted_by: canGenerateCodes ? admin.id : null,
            store_codes_granted_at: canGenerateCodes ? new Date().toISOString() : null,
        })
        .eq('id', profile.id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
