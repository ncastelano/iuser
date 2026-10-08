// app/api/admin/graduation/route.ts
//
// Única rota da administração da GRADUAÇÃO (níveis de comissão, concessões, comissão personalizada, auditoria).
// Quem é administrador geral é conferido AQUI no servidor (token → requireSuperAdmin); as regras e travas de
// verdade (teto de 70%, escada coerente, nível nunca desce, histórico, logs) ficam nas funções do banco, que
// só o service role executa — o navegador nunca escreve nessas tabelas.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { percentToBp } from '@/lib/graduation'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

/** Percentual digitado (ex: "62,5") → pontos-base inteiros; vazio → null; inválido → NaN */
function optionalBp(value: unknown): number | null {
    if (value === undefined || value === null || String(value).trim() === '') return null
    const bp = percentToBp(value as string | number)
    return Number.isInteger(bp) ? bp : NaN
}

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')
    const payload = body?.payload || {}
    const rpc = async (fn: string, args: Record<string, unknown>) => {
        const { data, error } = await supabaseAdmin.rpc(fn, args)
        if (error) return { error: NextResponse.json({ error: error.message }, { status: 400 }) }
        return { data }
    }

    switch (action) {
        case 'overview': {
            const r = await rpc('admin_levels_overview', {})
            return r.error ?? NextResponse.json(r.data)
        }

        case 'save_level': {
            const id = payload.id ? String(payload.id) : null
            if (id && !UUID_RE.test(id)) return bad('Nível inválido')
            const d = payload.data || {}
            const data: Record<string, unknown> = {}
            if (d.name !== undefined) data.name = String(d.name).trim()
            for (const [key, field] of [['prepaidPercent', 'commission_prepaid_bp'], ['postpaidPercent', 'commission_postpaid_bp']] as const) {
                if (d[key] !== undefined && String(d[key]).trim() !== '') {
                    const bp = percentToBp(d[key])
                    if (!Number.isInteger(bp) || bp < 0) return bad('Percentual inválido')
                    data[field] = bp
                }
            }
            if (d.minDirectReferrals !== undefined && String(d.minDirectReferrals).trim() !== '') {
                const n = Number(d.minDirectReferrals)
                if (!Number.isInteger(n) || n < 0) return bad('A quantidade de indicados precisa ser um número inteiro, zero ou mais')
                data.min_direct_referrals = n
            }
            if (d.isActive !== undefined) data.is_active = !!d.isActive
            for (const key of ['border_style', 'border_color', 'background_style', 'badge_style'] as const) {
                if (d[key] !== undefined) data[key] = String(d[key])
            }
            if (Array.isArray(d.border_colors)) data.border_colors = d.border_colors.map(String)
            if (d.icon !== undefined) data.icon = String(d.icon)
            if (d.description !== undefined) data.description = String(d.description)
            if (!id && (!data.name || data.commission_prepaid_bp === undefined)) return bad('Informe o nome e a comissão do novo nível')
            const r = await rpc('admin_upsert_level', { p_admin: admin.id, p_id: id, p_data: data })
            return r.error ?? NextResponse.json({ id: r.data })
        }

        case 'reorder': {
            const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : []
            if (!ids.length || ids.some((i: string) => !UUID_RE.test(i))) return bad('Ordem inválida')
            const r = await rpc('admin_reorder_levels', { p_admin: admin.id, p_ids: ids })
            return r.error ?? NextResponse.json({ ok: true })
        }

        case 'settings': {
            const maxBp = optionalBp(payload.maxPercent)
            const refCents = payload.postpaidReferenceReais === undefined || String(payload.postpaidReferenceReais).trim() === ''
                ? null
                : Math.round(Number(String(payload.postpaidReferenceReais).replace(',', '.')) * 100)
            if ((maxBp !== null && !Number.isInteger(maxBp)) || (refCents !== null && !Number.isInteger(refCents))) return bad('Valor inválido')
            const r = await rpc('admin_set_network_settings', { p_admin: admin.id, p_max_bp: maxBp, p_postpaid_reference_cents: refCents })
            return r.error ?? NextResponse.json({ ok: true })
        }

        case 'recheck': {
            const r = await rpc('recheck_all_levels', {})
            return r.error ?? NextResponse.json({ upgraded: r.data })
        }

        case 'logs': {
            const userId = payload.userId ? String(payload.userId) : null
            if (userId && !UUID_RE.test(userId)) return bad('Pessoa inválida')
            const r = await rpc('admin_list_system_logs', { p_user: userId, p_limit: Number(payload.limit) || 50 })
            return r.error ?? NextResponse.json({ logs: r.data })
        }
    }

    // ---- ações sobre UMA pessoa ----
    const userId = String(payload.userId || '')
    if (!UUID_RE.test(userId)) return bad('Pessoa inválida')
    const reason = typeof payload.reason === 'string' ? payload.reason.slice(0, 300) : null

    switch (action) {
        case 'user': {
            const r = await rpc('admin_get_user_graduation', { p_user: userId })
            return r.error ?? NextResponse.json(r.data)
        }
        case 'grant_level': {
            const levelId = String(payload.levelId || '')
            if (!UUID_RE.test(levelId)) return bad('Nível inválido')
            const r = await rpc('admin_grant_level', { p_admin: admin.id, p_user: userId, p_level_id: levelId, p_reason: reason })
            return r.error ?? NextResponse.json({ ok: true })
        }
        case 'remove_level': {
            const r = await rpc('admin_remove_manual_level', { p_admin: admin.id, p_user: userId, p_reason: reason })
            return r.error ?? NextResponse.json({ ok: true })
        }
        case 'set_commission': {
            const pre = optionalBp(payload.prepaidPercent)
            const pos = optionalBp(payload.postpaidPercent)
            if (Number.isNaN(pre) || Number.isNaN(pos)) return bad('Percentual inválido')
            if ((pre !== null && pre < 0) || (pos !== null && pos < 0)) return bad('A comissão não pode ser negativa')
            const r = await rpc('admin_set_custom_commission', { p_admin: admin.id, p_user: userId, p_prepaid_bp: pre, p_postpaid_bp: pos, p_reason: reason })
            return r.error ?? NextResponse.json({ ok: true })
        }
        case 'clear_commission': {
            const r = await rpc('admin_clear_custom_commission', { p_admin: admin.id, p_user: userId, p_reason: reason })
            return r.error ?? NextResponse.json({ ok: true })
        }
        case 'tree': {
            // Rede de qualquer pessoa, um nível por vez e paginada (o admin pode abrir a rede de todo mundo)
            const r = await rpc('_network_children', { p_parent: userId, p_limit: Math.min(Number(payload.limit) || 30, 100), p_offset: Math.max(Number(payload.offset) || 0, 0) })
            return r.error ?? NextResponse.json({ children: r.data || [] })
        }
    }

    return bad('Ação desconhecida')
}
