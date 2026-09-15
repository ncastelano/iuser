// app/api/admin/pix-keys/delete/route.ts
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
        .select('id, is_default')
        .eq('id', id)
        .single()

    if (keyError || !key) {
        return NextResponse.json({ error: 'Chave não encontrada' }, { status: 404 })
    }
    if (key.is_default) {
        return NextResponse.json({ error: 'Defina outra chave como padrão antes de excluir esta' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('admin_pix_keys').delete().eq('id', id)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
