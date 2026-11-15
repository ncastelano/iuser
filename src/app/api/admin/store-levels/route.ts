// app/api/admin/store-levels/route.ts
//
// Admin → Pontuação → Lojas → "Níveis da loja" (migration 20261130000056). UMA rota POST com `action`:
//   overview      → a escada (inclusive níveis desligados), a regra de descida e quantas lojas há em cada nível
//   save_level    → nome, pontos mínimos, cores, animada e ligada de UM nível (a escada inteira é conferida: tem de subir)
//   save_settings → regra ligada/desligada e dias para descer um degrau
// Só o administrador geral. O id do admin vem do login (nunca do corpo). Toda mudança grava linha em admin_config_audit (scope `store_levels`)
// e recalcula os níveis na hora. A mesma validação da tela (modules/store-levels) roda aqui; o banco ainda tem os CHECKs.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { validateLadder, validateLevelEdit, validateLevelSettings, type LevelEdit } from '@/modules/store-levels/domain'

export const maxDuration = 60

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function audit(adminId: string, setting: string, oldValue: unknown, newValue: unknown) {
    await supabaseAdmin.from('admin_config_audit').insert({ scope: 'store_levels', setting, old_value: oldValue ?? null, new_value: newValue ?? null, changed_by: adminId })
}
async function recompute(): Promise<string | null> {
    const { error } = await supabaseAdmin.rpc('refresh_store_levels')
    return error?.message || null
}
const toEdit = (r: any): LevelEdit => ({ level: Number(r.level), name: String(r.name), minPoints: Number(r.min_points), colors: Array.isArray(r.colors) ? r.colors : [], animated: r.animated === true, isActive: r.is_active !== false })

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return fail('Sem permissão', 403)
    let body: any
    try { body = await req.json() } catch { return fail('Pedido inválido') }
    const action = String(body?.action || 'overview')

    if (action === 'overview') {
        const [levels, settings, counts] = await Promise.all([
            supabaseAdmin.from('store_levels').select('*').order('level'),
            supabaseAdmin.from('store_level_settings').select('*').eq('id', true).maybeSingle(),
            supabaseAdmin.from('stores').select('store_level').eq('is_active', true),
        ])
        const err = levels.error || settings.error || counts.error
        if (err) return fail(err.message, 500)
        const perLevel: Record<string, number> = {}
        for (const r of counts.data || []) { const k = String((r as any).store_level ?? 0); perLevel[k] = (perLevel[k] || 0) + 1 }
        return NextResponse.json({ levels: levels.data || [], settings: settings.data || null, per_level: perLevel })
    }

    if (action === 'save_level') {
        const edit: LevelEdit = {
            level: Math.round(Number(body.level)), name: String(body.name ?? '').trim(), minPoints: Math.round(Number(body.min_points)),
            colors: Array.isArray(body.colors) ? body.colors.map((c: unknown) => String(c).trim()) : [], animated: body.animated === true, isActive: body.is_active !== false,
        }
        const msg = validateLevelEdit(edit)
        if (msg) return fail(msg)
        const { data: all, error } = await supabaseAdmin.from('store_levels').select('*').order('level')
        if (error) return fail(error.message, 500)
        const before = (all || []).find((r: any) => Number(r.level) === edit.level)
        const ladder = (all || []).map(toEdit).filter((l) => l.level !== edit.level).concat(edit)
        const ladderMsg = validateLadder(ladder)
        if (ladderMsg) return fail(ladderMsg)
        const row = { level: edit.level, name: edit.name, min_points: edit.minPoints, colors: edit.colors, animated: edit.animated, is_active: edit.isActive, updated_at: new Date().toISOString(), updated_by: admin.id }
        const { error: upErr } = await supabaseAdmin.from('store_levels').upsert(row, { onConflict: 'level' })
        if (upErr) return fail(upErr.message, 500)
        await audit(admin.id, `level_${edit.level}`, before ?? null, row)
        return NextResponse.json({ ok: true, refresh_error: await recompute() })
    }

    if (action === 'save_settings') {
        const dropAfterDays = Math.round(Number(body.drop_after_days))
        const msg = validateLevelSettings({ dropAfterDays })
        if (msg) return fail(msg)
        const { data: before } = await supabaseAdmin.from('store_level_settings').select('*').eq('id', true).maybeSingle()
        const row = { id: true, enabled: body.enabled !== false, drop_after_days: dropAfterDays, updated_at: new Date().toISOString(), updated_by: admin.id }
        const { error } = await supabaseAdmin.from('store_level_settings').upsert(row, { onConflict: 'id' })
        if (error) return fail(error.message, 500)
        await audit(admin.id, 'settings', before ?? null, row)
        return NextResponse.json({ ok: true, refresh_error: await recompute() })
    }

    return fail('Ação desconhecida')
}
