// components/AdminDashboard/HierarchyAdmin.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import { SCOPE_LABEL, type PermissionScope } from '@/lib/benefits/types'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const SCOPES = Object.keys(SCOPE_LABEL) as PermissionScope[]

interface StatusRow { id: string; slug: string; name: string; level: number; description: string | null; is_active: boolean }
interface PermissionRow { id: string; slug: string; name: string }
interface StatusPermRow { status_id: string; permission_id: string; scope: PermissionScope }
interface PlanRow { id: string; code: string; name: string; grantable: boolean; grant_permission: string | null }
interface PersonPerm { slug: string; name: string; scope: PermissionScope }
interface NetworkPerson {
    id: string; name: string | null; profile_slug: string | null; avatar_url: string | null; created_at: string
    upline_id: string | null; upline_name: string | null; upline_slug: string | null
    status_slug: string; status_name: string; status_level: number; children_count: number
}
interface NetworkSummary { total: number; roots: number; invited: number; by_status: { slug: string; name: string; level: number; count: number }[] }
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

    // ---------- permissões de uma pessoa (só dá pra TIRAR) ----------
    const [ovSlug, setOvSlug] = useState('')
    const [ovLoaded, setOvLoaded] = useState<{ name: string | null; profileSlug: string } | null>(null)
    const [ovStatus, setOvStatus] = useState<{ name: string; level: number } | null>(null)
    const [effective, setEffective] = useState<PersonPerm[]>([])
    const [overrides, setOverrides] = useState<OverrideRow[]>([])
    const loadPerson = async (slug = ovSlug) => {
        setBusy(true)
        try {
            const res = await callAdminApi<{ profile: { name: string | null; profileSlug: string }; status: { name: string; level: number } | null; effective: PersonPerm[]; overrides: OverrideRow[] }>(
                '/api/admin/hierarchy', { action: 'list_user_overrides', payload: { profileSlug: slug.trim() } })
            setOvLoaded(res.profile)
            setOvStatus(res.status)
            setEffective(res.effective)
            setOverrides(res.overrides)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar permissões')
            setOvLoaded(null)
        } finally {
            setBusy(false)
        }
    }
    const overrideOf = (permissionSlug: string) =>
        overrides.find((o) => (Array.isArray(o.permissions) ? o.permissions[0] : o.permissions)?.slug === permissionSlug)
    const takeAway = async (permissionSlug: string) => {
        const ok = await run('set_user_permission', { profileSlug: ovSlug, permission_slug: permissionSlug, effect: 'revoke' }, 'Permissão retirada')
        if (ok) loadPerson()
    }
    const restore = async (permissionSlug: string) => {
        const ok = await run('remove_user_permission', { profileSlug: ovSlug, permission_slug: permissionSlug }, 'Permissão restaurada')
        if (ok) loadPerson()
    }

    // ---------- rede de pessoas (quem convidou quem) ----------
    const [summary, setSummary] = useState<NetworkSummary | null>(null)
    const [search, setSearch] = useState('')
    const [searchResults, setSearchResults] = useState<NetworkPerson[] | null>(null)
    const [rootPeople, setRootPeople] = useState<NetworkPerson[]>([])
    const [rootMore, setRootMore] = useState(true)
    const [children, setChildren] = useState<Record<string, NetworkPerson[]>>({})
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [netBusy, setNetBusy] = useState(false)
    const PAGE = 50

    const fetchPeople = useCallback(async (payload: Record<string, unknown>) => {
        const res = await callAdminApi<{ people: NetworkPerson[] }>('/api/admin/hierarchy', { action: 'list_network', payload })
        return res.people
    }, [])

    const loadRoots = useCallback(async (reset: boolean, offset = 0) => {
        setNetBusy(true)
        try {
            const people = await fetchPeople({ limit: PAGE, offset })
            setRootPeople((prev) => (reset ? people : [...prev, ...people]))
            setRootMore(people.length === PAGE)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar a rede')
        } finally {
            setNetBusy(false)
        }
    }, [fetchPeople])

    useEffect(() => {
        callAdminApi<{ summary: NetworkSummary }>('/api/admin/hierarchy', { action: 'network_summary', payload: {} })
            .then((r) => setSummary(r.summary)).catch(() => {})
        loadRoots(true)
    }, [loadRoots])

    useEffect(() => {
        if (search.trim().length < 2) { setSearchResults(null); return }
        const t = setTimeout(async () => {
            setNetBusy(true)
            try { setSearchResults(await fetchPeople({ search: search.trim(), limit: 50 })) }
            catch (err: any) { toast.error(err.message || 'Erro na busca') }
            finally { setNetBusy(false) }
        }, 350)
        return () => clearTimeout(t)
    }, [search, fetchPeople])

    const toggleNode = async (person: NetworkPerson) => {
        const next = new Set(expanded)
        if (next.has(person.id)) { next.delete(person.id); setExpanded(next); return }
        next.add(person.id)
        setExpanded(next)
        if (!children[person.id]) {
            try {
                const kids = await fetchPeople({ parentId: person.id, limit: 200 })
                setChildren((prev) => ({ ...prev, [person.id]: kids }))
            } catch (err: any) { toast.error(err.message || 'Erro ao carregar convidados') }
        }
    }

    const statusColor = (level: number) => level >= 4 ? '#dc2626' : level >= 1 ? '#f97316' : colors.textSecondary

    const renderPerson = (person: NetworkPerson, depth: number, flat = false): React.ReactNode => (
        <div key={person.id}>
            <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 18 }}>
                {!flat && person.children_count > 0 ? (
                    <button onClick={() => toggleNode(person)} className="w-5 text-xs font-black flex-shrink-0" style={{ color: colors.accent }}>
                        {expanded.has(person.id) ? '▾' : '▸'}
                    </button>
                ) : <span className="w-5 flex-shrink-0" />}
                <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${colors.border}40` }}>
                    {getAvatarUrl(supabase, person.avatar_url) && <img src={getAvatarUrl(supabase, person.avatar_url)} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                        {person.name || `@${person.profile_slug}`}
                        {person.profile_slug && <span className="font-medium text-[11px]" style={labelStyle}> @{person.profile_slug}</span>}
                    </span>
                    <span className="block text-[11px]" style={labelStyle}>
                        {person.upline_id ? `convidado por ${person.upline_name || `@${person.upline_slug}`}` : 'entrou sem convite'}
                        {' · '}{new Date(person.created_at).toLocaleDateString('pt-BR')}
                        {person.children_count > 0 ? ` · convidou ${person.children_count}` : ''}
                    </span>
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${statusColor(person.status_level)}20`, color: statusColor(person.status_level) }}>
                    {person.status_name}
                </span>
                {person.profile_slug && (
                    <button onClick={() => { setPersonSlug(person.profile_slug!); document.getElementById('hier-person-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} className="text-[11px] font-bold flex-shrink-0" style={{ color: colors.accent }}>
                        Status
                    </button>
                )}
            </div>
            {!flat && expanded.has(person.id) && (children[person.id] || []).map((c) => renderPerson(c, depth + 1))}
            {!flat && expanded.has(person.id) && !children[person.id] && <p className="text-[11px]" style={{ ...labelStyle, paddingLeft: (depth + 1) * 18 + 20 }}>Carregando...</p>}
        </div>
    )

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
            {/* Rede: todas as pessoas e quem convidou quem */}
            <div style={cardStyle} className="space-y-3">
                {heading('Rede de pessoas', 'Todas as contas do iUser e quem convidou quem. Toque na seta para ver os convidados de cada pessoa.')}
                {summary && (
                    <div className="flex flex-wrap gap-2">
                        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>{summary.total} pessoas</span>
                        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>{summary.invited} vieram por convite</span>
                        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>{summary.roots} sem convite</span>
                        {summary.by_status.filter((b) => b.level > 0).map((b) => (
                            <span key={b.slug} className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${statusColor(b.level)}20`, color: statusColor(b.level) }}>{b.name}: {b.count}</span>
                        ))}
                    </div>
                )}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou @slug" style={{ ...inputStyle, width: '100%' }} />
                <div className="max-h-[480px] overflow-y-auto">
                    {searchResults ? (
                        searchResults.length === 0
                            ? <p className="text-xs py-2" style={labelStyle}>Ninguém encontrado.</p>
                            : searchResults.map((p) => renderPerson(p, 0, true))
                    ) : (
                        <>
                            {rootPeople.map((p) => renderPerson(p, 0))}
                            {rootMore && (
                                <button onClick={() => loadRoots(false, rootPeople.length)} disabled={netBusy} className="text-xs font-bold py-2" style={{ color: colors.accent }}>
                                    {netBusy ? 'Carregando...' : 'Carregar mais'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Status de uma pessoa */}
            <div id="hier-person-status" style={cardStyle} className="space-y-3">
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

            {/* Permissões de uma pessoa: só dá pra tirar */}
            <div style={cardStyle} className="space-y-3">
                {heading('Exceções por pessoa', 'Retire permissões de uma pessoa específica sem mudar o status dela. Para devolver, use "Restaurar".')}
                <div className="flex flex-wrap gap-2 items-center">
                    <input value={ovSlug} onChange={(e) => { setOvSlug(e.target.value); setOvLoaded(null) }} placeholder="@slug do perfil" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                    <button onClick={() => loadPerson()} disabled={busy || !ovSlug.trim()} className={btn} style={{ background: GRADIENT }}>Carregar</button>
                </div>
                {ovLoaded && (
                    <div className="space-y-2">
                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                            {ovLoaded.name || `@${ovLoaded.profileSlug}`}
                            {ovStatus && <span className="font-medium" style={labelStyle}> · {ovStatus.name} (nível {ovStatus.level})</span>}
                        </p>

                        <p className="text-[10px] font-black uppercase tracking-wider" style={labelStyle}>Permissões atuais</p>
                        {effective.length === 0 ? (
                            <p className="text-xs" style={labelStyle}>Essa pessoa não tem nenhuma permissão de gestão.</p>
                        ) : effective.map((e) => {
                            const ov = overrideOf(e.slug)
                            return (
                                <div key={e.slug} className="flex items-center gap-2 text-sm" style={{ color: colors.textPrimary }}>
                                    <span>{e.name}</span>
                                    <span className="text-[11px]" style={labelStyle}>{SCOPE_LABEL[e.scope]}</span>
                                    {ov?.effect === 'grant' ? (
                                        <button onClick={() => restore(e.slug)} disabled={busy} className="ml-auto text-[11px] font-bold" style={{ color: '#ef4444' }}>Remover</button>
                                    ) : (
                                        <button onClick={() => takeAway(e.slug)} disabled={busy} className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>Tirar</button>
                                    )}
                                </div>
                            )
                        })}

                        {overrides.some((o) => o.effect === 'revoke') && (
                            <>
                                <p className="text-[10px] font-black uppercase tracking-wider pt-2" style={labelStyle}>Retiradas</p>
                                {overrides.filter((o) => o.effect === 'revoke').map((o, i) => {
                                    const perm = Array.isArray(o.permissions) ? o.permissions[0] : o.permissions
                                    return (
                                        <div key={i} className="flex items-center gap-2 text-sm" style={{ color: colors.textPrimary }}>
                                            <span className="line-through opacity-70">{perm?.name}</span>
                                            <button onClick={() => perm && restore(perm.slug)} disabled={busy} className="ml-auto text-[11px] font-bold" style={{ color: colors.accent }}>Restaurar</button>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
