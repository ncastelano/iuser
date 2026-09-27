// app/api/admin/activity/summary/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Visão geral de tudo que acontece no iUser (aba "Atividade" do admin):
// quantos visitantes únicos (cadastrados ou anônimos) passaram pelo site,
// quais páginas mais recebem visita, e a lista mais recente de quem entrou
// em quê. Busca só os últimos 30 dias — o suficiente pros números de
// online/hoje/7d/30d, sem carregar a tabela inteira a cada clique na aba.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const now = Date.now()
    const onlineSince = new Date(now - 5 * 60 * 1000).toISOString()
    const last24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
        .from('site_visits')
        .select('id, path, user_id, anonymous_id, referrer, created_at')
        .gte('created_at', last30d)
        .order('created_at', { ascending: false })
        .limit(5000)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data || []
    const visitorKey = (r: (typeof rows)[number]) => r.user_id || r.anonymous_id

    const onlineSet = new Set(rows.filter((r) => r.created_at >= onlineSince).map(visitorKey))
    const last24hSet = new Set(rows.filter((r) => r.created_at >= last24h).map(visitorKey))
    const last7dSet = new Set(rows.filter((r) => r.created_at >= last7d).map(visitorKey))
    const last30dSet = new Set(rows.map(visitorKey))
    const registeredSet = new Set(rows.filter((r) => r.user_id).map(visitorKey))

    const pathCounts = new Map<string, number>()
    for (const r of rows) {
        pathCounts.set(r.path, (pathCounts.get(r.path) || 0) + 1)
    }
    const topPaths = Array.from(pathCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([path, count]) => ({ path, count }))

    const dayMap = new Map<string, number>()
    for (const r of rows) {
        const day = r.created_at.slice(0, 10)
        dayMap.set(day, (dayMap.get(day) || 0) + 1)
    }
    const daily = Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([date, count]) => ({ date, count }))

    const recent = rows.slice(0, 50)
    const userIds = [...new Set(recent.map((r) => r.user_id).filter(Boolean))] as string[]
    let profilesById = new Map<string, { name: string | null; profileSlug: string | null }>()
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, name, profileSlug')
            .in('id', userIds)
        profilesById = new Map((profiles || []).map((p) => [p.id, { name: p.name, profileSlug: p.profileSlug }]))
    }
    const recentWithProfile = recent.map((r) => ({
        ...r,
        profile: r.user_id ? profilesById.get(r.user_id) || null : null,
    }))

    return NextResponse.json({
        onlineNow: onlineSet.size,
        last24hUnique: last24hSet.size,
        last7dUnique: last7dSet.size,
        last30dUnique: last30dSet.size,
        registeredUnique: registeredSet.size,
        anonymousUnique: last30dSet.size - registeredSet.size,
        totalVisits30d: rows.length,
        topPaths,
        daily,
        recent: recentWithProfile,
    })
}
