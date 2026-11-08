// app/api/admin/points/route.ts
//
// Admin → Pontuação (motor único; migration 20261130000051). UMA rota POST com `action`:
//   overview      → catálogo de eventos, regras de evento (tarefas), sinais de cada Outdoor, configurações e o ranking de pessoas
//   compare       → "Perfil total": o ranking de hoje (livro-caixa) × o ranking com o total novo, lado a lado
//   save_rule     → muda uma regra de evento (pontos, limites, vigência, ligada)
//   new_rule      → "Nova tarefa": uma regra nova em cima de um evento do catálogo (campanha, penalidade...)
//   delete_rule   → apaga uma tarefa criada pelo admin que nunca rendeu pontos (as da casa e as que já renderam só se desligam)
//   save_signal   → peso, teto, "soma no dono" e ligado de um sinal de Outdoor
//   save_settings → bônus de diversidade e a chave do total novo
//   refresh       → recalcula o Outdoor e o Placar agora
// Só o administrador geral. O id do admin vem do login (nunca do corpo). Toda mudança grava linha em admin_config_audit (scope `points`).
// A mesma validação da tela (modules/points) roda aqui; o banco ainda tem os CHECKs.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { SIGNAL_AREAS, newRuleId, validateDiversity, validateRule, validateSignal } from '@/modules/points/domain'

export const maxDuration = 60

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
const orNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : v)
const intOrNull = (v: unknown) => (orNull(v) === null ? null : Math.round(Number(v)))
const isoOrNull = (v: unknown) => { const x = orNull(v); if (x === null) return null; const t = Date.parse(String(x)); return Number.isFinite(t) ? new Date(t).toISOString() : null }

async function audit(adminId: string, setting: string, oldValue: unknown, newValue: unknown) {
    await supabaseAdmin.from('admin_config_audit').insert({ scope: 'points', setting, old_value: oldValue ?? null, new_value: newValue ?? null, changed_by: adminId })
}
async function refresh() {
    const { error } = await supabaseAdmin.rpc('refresh_outdoor_scores')
    return error?.message || null
}
async function withNames(rows: { profile_id: string; total: number }[]) {
    const ids = rows.map((r) => r.profile_id)
    const { data: profiles } = ids.length ? await supabaseAdmin.from('profiles').select('id, name, "profileSlug"').in('id', ids) : { data: [] as any[] }
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]))
    return rows.map((r, i) => ({ rank: i + 1, profile_id: r.profile_id, total: r.total, name: byId.get(r.profile_id)?.name || null, slug: byId.get(r.profile_id)?.profileSlug || null }))
}

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return fail('Sem permissão', 403)

    let body: any
    try { body = await req.json() } catch { return fail('Pedido inválido') }
    const action = String(body?.action || 'overview')

    // ===== leitura =====
    if (action === 'overview' || action === 'list') {
        const [events, rules, signals, settings, used, top] = await Promise.all([
            supabaseAdmin.from('point_events').select('*').order('sort_order'),
            supabaseAdmin.from('point_rules').select('*').order('sort_order').order('action'),
            supabaseAdmin.from('outdoor_rules').select('*').order('kind').order('sort_order'),
            supabaseAdmin.from('points_settings').select('*').eq('id', true).maybeSingle(),
            supabaseAdmin.from('profile_points_events').select('action, points'),
            supabaseAdmin.from('profile_points').select('profile_id, total').order('total', { ascending: false }).limit(20),
        ])
        const err = events.error || rules.error || signals.error || settings.error || used.error || top.error
        if (err) return fail(err.message, 500)
        const usage = new Map<string, { times: number; points: number }>()
        for (const e of used.data || []) { const u = usage.get(e.action) || { times: 0, points: 0 }; u.times++; u.points += e.points; usage.set(e.action, u) }
        return NextResponse.json({
            events: events.data || [],
            rules: (rules.data || []).map((r: any) => ({ ...r, times: usage.get(r.action)?.times || 0, given: usage.get(r.action)?.points || 0 })),
            signals: signals.data || [],
            settings: settings.data,
            ranking: await withNames(top.data || []),
        })
    }

    if (action === 'compare') {
        const [ledger, scores, st] = await Promise.all([
            supabaseAdmin.from('profile_points').select('profile_id, total').order('total', { ascending: false }).limit(200),
            supabaseAdmin.from('profile_scores').select('profile_id, pessoa, lojas, servicos, produtos, digitais, imoveis, motoristas, raw, bonus_pct, total').order('total', { ascending: false }).limit(20),
            supabaseAdmin.from('points_settings').select('refreshed_at, use_total_score').eq('id', true).maybeSingle(),
        ])
        const err = ledger.error || scores.error || st.error
        if (err) return fail(err.message, 500)
        const ledgerRank = new Map((ledger.data || []).map((r: any, i: number) => [r.profile_id, i + 1]))
        const named = await withNames((ledger.data || []).slice(0, 20))
        const newNamed = await withNames((scores.data || []).map((s: any) => ({ profile_id: s.profile_id, total: s.total })))
        return NextResponse.json({
            refreshed_at: st.data?.refreshed_at || null,
            use_total_score: !!st.data?.use_total_score,
            today: named,
            next: newNamed.map((n, i) => ({ ...n, was: ledgerRank.get(n.profile_id) ?? null, areas: scores.data?.[i] })),
        })
    }

    // ===== escrita =====
    if (action === 'save_rule') {
        const key = String(body.rule || '')
        const { data: before } = await supabaseAdmin.from('point_rules').select('*').eq('action', key).maybeSingle()
        if (!before) return fail('Regra não encontrada', 404)
        const msg = validateRule({ points: body.points, dailyLimit: body.daily_limit, maxTotal: body.max_total, startsAt: body.starts_at, endsAt: body.ends_at, label: body.label ?? before.label })
        if (msg) return fail(msg)
        const patch = {
            label: String(body.label ?? before.label).trim() || before.label, description: body.description === undefined ? before.description : orNull(body.description),
            points: Math.round(Number(body.points)), daily_limit: intOrNull(body.daily_limit), max_total: intOrNull(body.max_total),
            starts_at: isoOrNull(body.starts_at), ends_at: isoOrNull(body.ends_at), is_active: !!body.is_active, updated_at: new Date().toISOString(), updated_by: admin.id,
        }
        const { error } = await supabaseAdmin.from('point_rules').update(patch).eq('action', key)
        if (error) return fail(error.message, 500)
        await audit(admin.id, `rule:${key}`, { points: before.points, daily_limit: before.daily_limit, max_total: before.max_total, is_active: before.is_active, starts_at: before.starts_at, ends_at: before.ends_at }, patch)
        return NextResponse.json({ ok: true })
    }

    if (action === 'new_rule') {
        const event = String(body.event || '')
        const { data: ev } = await supabaseAdmin.from('point_events').select('event').eq('event', event).maybeSingle()
        if (!ev) return fail('Escolha um evento da lista')
        const msg = validateRule({ points: body.points, dailyLimit: body.daily_limit, maxTotal: body.max_total, startsAt: body.starts_at, endsAt: body.ends_at, label: body.label }, { requireLabel: true })
        if (msg) return fail(msg)
        const row = {
            action: newRuleId(event), event, label: String(body.label).trim(), description: orNull(body.description) ? String(body.description).trim().slice(0, 200) : null,
            points: Math.round(Number(body.points)), daily_limit: intOrNull(body.daily_limit), max_total: intOrNull(body.max_total),
            starts_at: isoOrNull(body.starts_at), ends_at: isoOrNull(body.ends_at), is_active: body.is_active !== false, sort_order: 100, updated_by: admin.id,
        }
        const { error } = await supabaseAdmin.from('point_rules').insert(row)
        if (error) return fail(error.message, 500)
        await audit(admin.id, `rule:${row.action}`, null, row)
        return NextResponse.json({ ok: true, action: row.action })
    }

    if (action === 'delete_rule') {
        const key = String(body.rule || '')
        if (!key.startsWith('t_')) return fail('As regras da casa não se apagam: desligue')
        const { count } = await supabaseAdmin.from('profile_points_events').select('action', { count: 'exact', head: true }).eq('action', key)
        if (count) return fail('Esta tarefa já rendeu pontos: desligue em vez de apagar (o histórico fica)')
        const { data: before } = await supabaseAdmin.from('point_rules').select('*').eq('action', key).maybeSingle()
        const { error } = await supabaseAdmin.from('point_rules').delete().eq('action', key)
        if (error) return fail(error.message, 500)
        await audit(admin.id, `rule:${key}`, before, null)
        return NextResponse.json({ ok: true })
    }

    if (action === 'save_signal') {
        const kind = String(body.kind || ''), signal = String(body.signal || '')
        if (!(SIGNAL_AREAS as string[]).includes(kind)) return fail('Tipo inválido')
        const { data: before } = await supabaseAdmin.from('outdoor_rules').select('*').eq('kind', kind).eq('signal', signal).maybeSingle()
        if (!before) return fail('Sinal não encontrado', 404)
        const msg = validateSignal({ weight: body.weight, maxUnits: body.max_units })
        if (msg) return fail(msg)
        const patch = { weight: Number(body.weight), max_units: orNull(body.max_units) === null ? null : Number(body.max_units), is_active: !!body.is_active, rolls_up: !!body.rolls_up, updated_at: new Date().toISOString(), updated_by: admin.id }
        const { error } = await supabaseAdmin.from('outdoor_rules').update(patch).eq('kind', kind).eq('signal', signal)
        if (error) return fail(error.message, 500)
        await audit(admin.id, `signal:${kind}.${signal}`, { weight: before.weight, max_units: before.max_units, is_active: before.is_active, rolls_up: before.rolls_up }, patch)
        const rf = await refresh()
        return NextResponse.json({ ok: true, refresh_error: rf })
    }

    if (action === 'save_settings') {
        const s = { step: Number(body.diversity_step), max: Number(body.diversity_max), maxShare: Number(body.diversity_max_share), minPoints: Math.round(Number(body.diversity_min_points)) }
        const msg = validateDiversity(s)
        if (msg) return fail(msg)
        const { data: before } = await supabaseAdmin.from('points_settings').select('*').eq('id', true).maybeSingle()
        const patch = { use_total_score: !!body.use_total_score, diversity_step: s.step, diversity_max: s.max, diversity_max_share: s.maxShare, diversity_min_points: s.minPoints, updated_at: new Date().toISOString(), updated_by: admin.id }
        const { error } = await supabaseAdmin.from('points_settings').update(patch).eq('id', true)
        if (error) return fail(error.message, 500)
        await audit(admin.id, 'settings', before, patch)
        const rf = await refresh()
        return NextResponse.json({ ok: true, refresh_error: rf })
    }

    if (action === 'refresh') {
        const rf = await refresh()
        if (rf) return fail(rf, 500)
        return NextResponse.json({ ok: true })
    }

    return fail('Ação desconhecida')
}
