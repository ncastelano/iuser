// app/api/admin/pix-keys/set-default/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { id } = await req.json()
    if (!id) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: key, error: keyError } = await supabaseAdmin
        .from('admin_pix_keys')
        .select('id, pix_key, pix_key_type, receiver_name')
        .eq('id', id)
        .single()

    if (keyError || !key) {
        return NextResponse.json({ error: 'Chave não encontrada' }, { status: 404 })
    }

    await supabaseAdmin.from('admin_pix_keys').update({ is_default: false }).eq('is_default', true)
    const { error } = await supabaseAdmin.from('admin_pix_keys').update({ is_default: true }).eq('id', id)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabaseAdmin
        .from('store_access_settings')
        .update({
            pix_key: key.pix_key,
            pix_key_type: key.pix_key_type,
            pix_receiver_name: key.receiver_name,
            updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

    return NextResponse.json({ success: true })
}
