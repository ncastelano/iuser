// app/api/admin/credits/route.ts — Admin → Créditos: os CARTÕES DE CRÉDITO do iUser (migration 20261130000085). Só o administrador geral.
// UMA rota com `action`: load (campanhas, o que o iUser deve a cada loja), create (campanha + códigos), add_codes, set_active,
// codes (lista para imprimir), mark_paid (o admin já mandou o Pix à loja). Tudo são funções do banco só do serviço (gravam admin_config_audit);
// o id do admin vem do login, nunca do corpo.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s, headers: NO_STORE })
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN)

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return fail('Sem permissão', 403)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || 'load')

    if (action === 'load') {
        const { data, error } = await supabaseAdmin.rpc('admin_credit_overview')
        if (error) return fail('Não foi possível carregar. ' + error.message, 500)
        return NextResponse.json(data, { headers: NO_STORE })
    }
    if (action === 'create') {
        const name = String(body.name || '').trim()
        const value = num(body.value), min = num(body.minOrder ?? 0), codes = Math.round(num(body.codes))
        const ends = body.endsAt ? new Date(String(body.endsAt)) : null
        if (name.length < 2 || name.length > 80) return fail('Dê um nome à campanha (2 a 80 letras).')
        if (!(value > 0 && value <= 500)) return fail('O valor do cartão vai de R$ 0,01 a R$ 500.')
        if (!(min >= 0 && min <= 5000)) return fail('Pedido mínimo de R$ 0 a R$ 5.000.')
        if (!(codes >= 1 && codes <= 2000)) return fail('Quantidade de cartões: de 1 a 2.000.')
        if (ends && (isNaN(ends.getTime()) || ends.getTime() < Date.now())) return fail('A validade precisa ser uma data futura.')
        const { data, error } = await supabaseAdmin.rpc('admin_credit_create_campaign', {
            p_name: name, p_value: value, p_min_order: min, p_ends_at: ends ? ends.toISOString() : null, p_codes: codes, p_admin: admin.id,
        })
        if (error) return fail(error.message)
        return NextResponse.json({ id: data }, { headers: NO_STORE })
    }
    const campaign = String(body.campaign || '')
    if (action === 'add_codes') {
        const codes = Math.round(num(body.codes))
        if (!UUID.test(campaign) || !(codes >= 1 && codes <= 2000)) return fail('Dados inválidos.')
        const { error } = await supabaseAdmin.rpc('admin_credit_add_codes', { p_campaign: campaign, p_codes: codes, p_admin: admin.id })
        return error ? fail(error.message) : NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    if (action === 'set_active') {
        if (!UUID.test(campaign)) return fail('Dados inválidos.')
        const { error } = await supabaseAdmin.rpc('admin_credit_set_active', { p_campaign: campaign, p_active: body.active === true, p_admin: admin.id })
        return error ? fail(error.message) : NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    if (action === 'codes') {
        if (!UUID.test(campaign)) return fail('Dados inválidos.')
        const { data, error } = await supabaseAdmin.rpc('admin_credit_codes', { p_campaign: campaign })
        return error ? fail(error.message, 500) : NextResponse.json({ codes: data }, { headers: NO_STORE })
    }
    if (action === 'mark_paid') {
        const store = String(body.store || '')
        if (!UUID.test(store)) return fail('Dados inválidos.')
        const { data, error } = await supabaseAdmin.rpc('admin_credit_mark_paid', { p_store: store, p_admin: admin.id, p_note: String(body.note || '').slice(0, 200) })
        return error ? fail(error.message) : NextResponse.json({ paid: data }, { headers: NO_STORE })
    }
    return fail('Ação desconhecida.')
}
