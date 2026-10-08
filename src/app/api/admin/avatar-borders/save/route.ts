// app/api/admin/avatar-borders/save/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const HEX = /^#[0-9a-fA-F]{6}$/
const MODES = ['auto_prepaid', 'claim', 'admin_only']

// Cria ou edita uma borda de avatar (Admin → Bordas). O slug não muda depois de criado.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const b = await req.json()
    const name = String(b.name || '').trim()
    const colors: string[] = Array.isArray(b.colors) ? b.colors.map(String) : []
    if (!name) return NextResponse.json({ error: 'Dê um nome pra borda' }, { status: 400 })
    if (colors.length < 2 || colors.length > 12 || !colors.every((c) => HEX.test(c))) {
        return NextResponse.json({ error: 'Use de 2 a 12 cores (formato #rrggbb)' }, { status: 400 })
    }
    if (!MODES.includes(b.grant_mode)) return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })

    const row = {
        name,
        description: b.description ? String(b.description).trim() : null,
        colors,
        is_active: !!b.is_active,
        grant_mode: b.grant_mode,
        available_from: b.available_from || null,
        available_until: b.available_until || null,
        requires_prepaid: !!b.requires_prepaid,
        for_hierarchy: !!b.for_hierarchy,
        required_level_id: b.required_level_id || null,
        sort_order: Number.isFinite(Number(b.sort_order)) ? Math.round(Number(b.sort_order)) : 0,
        updated_at: new Date().toISOString(),
    }

    if (b.id) {
        const { error } = await supabaseAdmin.from('avatar_borders').update(row).eq('id', b.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
        const slug = String(b.slug || '').trim().toLowerCase()
        if (!/^[a-z0-9_-]{2,40}$/.test(slug)) return NextResponse.json({ error: 'Slug inválido (letras minúsculas, números, - e _)' }, { status: 400 })
        const { error } = await supabaseAdmin.from('avatar_borders').insert({ slug, ...row })
        if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? 'Já existe uma borda com esse slug' : error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
