// app/api/admin/profiles/search/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { getAvatarUrl } from '@/lib/avatar'

// Busca perfis por nome ou @ pra sugerir no admin (conceder plano, conceder borda...).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { query } = await req.json()
    // Só letras/números/espaço/@/-/_ : o texto vai dentro de um filtro .or(), não pode carregar vírgula nem parêntese
    const q = String(query || '').replace(/^@/, '').replace(/[^\p{L}\p{N}\s_.-]/gu, '').trim()
    if (q.length < 2) return NextResponse.json({ profiles: [] })

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, name, profileSlug, avatar_url')
        .or(`name.ilike.%${q}%,profileSlug.ilike.%${q}%`)
        .not('profileSlug', 'is', null)
        .order('name')
        .limit(8)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
        profiles: (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            profileSlug: p.profileSlug,
            avatarUrl: p.avatar_url ? (getAvatarUrl(supabaseAdmin as any, p.avatar_url) || null) : null,
        })),
    })
}
