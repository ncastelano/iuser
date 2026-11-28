// app/api/admin/forum/route.ts — Admin → Fórum (migration 20261130000087). Só o administrador geral; o id do admin vem do login.
// Ações: load (novidades e ideias, inclusive escondidas), release (publicar/editar novidade), idea (situação, resposta, esconder),
// team_comment (resposta oficial com o selo "Equipe iUser"), hide_comment.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { sendPushToUser } from '@/lib/serverPush'

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s, headers: NO_STORE })
const lines = (v: unknown) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 30).map((x) => x.slice(0, 200))
const STATUS = ['open', 'review', 'planned', 'doing', 'done', 'declined']

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return fail('Sem permissão', 403)
    const b = (await req.json().catch(() => ({}))) as Record<string, any>
    const action = String(b.action || 'load')

    if (action === 'load') {
        const [r, i] = await Promise.all([
            supabaseAdmin.from('forum_releases').select('*').order('released_at', { ascending: false }).limit(50),
            supabaseAdmin.from('forum_ideas').select('id, title, body, category, status, status_note, release_id, up_count, down_count, comment_count, hidden, created_at, profiles!author_id(name, profileSlug)')
                .order('created_at', { ascending: false }).limit(300),
        ])
        if (r.error || i.error) return fail('Não foi possível carregar.', 500)
        return NextResponse.json({ releases: r.data, ideas: i.data }, { headers: NO_STORE })
    }
    if (action === 'release') {
        const version = String(b.version || '').trim(), title = String(b.title || '').trim()
        if (!version || version.length > 30) return fail('Informe a versão (ex.: 3.1).')
        if (title.length < 2 || title.length > 120) return fail('Dê um título (2 a 120 letras).')
        if (b.id && !UUID.test(String(b.id))) return fail('Dados inválidos.')
        const { data, error } = await supabaseAdmin.rpc('admin_forum_release', {
            p_id: b.id || null, p_version: version, p_title: title, p_summary: String(b.summary || '').slice(0, 600),
            p_added: lines(b.added), p_improved: lines(b.improved), p_removed: lines(b.removed), p_admin: admin.id,
        })
        return error ? fail(error.message) : NextResponse.json({ id: data }, { headers: NO_STORE })
    }
    if (action === 'idea') {
        if (!UUID.test(String(b.idea || '')) || !STATUS.includes(String(b.status))) return fail('Dados inválidos.')
        if (b.release && !UUID.test(String(b.release))) return fail('Dados inválidos.')
        const { error } = await supabaseAdmin.rpc('admin_forum_idea', {
            p_idea: b.idea, p_status: b.status, p_note: String(b.note || '').slice(0, 300), p_release: b.release || null, p_hidden: b.hidden === true, p_admin: admin.id,
        })
        return error ? fail(error.message) : NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    if (action === 'team_comment') {
        const body = String(b.body || '').trim()
        if (!body || body.length > 600) return fail('Escreva a resposta (até 600 letras).')
        const idea = b.idea && UUID.test(String(b.idea)) ? b.idea : null, release = b.release && UUID.test(String(b.release)) ? b.release : null
        if ((idea === null) === (release === null)) return fail('Dados inválidos.')
        const { error } = await supabaseAdmin.rpc('admin_forum_team_comment', { p_idea: idea, p_release: release, p_body: body, p_admin: admin.id })
        return error ? fail(error.message) : NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    if (action === 'hide_comment') {
        if (!UUID.test(String(b.comment || ''))) return fail('Dados inválidos.')
        const { error } = await supabaseAdmin.rpc('admin_forum_hide_comment', { p_comment: b.comment, p_hidden: b.hidden !== false, p_admin: admin.id })
        return error ? fail(error.message) : NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    // Aviso na barra do aparelho (push) para quem tem notificação ligada e não desligou as novidades.
    // announce: enfileira a versão. announce_batch: manda um lote (cada um marcado antes de enviar); repetir até restar 0.
    if (action === 'announce' || action === 'announce_batch') {
        if (!UUID.test(String(b.id || ''))) return fail('Dados inválidos.')
        const release = String(b.id)
        const { data: rel } = await supabaseAdmin.from('forum_releases').select('version, title, summary').eq('id', release).maybeSingle()
        if (!rel) return fail('Novidade não encontrada.', 404)
        if (action === 'announce') {
            const { data: pending, error } = await supabaseAdmin.rpc('admin_forum_announce', { p_release: release })
            return error ? fail(error.message) : NextResponse.json({ pending: pending ?? 0, version: rel.version }, { headers: NO_STORE })
        }
        const started = Date.now()
        let sent = 0
        // cabe no tempo do servidor: manda lotes até acabar a fila ou se aproximar do limite; o que sobrar vai no próximo toque
        while (Date.now() - started < 40_000) {
            const { data: ids, error } = await supabaseAdmin.rpc('admin_forum_announce_claim', { p_release: release, p_limit: 100 })
            if (error) return fail(error.message, 500)
            const batch = (ids || []) as string[]
            if (batch.length === 0) break
            const payload = {
                title: `Novidade no iUser · ${rel.version}`,
                body: `${rel.title}${rel.summary ? ` — ${rel.summary}` : ''}`.slice(0, 220),
                url: '/forum',
                tag: `app-update-${rel.version}`,
            }
            const results = await Promise.allSettled(batch.map((uid) => sendPushToUser(uid, payload)))
            sent += results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value.sent : 0), 0)
        }
        const { data: remaining } = await supabaseAdmin.rpc('admin_forum_announce_remaining', { p_release: release })
        return NextResponse.json({ sent, remaining: remaining ?? 0 }, { headers: NO_STORE })
    }
    return fail('Ação desconhecida.')
}
