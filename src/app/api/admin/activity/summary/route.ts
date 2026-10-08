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

    // Visitantes: uma linha por PESSOA (cadastrada, pelo user_id; ou anônima, pelo anonymous_id), em vez de uma
    // por visita — quem faz muita coisa não repete mais. "Fez" = as últimas páginas em ordem, juntando as
    // repetidas em seguida (ex: /radar ×3). `rows` já vem do mais recente pro mais antigo.
    const byVisitor = new Map<string, (typeof rows)>()
    for (const r of rows) {
        const key = visitorKey(r)
        const list = byVisitor.get(key)
        if (list) list.push(r)
        else byVisitor.set(key, [r])
    }
    const visitorEntries = Array.from(byVisitor.entries()).slice(0, 40) // já ordenado pela visita mais recente

    const userIds = [...new Set(visitorEntries.map(([, v]) => v[0].user_id).filter(Boolean))] as string[]
    type VisitorProfile = {
        name: string | null
        profileSlug: string | null
        avatarUrl: string | null
        createdAt: string | null
        invitedBy: { name: string | null; profileSlug: string | null } | null
    }
    let profilesById = new Map<string, VisitorProfile>()
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, name, profileSlug, avatar_url, created_at, upline_id')
            .in('id', userIds)
        // Quem convidou cada pessoa (profiles.upline_id)
        const uplineIds = [...new Set((profiles || []).map((p) => p.upline_id).filter(Boolean))] as string[]
        const uplinesById = new Map<string, { name: string | null; profileSlug: string | null }>()
        if (uplineIds.length > 0) {
            const { data: uplines } = await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('id', uplineIds)
            ;(uplines || []).forEach((u) => uplinesById.set(u.id, { name: u.name, profileSlug: u.profileSlug }))
        }
        profilesById = new Map((profiles || []).map((p) => [p.id, {
            name: p.name,
            profileSlug: p.profileSlug,
            avatarUrl: p.avatar_url
                ? (p.avatar_url.startsWith('http') ? p.avatar_url : supabaseAdmin.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl)
                : null,
            createdAt: p.created_at ?? null,
            invitedBy: p.upline_id ? uplinesById.get(p.upline_id) || null : null,
        }]))
    }

    const visitors = visitorEntries.map(([key, visits]) => {
        const steps: { path: string; count: number; at: string }[] = []
        for (const v of visits) {
            const last = steps[steps.length - 1]
            if (last && last.path === v.path) last.count += 1
            else steps.push({ path: v.path, count: 1, at: v.created_at })
            if (steps.length >= 8) break
        }
        const first = visits[0]
        return {
            key,
            userId: first.user_id,
            anonymousId: first.anonymous_id,
            profile: first.user_id ? profilesById.get(first.user_id) || null : null,
            visits: visits.length,
            lastSeen: first.created_at,
            firstSeen: visits[visits.length - 1].created_at,
            online: first.created_at >= onlineSince,
            referrer: visits.find((v) => v.referrer)?.referrer || null,
            steps,
        }
    })

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
        visitors,
        visitorsTotal: byVisitor.size,
    })
}
