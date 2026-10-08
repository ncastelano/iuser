// app/api/admin/activity/visitors/route.ts
//
// Todos os visitantes de uma janela de tempo da aba "Atividade" (online agora, 24h, 7 dias, 30 dias) — a lista
// que abre ao clicar nos números do topo. Uma linha por PESSOA: cadastrada (user_id, com nome/foto/@) ou
// anônima (anonymous_id). Mesma base do /summary (site_visits, últimos 30 dias).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const WINDOWS: Record<string, number> = {
    online: 5 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
}

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { window: win } = await req.json().catch(() => ({ window: '' }))
    const span = WINDOWS[win as string]
    if (!span) {
        return NextResponse.json({ error: 'Janela inválida' }, { status: 400 })
    }

    const since = new Date(Date.now() - span).toISOString()
    const { data, error } = await supabaseAdmin
        .from('site_visits')
        .select('user_id, anonymous_id, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Do mais recente pro mais antigo: a 1ª vez que a pessoa aparece é a última visita dela
    const byVisitor = new Map<string, { userId: string | null; anonymousId: string; visits: number; lastSeen: string }>()
    for (const r of data || []) {
        const key = r.user_id || r.anonymous_id
        const cur = byVisitor.get(key)
        if (cur) cur.visits += 1
        else byVisitor.set(key, { userId: r.user_id, anonymousId: r.anonymous_id, visits: 1, lastSeen: r.created_at })
    }

    const userIds = Array.from(byVisitor.values()).map((v) => v.userId).filter(Boolean) as string[]
    const profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatarUrl: string | null }>()
    for (let i = 0; i < userIds.length; i += 150) {
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, name, profileSlug, avatar_url')
            .in('id', userIds.slice(i, i + 150))
        for (const p of profiles || []) {
            profilesById.set(p.id, {
                name: p.name,
                profileSlug: p.profileSlug,
                avatarUrl: p.avatar_url
                    ? (p.avatar_url.startsWith('http') ? p.avatar_url : supabaseAdmin.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl)
                    : null,
            })
        }
    }

    const visitors = Array.from(byVisitor.entries()).map(([key, v]) => ({
        key,
        userId: v.userId,
        anonymousId: v.anonymousId,
        profile: v.userId ? profilesById.get(v.userId) || null : null,
        visits: v.visits,
        lastSeen: v.lastSeen,
    }))

    return NextResponse.json({ visitors })
}
