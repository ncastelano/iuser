// app/api/admin/moderation/route.ts
//
// Admin → Denúncias: o conteúdo denunciado pelas pessoas (flash, comentário de flash, publicação, comentário, avaliação, mensagem de comunidade), agrupado por conteúdo, com o que foi dito
// e quem denunciou, mais o que está OCULTO agora. O admin decide: ocultar, manter (nunca mais oculta por denúncia) ou restaurar. Só o administrador geral.
//   action 'list'    → { pending: [...], hidden: [...] }
//   action 'decide'  → { type, id, action: 'hide' | 'clear' | 'restore', note }  (admin_moderate, só service role)
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const UUID = /^[0-9a-f-]{36}$/i
const TYPES = ['flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message'] as const
type T = (typeof TYPES)[number]

interface Preview { text: string; image: string | null; authorId: string | null; extra?: string }

/** O que cada conteúdo diz (o admin precisa ver para decidir) */
async function previews(keys: { type: T; id: string }[]): Promise<Map<string, Preview>> {
    const out = new Map<string, Preview>()
    const ids = (t: T) => keys.filter((k) => k.type === t).map((k) => k.id)
    const media = (path: string | null) => (path ? supabaseAdmin.storage.from('flash-media').getPublicUrl(path).data.publicUrl : null)
    const jobs: Promise<void>[] = []
    if (ids('flash').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('flashes').select('id, author_id, content, media_url, media_type').in('id', ids('flash')); (data || []).forEach((r: any) => out.set(`flash:${r.id}`, { text: r.content || '', image: r.media_type === 'image' ? media(r.media_url) : null, authorId: r.author_id, extra: r.media_type === 'video' ? 'vídeo' : undefined })) })())
    if (ids('flash_comment').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('flash_comments').select('id, author_id, content').in('id', ids('flash_comment')); (data || []).forEach((r: any) => out.set(`flash_comment:${r.id}`, { text: r.content || '', image: null, authorId: r.author_id })) })())
    if (ids('publication').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('products').select('id, owner_id, name, description, image_url').in('id', ids('publication')); (data || []).forEach((r: any) => out.set(`publication:${r.id}`, { text: [r.name, r.description].filter(Boolean).join(' — '), image: r.image_url || null, authorId: r.owner_id })) })())
    if (ids('comment').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('comments').select('id, profile_id, content').in('id', ids('comment')); (data || []).forEach((r: any) => out.set(`comment:${r.id}`, { text: r.content || '', image: null, authorId: r.profile_id })) })())
    if (ids('product_review').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('product_reviews').select('id, profile_id, rating, comment').in('id', ids('product_review')); (data || []).forEach((r: any) => out.set(`product_review:${r.id}`, { text: r.comment || '(sem texto)', image: null, authorId: r.profile_id, extra: `${r.rating} estrela(s)` })) })())
    if (ids('community_message').length) jobs.push((async () => { const { data } = await supabaseAdmin.from('community_messages').select('id, profile_id, content').in('id', ids('community_message')); (data || []).forEach((r: any) => out.set(`community_message:${r.id}`, { text: r.content || '', image: null, authorId: r.profile_id })) })())
    await Promise.all(jobs)
    return out
}

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = await req.json().catch(() => ({}))

    if (body.action === 'decide') {
        const type = String(body.type || ''), id = String(body.id || '')
        if (!TYPES.includes(type as T) || !UUID.test(id)) return NextResponse.json({ error: 'Conteúdo inválido' }, { status: 400 })
        const { error } = await supabaseAdmin.rpc('admin_moderate', { p_type: type, p_id: id, p_action: String(body.moderation || body.act || ''), p_note: String(body.note || '').slice(0, 500), p_admin: admin.id })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
    }

    // list
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: reports }, { data: mods }] = await Promise.all([
        supabaseAdmin.from('content_reports').select('target_type, target_id, reason, note, reviewed_at, reporter_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
        supabaseAdmin.from('content_moderation').select('target_type, target_id, status, source, author_id, note, decided_at, created_at').order('created_at', { ascending: false }).limit(300),
    ])
    const modBy = new Map((mods || []).map((m: any) => [`${m.target_type}:${m.target_id}`, m]))
    const groups = new Map<string, { type: T; id: string; reasons: string[]; notes: string[]; reporters: Set<string>; last: string; open: boolean }>()
    for (const r of reports || []) {
        const k = `${r.target_type}:${r.target_id}`
        const g = groups.get(k) || { type: r.target_type as T, id: r.target_id as string, reasons: [], notes: [], reporters: new Set<string>(), last: r.created_at as string, open: false }
        g.reasons.push(r.reason as string); if (r.note) g.notes.push(r.note as string); g.reporters.add(r.reporter_id as string)
        if (!r.reviewed_at) g.open = true
        groups.set(k, g)
    }
    const pendingKeys = [...groups.values()].filter((g) => g.open)
    // o que está oculto E ainda tem denúncia para analisar aparece só em "Para analisar" (com o selo OCULTO); "Ocultos agora" mostra os já decididos
    const pendingSet = new Set(pendingKeys.map((g) => `${g.type}:${g.id}`))
    const hiddenMods = (mods || []).filter((m: any) => m.status === 'hidden' && !pendingSet.has(`${m.target_type}:${m.target_id}`))
    const keys = [...pendingKeys.map((g) => ({ type: g.type, id: g.id })), ...hiddenMods.map((m: any) => ({ type: m.target_type as T, id: m.target_id as string }))]
    const prev = await previews(keys)
    const authorIds = Array.from(new Set([...prev.values()].map((p) => p.authorId).filter(Boolean))) as string[]
    const { data: profs } = authorIds.length ? await supabaseAdmin.from('profiles').select('id, name, "profileSlug"').in('id', authorIds) : { data: [] as any[] }
    const who = new Map((profs || []).map((p: any) => [p.id, `${p.name || 'Perfil'}${p.profileSlug ? ` (@${p.profileSlug})` : ''}`]))
    // quantos conteúdos do mesmo autor já foram ocultados (o histórico pesa na decisão)
    const authorHidden = new Map<string, number>()
    for (const m of mods || []) if ((m as any).status === 'hidden' && (m as any).author_id) authorHidden.set((m as any).author_id, (authorHidden.get((m as any).author_id) || 0) + 1)

    const shape = (type: T, id: string, g?: { reasons: string[]; notes: string[]; reporters: Set<string>; last: string }) => {
        const p = prev.get(`${type}:${id}`), m: any = modBy.get(`${type}:${id}`)
        return {
            type, id, text: p?.text ?? '(conteúdo apagado)', image: p?.image ?? null, extra: p?.extra ?? null,
            author: p?.authorId ? who.get(p.authorId) || 'Perfil' : null, authorHiddenCount: p?.authorId ? authorHidden.get(p.authorId) || 0 : 0,
            reasons: g?.reasons ?? [], notes: (g?.notes ?? []).slice(0, 5), reporters: g ? g.reporters.size : 0, lastReportAt: g?.last ?? null,
            status: m?.status ?? null, source: m?.source ?? null, decidedAt: m?.decided_at ?? null, modNote: m?.note ?? null,
        }
    }
    return NextResponse.json({
        pending: pendingKeys.map((g) => shape(g.type, g.id, g)).sort((a, b) => b.reporters - a.reporters),
        hidden: hiddenMods.map((m: any) => shape(m.target_type, m.target_id, groups.get(`${m.target_type}:${m.target_id}`))),
    })
}
