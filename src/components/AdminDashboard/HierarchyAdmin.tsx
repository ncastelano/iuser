// components/AdminDashboard/HierarchyAdmin.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { SCOPE_LABEL, type PermissionScope } from '@/lib/benefits/types'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const SCOPES = Object.keys(SCOPE_LABEL) as PermissionScope[]

interface StatusRow { id: string; slug: string; name: string; level: number; description: string | null; is_active: boolean }
interface PermissionRow { id: string; slug: string; name: string }
interface StatusPermRow { status_id: string; permission_id: string; scope: PermissionScope }
interface PlanRow { id: string; code: string; name: string; grantable: boolean; grant_permission: string | null }
interface OverrideRow { effect: 'grant' | 'revoke'; scope: PermissionScope | null; expires_at: string | null; reason: string | null; permissions: { slug: string; name: string } | { slug: string; name: string }[] | null }

interface Props { cardStyle: React.CSSProperties; colors: ThemeColors }

// Administração da hierarquia: status, permissões por status (com escopo),
// planos concedíveis e exceções por pessoa. Toda alteração passa por
// /api/admin/hierarchy, onde o banco confere a permissão manage_hierarchy,
// aplica as travas de segurança e registra a auditoria.
export default function HierarchyAdmin({ cardStyle, colors }: Props) {
    const [statuses, setStatuses] = useState<StatusRow[]>([])
    const [permissions, setPermissions] = useState<PermissionRow[]>([])
    const [statusPerms, setStatusPerms] = useState<StatusPermRow[]>([])
    const [plans, setPlans] = useState<PlanRow[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    const inputStyle: React.CSSProperties = {
        background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary,
        borderRadius: 12, padding: '8px 12px', fontSize: 13,
    }
    const labelStyle: React.CSSProperties = { color: colors.textSecondary }
    const btn = 'px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50'

    const load = useCallback(async () => {
        const [s, p, sp, pl] = await Promise.all([
            supabase.from('user_statuses').select('id, slug, name, level, description, is_active').order('level'),
            supabase.from('permissions').select('id, slug, name').order('name'),
            supabase.from('status_permissions').select('status_id, permission_id, scope'),
            supabase.from('plans').select('id, code, name, grantable, grant_permission').order('price'),
        ])
        setStatuses((s.data as StatusRow[]) || [])
        setPermissions((p.data as PermissionRow[]) || [])
        setStatusPerms((sp.data as StatusPermRow[]) || [])
        setPlans((pl.data as PlanRow[]) || [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const run = async (action: string, payload: Record<string, unknown>, ok: string) => {
        setBusy(true)
        try {
            await callAdminApi('/api/admin/hierarchy', { action, payload })
            toast.success(ok)
            await load()
            return true
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
            return false
        } finally {
            setBusy(false)
        }
    }

    // ---------- status de uma pessoa ----------
    const [personSlug, setPersonSlug] = useState('')
    const [personStatus, setPersonStatus] = useState('lider')
    const setPersonStatusNow = async () => {
        if (!personSlug.trim()) return
        setBusy(true)
        try {
            await callAdminApi('/api/admin/statuses/set-user-status', { profileSlug: personSlug.trim(), statusSlug: personStatus })
            toast.success(`@${personSlug.trim().replace(/^@/, '')} agora é ${statuses.find((x) => x.slug === personStatus)?.name || personStatus}`)
            setPersonSlug('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar status')
        } finally {
            setBusy(false)
        }
    }

    // ---------- criar/editar status ----------
    const [editing, setEditing] = useState<StatusRow | null>(null)
    const [form, setForm] = useState({ slug: '', name: '', level: '1', description: '' })
    const startEdit = (st: StatusRow | null) => {
        setEditing(st)
        setForm(st ? { slug: st.slug, name: st.name, level: String(st.level), description: st.description || '' } : { slug: '', name: '', level: '1', description: '' })
    }
    const saveStatus = async (isActive: boolean) => {
        const ok = await run('upsert_status', { slug: form.slug, name: form.name, level: Number(form.level), description: form.description, is_active: isActive }, 'Status salvo')
        if (ok) startEdit(null)
    }

    // ---------- permissões por status ----------
    const [permStatusSlug, setPermStatusSlug] = useState('lider')
    const permStatus = statuses.find((s) => s.slug === permStatusSlug)
    const scopeOf = (permissionId: string) => statusPerms.find((sp) => sp.status_id === permStatus?.id && sp.permission_id === permissionId)?.scope

    // ---------- exceções por pessoa ----------
    const [ovSlug, setOvSlug] = useState('')
    const [ovLoaded, setOvLoaded] = useState<{ name: string | null; profileSlug: string } | null>(null)
    const [overrides, setOverrides] = useState<OverrideRow[]>([])
    const [ovForm, setOvForm] = useState({ permission: 'grant_store_plan', effect: 'grant', scope: 'direct_invite' as PermissionScope, expires: '', reason: '' })
    const loadOverrides = async (slug = ovSlug) => {
        setBusy(true)
        try {
            const res = await callAdminApi<{ profile: { name: string | null; profileSlug: string }; overrides: OverrideRow[] }>('/api/admin/hierarchy', { action: 'list_user_overrides', payload: { profileSlug: slug.trim() } })
            setOvLoaded(res.profile)
            setOverrides(res.overrides)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar exceções')
            setOvLoaded(null)
        } finally {
            setBusy(false)
        }
    }
    const addOverride = async () => {
        const ok = await run('set_user_permission', {
            profileSlug: ovSlug, permission_slug: ovForm.permission, effect: ovForm.effect,
            scope: ovForm.effect === 'grant' ? ovForm.scope : null,
            expires_at: ovForm.expires ? new Date(`${ovForm.expires}T23:59:59`).toISOString() : null,
            reason: ovForm.reason,
        }, 'Exceção salva')
        if (ok) loadOverrides()
    }
    const removeOverride = async (permissionSlug: string) => {
        const ok = await run('remove_user_permission', { profileSlug: ovSlug, permission_slug: permissionSlug }, 'Exceção removida')
        if (ok) loadOverrides()
    }

    if (loading) return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    const heading = (t: string, sub?: string) => (
        <div>
            <p className="text-xs font-black uppercase tracking-wider" style={labelStyle}>{t}</p>
            {sub && <p className="text-xs mt-1" style={labelStyle}>{sub}</p>}
        </div>
    )
    const grantPermissions = permissions.filter((p) => p.slug.startsWith('grant_') && p.slug !== 'grant_any_plan')

    return (
        <div className="space-y-5">
            {/* Status de uma pessoa */}
            <div style={cardStyle} className="space-y-3">
                {heading('Status de uma pessoa', 'Define a posição na hierarquia; as permissões vêm do status (e das exceções abaixo).')}
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={personSlug} onChange={(e) => setPersonSlug(e.target.value)} placeholder="@slug do perfil" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                    <select value={personStatus} onChange={(e) => setPersonStatus(e.target.value)} style={inputStyle}>
                        {statuses.filter((s) => s.is_active).map((s) => <option key={s.slug} value={s.slug}>{s.name} (nível {s.level})</option>)}
                    </select>
                    <button onClick={setPersonStatusNow} disabled={busy || !personSlug.trim()} className={btn} style={{ background: GRADIENT }}>Definir status</button>
                </div>
            </div>

            {/* Status */}
            <div style={cardStyle} className="space-y-3">
                {heading('Status', 'Níveis e nomes são dados: dá pra criar novos sem mexer no código. Usuário (0) e Administrador são protegidos.')}
                <div className="space-y-1.5">
                    {statuses.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 text-sm" style={{ color: colors.textPrimary, opacity: st.is_active ? 1 : 0.5 }}>
                            <span className="font-bold">{st.name}</span>
                            <span className="text-[11px]" style={labelStyle}>{st.slug} · nível {st.level}{st.is_active ? '' : ' · inativo'}</span>
                            <button onClick={() => startEdit(st)} className="ml-auto text-[11px] font-bold" style={{ color: colors.accent }}>Editar</button>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 items-end pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome" style={{ ...inputStyle, width: 130 }} />
                    <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug" disabled={!!editing} style={{ ...inputStyle, width: 120 }} />
                    <input type="number" min={0} max={100} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="nível" style={{ ...inputStyle, width: 80 }} />
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                    <button onClick={() => saveStatus(true)} disabled={busy || !form.slug || !form.name} className={btn} style={{ background: GRADIENT }}>{editing ? 'Salvar' : 'Criar status'}</button>
                    {editing && (
                        <>
                            <button onClick={() => saveStatus(!editing.is_active)} disabled={busy} className={btn} style={{ background: colors.textSecondary }}>{editing.is_active ? 'Desativar' : 'Reativar'}</button>
                            <button onClick={() => startEdit(null)} className="text-xs font-bold" style={labelStyle}>Cancelar</button>
                        </>
                    )}
                </div>
            </div>

            {/* Permissões por status */}
            <div style={cardStyle} className="space-y-3">
                {heading('Permissões por status', 'Marque o que o status permite e escolha o escopo (sobre quem).')}
                <select value={permStatusSlug} onChange={(e) => setPermStatusSlug(e.target.value)} style={inputStyle}>
                    {statuses.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
                <div className="space-y-2">
                    {permissions.map((p) => {
                        const scope = scopeOf(p.id)
                        return (
                            <div key={p.id} className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2 text-sm flex-1 min-w-[180px]" style={{ color: colors.textPrimary }}>
                                    <input
                                        type="checkbox"
                                        checked={!!scope}
                                        disabled={busy || !permStatus}
                                        onChange={(e) => e.target.checked
                                            ? run('set_status_permission', { status_slug: permStatusSlug, permission_slug: p.slug, scope: 'direct_invite' }, 'Permissão adicionada')
                                            : run('remove_status_permission', { status_slug: permStatusSlug, permission_slug: p.slug }, 'Permissão removida')}
                                    />
                                    <span>{p.name} <span className="text-[10px]" style={labelStyle}>{p.slug}</span></span>
                                </label>
                                {scope && (
                                    <select
                                        value={scope}
                                        disabled={busy}
                                        onChange={(e) => run('set_status_permission', { status_slug: permStatusSlug, permission_slug: p.slug, scope: e.target.value }, 'Escopo atualizado')}
                                        style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                                    >
                                        {SCOPES.map((sc) => <option key={sc} value={sc}>{SCOPE_LABEL[sc]}</option>)}
                                    </select>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Planos concedíveis */}
            <div style={cardStyle} className="space-y-3">
                {heading('Planos que podem ser concedidos', 'Marque os planos elegíveis e a permissão exigida de quem concede (grant_any_plan cobre todos os marcados).')}
                <div className="space-y-2">
                    {plans.map((pl) => (
                        <div key={pl.id} className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-sm flex-1 min-w-[160px]" style={{ color: colors.textPrimary }}>
                                <input
                                    type="checkbox"
                                    checked={pl.grantable}
                                    disabled={busy}
                                    onChange={(e) => run('set_plan_grant_settings', { plan_id: pl.id, grantable: e.target.checked, grant_permission: pl.grant_permission }, 'Plano atualizado')}
                                />
                                {pl.name}
                            </label>
                            <select
                                value={pl.grant_permission || ''}
                                disabled={busy}
                                onChange={(e) => run('set_plan_grant_settings', { plan_id: pl.id, grantable: pl.grantable, grant_permission: e.target.value }, 'Plano atualizado')}
                                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                            >
                                <option value="">só grant_any_plan</option>
                                {grantPermissions.map((p) => <option key={p.slug} value={p.slug}>{p.slug}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            {/* Exceções por pessoa */}
            <div style={cardStyle} className="space-y-3">
                {heading('Exceções por pessoa', 'Soma ou revoga uma permissão de uma pessoa específica, sem mudar o status dela.')}
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={ovSlug} onChange={(e) => { setOvSlug(e.target.value); setOvLoaded(null) }} placeholder="@slug do perfil" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                    <button onClick={() => loadOverrides()} disabled={busy || !ovSlug.trim()} className={btn} style={{ background: GRADIENT }}>Carregar</button>
                </div>
                {ovLoaded && (
                    <>
                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{ovLoaded.name || `@${ovLoaded.profileSlug}`}</p>
                        {overrides.length === 0 ? (
                            <p className="text-xs" style={labelStyle}>Nenhuma exceção.</p>
                        ) : overrides.map((o, i) => {
                            const perm = Array.isArray(o.permissions) ? o.permissions[0] : o.permissions
                            return (
                                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: colors.textPrimary }}>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: o.effect === 'grant' ? '#22c55e20' : '#ef444420', color: o.effect === 'grant' ? '#22c55e' : '#ef4444' }}>
                                        {o.effect === 'grant' ? 'Concede' : 'Revoga'}
                                    </span>
                                    <span>{perm?.name}{o.scope ? ` · ${SCOPE_LABEL[o.scope]}` : ''}{o.expires_at ? ` · até ${new Date(o.expires_at).toLocaleDateString('pt-BR')}` : ''}</span>
                                    <button onClick={() => perm && removeOverride(perm.slug)} disabled={busy} className="ml-auto text-[11px] font-bold" style={{ color: '#ef4444' }}>Remover</button>
                                </div>
                            )
                        })}
                        <div className="flex flex-wrap gap-2 items-center pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                            <select value={ovForm.permission} onChange={(e) => setOvForm({ ...ovForm, permission: e.target.value })} style={inputStyle}>
                                {permissions.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                            </select>
                            <select value={ovForm.effect} onChange={(e) => setOvForm({ ...ovForm, effect: e.target.value })} style={inputStyle}>
                                <option value="grant">Conceder</option>
                                <option value="revoke">Revogar</option>
                            </select>
                            {ovForm.effect === 'grant' && (
                                <select value={ovForm.scope} onChange={(e) => setOvForm({ ...ovForm, scope: e.target.value as PermissionScope })} style={inputStyle}>
                                    {SCOPES.map((sc) => <option key={sc} value={sc}>{SCOPE_LABEL[sc]}</option>)}
                                </select>
                            )}
                            <input type="date" value={ovForm.expires} onChange={(e) => setOvForm({ ...ovForm, expires: e.target.value })} style={inputStyle} title="Validade (opcional)" />
                            <input value={ovForm.reason} onChange={(e) => setOvForm({ ...ovForm, reason: e.target.value })} placeholder="Motivo" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
                            <button onClick={addOverride} disabled={busy} className={btn} style={{ background: GRADIENT }}>Salvar exceção</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
