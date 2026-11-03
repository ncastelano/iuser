// app/api/admin/uploads/route.ts
//
// Painel Admin → Uploads (Camada 5 do controle de uploads, docs/CONTROLE-DE-UPLOADS.md). Só o administrador geral. UMA rota com `action`:
//   load (visão geral + maiores consumidores + recusas + bloqueios + histórico + alertas da cota do Supabase), top (maiores consumidores de um tipo),
//   set_enforced (liga/desliga o "envio só com autorização"), block / unblock, update_kind (limites de um tipo).
// Toda leitura agregada e toda escrita são funções do banco só do serviço (admin_upload_*), que gravam admin_config_audit; aqui só se valida a entrada (a MESMA validação da tela,
// no módulo uploads) e se identifica o admin: o id do admin NUNCA vem do corpo da requisição.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { validatePatch, validateBlock, type KindLimits } from '@/modules/uploads'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KIND = /^[a-z][a-z0-9_]{1,40}$/
const GB = 1024 * 1024 * 1024
const NO_STORE = { 'Cache-Control': 'no-store' }

type Err = { code?: string; message: string }
// erro do banco que é "entrada inválida" (22023, 23514) vira 400; o resto é 500
const dbError = (e: Err) => NextResponse.json({ error: e.code === '22023' || e.code === '23514' ? e.message : 'Não foi possível concluir. Tente de novo.', detail: e.message }, { status: e.code === '22023' || e.code === '23514' ? 400 : 500 })

async function names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const list = Array.from(new Set(ids.filter(Boolean))) as string[]
    if (!list.length) return new Map()
    const { data } = await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('id', list)
    return new Map((data || []).map((p) => [p.id, p.profileSlug ? `@${p.profileSlug}` : p.name || 'Pessoa']))
}

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || 'load')

    if (action === 'load') {
        const since = new Date(); since.setDate(since.getDate() - 30)
        const [overview, top, denials, blocksRes, auditRes, stats, metrics, telemetry] = await Promise.all([
            supabaseAdmin.rpc('admin_upload_overview'),
            supabaseAdmin.rpc('admin_upload_top_owners', { p_kind: null, p_limit: 15 }),
            supabaseAdmin.rpc('admin_upload_denials', { p_hours: 24, p_limit: 20 }),
            supabaseAdmin.from('upload_blocks').select('id, profile_id, kind, reason, blocked_until, created_at, created_by').is('lifted_at', null).order('created_at', { ascending: false }).limit(100),
            supabaseAdmin.from('admin_config_audit').select('id, scope, setting, old_value, new_value, changed_by, changed_at').in('scope', ['upload_settings', 'upload_kinds', 'upload_blocks']).order('changed_at', { ascending: false }).limit(30),
            supabaseAdmin.rpc('get_database_stats'),
            supabaseAdmin.from('supabase_usage_metrics').select('metric_name, included_value'),
            supabaseAdmin.from('usage_telemetry_daily').select('egress_bytes').gte('day', since.toISOString().slice(0, 10)),
        ])
        if (overview.error) return dbError(overview.error)

        const now = Date.now()
        const blocks = (blocksRes.data || []).filter((b) => !b.blocked_until || new Date(b.blocked_until).getTime() > now)
        // histórico de bloqueios: o "setting" guarda "tipo:pessoa" (criado) ou o id do bloqueio (levantado); aqui vira o @ da pessoa e o tipo
        const audit = auditRes.data || []
        const liftedIds = audit.filter((a) => a.scope === 'upload_blocks' && !a.setting.includes(':') && UUID.test(a.setting)).map((a) => a.setting)
        const { data: liftedBlocks } = liftedIds.length ? await supabaseAdmin.from('upload_blocks').select('id, profile_id, kind').in('id', liftedIds) : { data: [] as { id: string; profile_id: string | null; kind: string | null }[] }
        const liftedById = new Map((liftedBlocks || []).map((b) => [b.id, b]))
        const target = (a: (typeof audit)[number]): { profile: string | null; kind: string | null } => {
            if (a.scope !== 'upload_blocks') return { profile: null, kind: null }
            if (a.setting.includes(':')) { const [k, p] = a.setting.split(':'); return { profile: UUID.test(p) ? p : null, kind: k && k !== '*' ? k : null } }
            const b = liftedById.get(a.setting); return { profile: b?.profile_id || null, kind: b?.kind || null }
        }
        const who = await names([...blocks.map((b) => b.profile_id), ...blocks.map((b) => b.created_by), ...audit.map((a) => a.changed_by), ...audit.map((a) => target(a).profile)])

        // alertas da cota do Supabase (a mesma fonte do Financeiro): armazenamento e banda do mês, contra o que o plano inclui
        const included = new Map((metrics.data || []).map((m) => [m.metric_name, Number(m.included_value) || 0]))
        const storageGb = Number((stats.data as { storage_size_bytes?: number } | null)?.storage_size_bytes || 0) / GB
        const egressGb = (telemetry.data || []).reduce((s, r) => s + Number(r.egress_bytes || 0), 0) / GB
        const meters = [
            { label: 'Armazenamento do Supabase', used: storageGb, included: included.get('Armazenamento (Storage)') || 0, unit: 'GB' },
            { label: 'Banda do Supabase (30 dias)', used: egressGb, included: included.get('Largura de banda (Egress)') || 0, unit: 'GB' },
        ].filter((m) => m.included > 0)

        return NextResponse.json({
            overview: overview.data,
            top: top.data || [],
            denials: denials.data || [],
            blocks: blocks.map((b) => ({ ...b, profile_label: b.profile_id ? who.get(b.profile_id) || 'Pessoa' : null, created_by_label: b.created_by ? who.get(b.created_by) || 'Administrador' : 'Sistema' })),
            audit: audit.map((a) => { const t = target(a); return { ...a, changed_by_label: a.changed_by ? who.get(a.changed_by) || 'Administrador' : 'Sistema', target_profile: t.profile ? who.get(t.profile) || 'Pessoa' : null, target_kind: t.kind } }),
            meters,
        }, { headers: NO_STORE })
    }

    if (action === 'top') {
        const kind = body.kind == null || body.kind === '' ? null : String(body.kind)
        if (kind && !KIND.test(kind)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_upload_top_owners', { p_kind: kind, p_limit: 15 })
        if (error) return dbError(error)
        return NextResponse.json({ top: data || [] }, { headers: NO_STORE })
    }

    if (action === 'set_enforced') {
        if (typeof body.on !== 'boolean') return NextResponse.json({ error: 'Informe ligado ou desligado' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_upload_set_enforced', { p_on: body.on, p_admin: admin.id })
        if (error) return dbError(error)
        return NextResponse.json({ success: true, enforced: data === true })
    }

    if (action === 'block') {
        const v = validateBlock({ profile_id: body.profile_id as string | null, kind: body.kind as string | null, hours: body.hours as number | null, reason: body.reason as string | null })
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
        if (v.value.profile_id === admin.id) return NextResponse.json({ error: 'Você não pode bloquear a sua própria conta.' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_upload_block', { p_profile: v.value.profile_id, p_kind: v.value.kind, p_reason: v.value.reason, p_hours: v.value.hours, p_admin: admin.id })
        if (error) return dbError(error)
        return NextResponse.json({ success: true, id: data })
    }

    if (action === 'unblock') {
        const id = String(body.id || '')
        if (!UUID.test(id)) return NextResponse.json({ error: 'Bloqueio inválido' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_upload_unblock', { p_block: id, p_admin: admin.id })
        if (error) return dbError(error)
        return NextResponse.json({ success: true, lifted: data === true })
    }

    if (action === 'update_kind') {
        const kind = String(body.kind || '')
        if (!KIND.test(kind)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
        const { data: cur, error: curErr } = await supabaseAdmin.from('upload_kinds').select('enabled, requires_plan, max_bytes, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes').eq('kind', kind).maybeSingle()
        if (curErr) return dbError(curErr)
        if (!cur) return NextResponse.json({ error: 'Tipo de upload não encontrado' }, { status: 404 })
        const v = validatePatch(body.patch, { ...cur, max_bytes: Number(cur.max_bytes), per_day_bytes: cur.per_day_bytes == null ? null : Number(cur.per_day_bytes), per_user_bytes: cur.per_user_bytes == null ? null : Number(cur.per_user_bytes) } as KindLimits)
        if (!v.ok) return NextResponse.json({ error: 'Limites inválidos', fields: v.errors }, { status: 400 })
        if (Object.keys(v.patch).length === 0) return NextResponse.json({ success: true, changed: false })
        const { data, error } = await supabaseAdmin.rpc('admin_upload_update_kind', { p_kind: kind, p_patch: v.patch, p_admin: admin.id })
        if (error) return dbError(error)
        return NextResponse.json({ success: true, changed: true, kind: data })
    }

    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
}
