// app/api/admin/roles/grant-driver-leader/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { profileSlug, isLeader } = await req.json()
    if (!profileSlug || typeof isLeader !== 'boolean') {
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

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_lider_motorista: isLeader })
        .eq('id', profile.id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
