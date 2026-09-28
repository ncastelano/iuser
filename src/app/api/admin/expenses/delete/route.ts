// app/api/admin/expenses/delete/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { id } = await req.json().catch(() => ({}))
    if (!id) {
        return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('service_expenses').delete().eq('id', id)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
