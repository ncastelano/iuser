// app/api/admin/feature-flags/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Liga/desliga recursos da plataforma (Admin). Só as chaves conhecidas, só o administrador.
const KNOWN_KEYS = ['store_whatsapp_bot']

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json()
    const key = String(body.key || '')
    if (!KNOWN_KEYS.includes(key)) return NextResponse.json({ error: 'Chave desconhecida' }, { status: 400 })

    const { error } = await supabaseAdmin
        .from('feature_flags')
        .upsert({ key, enabled: !!body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
}
