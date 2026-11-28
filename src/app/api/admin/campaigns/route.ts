// app/api/admin/campaigns/route.ts — Avisos (push) do administrador. Só o administrador geral; quem criou vem do login.
// Ações: preview (quantas pessoas), create (cria e enfileira), send (manda um lote; repetir até restar 0), list.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { sendCampaignBatches } from '@/lib/campaignSend'
import { validateCampaign, audienceAllowed, type CampaignAudience } from '@/modules/campaigns/domain'

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s, headers: NO_STORE })
const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((x) => UUID.test(x)).slice(0, 5000)

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return fail('Sem permissão', 403)
    const b = (await req.json().catch(() => ({}))) as Record<string, any>
    const action = String(b.action || 'list')

    if (action === 'list') {
        const { data, error } = await supabaseAdmin.from('push_campaigns').select('id, title, body, url, audience, recipients, sent_count, created_at, finished_at, store_id')
            .order('created_at', { ascending: false }).limit(30)
        return error ? fail(error.message, 500) : NextResponse.json({ campaigns: data }, { headers: NO_STORE })
    }

    if (action === 'resolve') {
        // @s digitados pelo administrador -> pessoas (id e nome) para conferir antes de enviar
        const slugs = (Array.isArray(b.slugs) ? b.slugs : []).map((x: unknown) => String(x).replace(/^@/, '').trim().toLowerCase()).filter((x: string) => /^[a-z0-9._-]{2,60}$/.test(x)).slice(0, 200)
        if (slugs.length === 0) return NextResponse.json({ people: [] }, { headers: NO_STORE })
        const { data, error } = await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('profileSlug', slugs)
        return error ? fail(error.message, 500) : NextResponse.json({ people: data ?? [] }, { headers: NO_STORE })
    }
    const audience = String(b.audience || '') as CampaignAudience
    if (!audienceAllowed(audience, true)) return fail('Escolha quem recebe.')
    const audIds = ids(b.ids)
    if ((audience === 'people') && audIds.length === 0) return fail('Escolha pelo menos uma pessoa.')

    if (action === 'preview') {
        const { data, error } = await supabaseAdmin.rpc('campaign_preview', { p_audience: audience, p_store: null, p_ids: audIds })
        return error ? fail(error.message) : NextResponse.json({ recipients: data ?? 0 }, { headers: NO_STORE })
    }
    if (action === 'create') {
        const bad = validateCampaign({ title: String(b.title || ''), body: String(b.body || ''), url: String(b.url || '') })
        if (bad) return fail(bad)
        const { data, error } = await supabaseAdmin.rpc('campaign_create', {
            p_title: String(b.title).trim(), p_body: String(b.body).trim(), p_url: String(b.url).trim(),
            p_audience: audience, p_store: null, p_ids: audIds, p_creator: admin.id,
        })
        return error ? fail(error.message) : NextResponse.json({ id: data }, { headers: NO_STORE })
    }
    if (action === 'send') {
        if (!UUID.test(String(b.id || ''))) return fail('Aviso inválido.')
        const r = await sendCampaignBatches(String(b.id))
        return NextResponse.json(r, { headers: NO_STORE })
    }
    return fail('Ação desconhecida.')
}
