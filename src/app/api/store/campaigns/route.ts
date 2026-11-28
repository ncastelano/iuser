// app/api/store/campaigns/route.ts — Avisos (push) de UMA loja, feitos pela dona. O banco confere que é a dona e o público
// (seguidores, compradores ou pessoas escolhidas dentro deles) e o limite por dia. Ações: preview, create, send.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendCampaignBatches } from '@/lib/campaignSend'
import { validateCampaign, audienceAllowed, type CampaignAudience } from '@/modules/campaigns/domain'

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s, headers: NO_STORE })
const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((x) => UUID.test(x)).slice(0, 500)

export async function POST(req: Request) {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fail('Entre na sua conta.', 401)
    const b = (await req.json().catch(() => ({}))) as Record<string, any>
    const action = String(b.action || '')
    const store = String(b.store || '')
    if (!UUID.test(store)) return fail('Loja inválida.')
    const audience = String(b.audience || '') as CampaignAudience
    if (!audienceAllowed(audience, false)) return fail('A loja envia só para seguidores, compradores ou pessoas escolhidas.')
    const audIds = ids(b.ids)

    if (action === 'preview') {
        const { data, error } = await supabase.rpc('campaign_preview', { p_audience: audience, p_store: store, p_ids: audIds })
        return error ? fail(error.message) : NextResponse.json({ recipients: data ?? 0 }, { headers: NO_STORE })
    }
    if (action === 'create') {
        const bad = validateCampaign({ title: String(b.title || ''), body: String(b.body || ''), url: String(b.url || '') })
        if (bad) return fail(bad)
        const { data, error } = await supabase.rpc('campaign_create', {
            p_title: String(b.title).trim(), p_body: String(b.body).trim(), p_url: String(b.url).trim(),
            p_audience: audience, p_store: store, p_ids: audIds,
        })
        return error ? fail(error.message) : NextResponse.json({ id: data }, { headers: NO_STORE })
    }
    if (action === 'send') {
        const campaign = String(b.id || '')
        if (!UUID.test(campaign)) return fail('Aviso inválido.')
        // só quem criou o aviso desta loja envia (conferido com a sessão da pessoa)
        const { data: mine } = await supabase.from('push_campaigns').select('id').eq('id', campaign).eq('store_id', store).eq('created_by', user.id).maybeSingle()
        if (!mine) return fail('Aviso não encontrado.', 404)
        const r = await sendCampaignBatches(campaign)
        return NextResponse.json(r, { headers: NO_STORE })
    }
    return fail('Ação desconhecida.')
}
