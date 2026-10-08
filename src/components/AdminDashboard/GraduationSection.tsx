// src/components/AdminDashboard/GraduationSection.tsx
//
// Aba "Graduação" do administrador geral: níveis (criar, editar, reordenar, ativar/desativar, visual de cada um),
// pessoas (nível concedido, comissão personalizada, rede, histórico), auditoria e ajustes (teto de comissão).
// Toda ação passa por /api/admin/graduation, que confere o administrador no servidor; as regras e travas de
// verdade (teto, escada coerente, nível nunca desce) ficam no banco. Aqui só se opera e se mostra.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { hexToRgb } from '@/lib/color'
import { callAdminApi } from '@/lib/callAdminApi'
import { supabase } from '@/lib/supabase/client'
import type { ThemeColors } from '@/app/contexts/theme'
import ProfilePicker from './ProfilePicker'
import LevelBadge, { LevelAvatarFrame } from '@/components/Graduation/LevelBadge'
import NetworkTree, { TREE_PAGE_SIZE, type TreeLoader } from '@/components/Graduation/NetworkTree'
import {
    bpToPercent, formatCents, formatPercent, SOURCE_LABELS,
    type EffectiveCommission, type GraduationHistoryItem, type NetworkChild, type NetworkLevel,
} from '@/lib/graduation'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Overview {
    settings: { max_commission_bp: number; postpaid_reference_cents: number }
    plans: { code: string; name: string; price_cents: number }[] | null
    levels: NetworkLevel[]
}

interface UserGraduation {
    user: { id: string; name: string | null; email: string | null; profileSlug: string | null; avatarUrl: string | null; createdAt: string; uplineId: string | null }
    current_level: NetworkLevel
    highest_level: NetworkLevel | null
    manual_level: NetworkLevel | null
    level_achieved_at: string | null
    direct_referrals: number
    total_network: number
    standard_prepaid_bp: number
    standard_postpaid_bp: number
    custom_enabled: boolean
    custom_prepaid_bp: number | null
    custom_postpaid_bp: number | null
    effective_prepaid: EffectiveCommission
    effective_postpaid: EffectiveCommission
    history: (GraduationHistoryItem & { by: string | null })[]
}

interface SystemLog {
    id: string
    action: string
    old: any
    new: any
    reason: string | null
    at: string
    actor: string | null
    actorSlug: string | null
    target: string | null
    targetSlug: string | null
}

interface Props {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

type Tab = 'niveis' | 'pessoas' | 'auditoria' | 'ajustes'

const api = <T,>(action: string, payload: Record<string, unknown> = {}) => callAdminApi<T>('/api/admin/graduation', { action, payload })

export default function GraduationSection({ cardStyle, colors }: Props) {
    const [tab, setTab] = useState<Tab>('niveis')
    const [overview, setOverview] = useState<Overview | null>(null)
    const [loading, setLoading] = useState(true)

    const loadOverview = useCallback(async () => {
        try {
            setOverview(await api<Overview>('overview'))
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar a graduação')
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => { loadOverview() }, [loadOverview])

    if (loading) return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    if (!overview) return <div style={cardStyle} className="text-sm">Não foi possível carregar a graduação. Confira se a migration foi aplicada.</div>

    const tabs: { id: Tab; label: string }[] = [
        { id: 'niveis', label: 'Níveis' },
        { id: 'pessoas', label: 'Pessoas' },
        { id: 'auditoria', label: 'Auditoria' },
        { id: 'ajustes', label: 'Ajustes' },
    ]

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Graduação e comissões</h3>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Níveis que definem a comissão de cada pessoa por indicar. Quem sobe de nível nunca perde; a comissão personalizada não muda o nível.
                </p>
            </div>

            <div className="flex gap-2 flex-wrap">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className="text-xs font-black px-4 py-2 rounded-full"
                        style={{ background: tab === t.id ? colors.accent : `${colors.border}40`, color: tab === t.id ? colors.accentText : colors.textPrimary }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'niveis' && <LevelsPanel overview={overview} reload={loadOverview} cardStyle={cardStyle} colors={colors} />}
            {tab === 'pessoas' && <PeoplePanel overview={overview} cardStyle={cardStyle} colors={colors} />}
            {tab === 'auditoria' && <AuditPanel overview={overview} cardStyle={cardStyle} colors={colors} />}
            {tab === 'ajustes' && <SettingsPanel overview={overview} reload={loadOverview} cardStyle={cardStyle} colors={colors} />}
        </div>
    )
}

// ============================================================================
// Campos
// ============================================================================
function Field({ label, children, colors, hint }: { label: string; children: React.ReactNode; colors: ThemeColors; hint?: string }) {
    return (
        <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{label}</span>
            {children}
            {hint && <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{hint}</span>}
        </label>
    )
}

const inputStyle = (colors: ThemeColors): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: 12, fontSize: 14, outline: 'none',
    background: `${colors.border}25`, border: `1px solid ${colors.border}`, color: colors.textPrimary,
})

function Dialog({ title, onClose, colors, children }: { title: string; onClose: () => void; colors: ThemeColors; children: React.ReactNode }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    return (
        <div onClick={onClose} className="fixed inset-0 z-[10000] flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.55)' }} role="dialog" aria-modal="true">
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-3xl p-5 overflow-y-auto"
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow, maxHeight: '92vh' }}
            >
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h4 className="text-base font-black" style={{ color: colors.textPrimary }}>{title}</h4>
                    <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full text-sm font-black" style={{ background: `${colors.border}66`, color: colors.textSecondary }}>✕</button>
                </div>
                {children}
            </div>
        </div>
    )
}

// ============================================================================
// NÍVEIS
// ============================================================================
function LevelsPanel({ overview, reload, cardStyle, colors }: { overview: Overview; reload: () => Promise<void>; cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [editing, setEditing] = useState<NetworkLevel | 'new' | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const levels = overview.levels

    const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
        setBusy(key)
        try {
            await fn()
            toast.success(okMsg)
            await reload()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível salvar')
        } finally {
            setBusy(null)
        }
    }

    const move = (index: number, delta: -1 | 1) => {
        const ids = levels.map((l) => l.id)
        const target = index + delta
        if (target < 0 || target >= ids.length) return
        ;[ids[index], ids[target]] = [ids[target], ids[index]]
        run(`move-${index}`, () => api('reorder', { ids }), 'Ordem atualizada')
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    O primeiro nível ativo é o inicial (0 indicados). A quantidade de indicados precisa crescer de um nível pro outro. Teto de comissão: {formatPercent(overview.settings.max_commission_bp)}.
                </p>
                <button onClick={() => setEditing('new')} className="text-xs font-black px-4 py-2 rounded-full text-white" style={{ background: GRADIENT }}>
                    Criar novo nível
                </button>
            </div>

            {levels.map((l, i) => (
                <div key={l.id} style={{ ...cardStyle, opacity: l.is_active ? 1 : 0.6 }} className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>{i + 1}</span>
                            <LevelBadge level={l} size="md" />
                            {!l.is_active && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>Desativado</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button disabled={i === 0 || busy !== null} onClick={() => move(i, -1)} aria-label="Subir" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ArrowUp size={14} /></button>
                            <button disabled={i === levels.length - 1 || busy !== null} onClick={() => move(i, 1)} aria-label="Descer" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ArrowDown size={14} /></button>
                            <button onClick={() => setEditing(l)} className="text-xs font-black px-3 py-1.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>Editar</button>
                            <button
                                disabled={busy !== null}
                                onClick={() => run(`active-${l.id}`, () => api('save_level', { id: l.id, data: { isActive: !l.is_active } }), l.is_active ? 'Nível desativado' : 'Nível ativado')}
                                className="text-xs font-black px-3 py-1.5 rounded-full disabled:opacity-50"
                                style={{ background: l.is_active ? '#ef444418' : '#10b98118', color: l.is_active ? '#ef4444' : '#10b981' }}
                            >
                                {l.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <Stat label="Comissão pré-pago" value={formatPercent(l.commission_prepaid_bp)} colors={colors} />
                        <Stat label="Comissão pós-pago" value={formatPercent(l.commission_postpaid_bp)} colors={colors} />
                        <Stat label="Requisito" value={l.min_direct_referrals === 0 ? 'Inicial' : `${l.min_direct_referrals} indicados`} colors={colors} />
                        <Stat label="Pessoas no nível" value={String(l.users ?? 0)} colors={colors} />
                    </div>
                </div>
            ))}

            {editing && (
                <LevelForm
                    level={editing === 'new' ? null : editing}
                    colors={colors}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { setEditing(null); await reload() }}
                />
            )}
        </div>
    )
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
    return (
        <div>
            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{label}</p>
            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{value}</p>
        </div>
    )
}

const BORDER_STYLES = [
    ['solid', 'Simples'], ['double', 'Dupla'], ['dashed', 'Tracejada'], ['glow', 'Brilho'], ['gradient', 'Degradê'], ['diamond', 'Diamante'],
] as const
const BACKGROUND_STYLES = [['none', 'Sem fundo'], ['soft', 'Suave'], ['glass', 'Vidro'], ['gradient', 'Degradê']] as const
const BADGE_STYLES = [['pill', 'Pílula'], ['shield', 'Escudo'], ['ribbon', 'Faixa'], ['plain', 'Só texto']] as const

function LevelForm({ level, colors, onClose, onSaved }: { level: NetworkLevel | null; colors: ThemeColors; onClose: () => void; onSaved: () => Promise<void> }) {
    const [form, setForm] = useState({
        name: level?.name ?? '',
        prepaid: level ? String(bpToPercent(level.commission_prepaid_bp)) : '',
        postpaid: level ? String(bpToPercent(level.commission_postpaid_bp)) : '',
        min: level ? String(level.min_direct_referrals) : '',
        isActive: level?.is_active ?? true,
        border_style: level?.border_style ?? 'solid',
        border_color: level?.border_color ?? '#94a3b8',
        border_colors: level?.border_colors?.length ? level.border_colors : ['#67e8f9', '#a5b4fc'],
        background_style: level?.background_style ?? 'none',
        badge_style: level?.badge_style ?? 'pill',
        icon: level?.icon ?? '',
        description: level?.description ?? '',
    })
    const [saving, setSaving] = useState(false)
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
    const usesGradient = form.border_style === 'gradient' || form.border_style === 'diamond'

    const preview: NetworkLevel = {
        id: 'preview', level_order: 0, requirements: {}, commission_prepaid_bp: 0, commission_postpaid_bp: 0, min_direct_referrals: 0, is_active: true,
        name: form.name || 'Nome do nível', border_style: form.border_style as NetworkLevel['border_style'], border_color: form.border_color,
        border_colors: usesGradient ? form.border_colors : [], background_style: form.background_style as NetworkLevel['background_style'],
        badge_style: form.badge_style as NetworkLevel['badge_style'], icon: form.icon || null, description: null,
    }

    const save = async () => {
        setSaving(true)
        try {
            await api('save_level', {
                id: level?.id ?? null,
                data: {
                    name: form.name,
                    prepaidPercent: form.prepaid,
                    postpaidPercent: form.postpaid === '' ? form.prepaid : form.postpaid,
                    minDirectReferrals: form.min === '' ? 0 : form.min,
                    isActive: form.isActive,
                    border_style: form.border_style,
                    border_color: form.border_color,
                    border_colors: usesGradient ? form.border_colors : [],
                    background_style: form.background_style,
                    badge_style: form.badge_style,
                    icon: form.icon,
                    description: form.description,
                },
            })
            toast.success(level ? 'Nível atualizado' : 'Nível criado')
            await onSaved()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível salvar')
        } finally {
            setSaving(false)
        }
    }

    const sel = (value: string, onChange: (v: string) => void, options: readonly (readonly [string, string])[]) => (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(colors)}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
    )

    return (
        <Dialog title={level ? `Editar ${level.name}` : 'Novo nível'} onClose={onClose} colors={colors}>
            <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: `${colors.border}25` }}>
                    <LevelAvatarFrame level={preview}><span className="w-10 h-10 flex items-center justify-center text-sm font-black text-white" style={{ background: GRADIENT }}>A</span></LevelAvatarFrame>
                    <LevelBadge level={preview} size="lg" />
                </div>

                <Field label="Nome" colors={colors}><input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={40} style={inputStyle(colors)} placeholder="Ex: Platina" /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Comissão pré-pago (%)" colors={colors}><input value={form.prepaid} onChange={(e) => set('prepaid', e.target.value)} inputMode="decimal" style={inputStyle(colors)} placeholder="50" /></Field>
                    <Field label="Comissão pós-pago (%)" colors={colors} hint="Vazio = igual ao pré-pago"><input value={form.postpaid} onChange={(e) => set('postpaid', e.target.value)} inputMode="decimal" style={inputStyle(colors)} placeholder="50" /></Field>
                </div>
                <Field label="Indicados diretos necessários" colors={colors} hint="O primeiro nível precisa ser 0; a quantidade cresce a cada nível">
                    <input value={form.min} onChange={(e) => set('min', e.target.value.replace(/\D/g, ''))} inputMode="numeric" style={inputStyle(colors)} placeholder="0" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Borda" colors={colors}>{sel(form.border_style, (v) => set('border_style', v as typeof form.border_style), BORDER_STYLES)}</Field>
                    <Field label="Cor da borda" colors={colors}>
                        <input type="color" value={form.border_color} onChange={(e) => set('border_color', e.target.value)} style={{ ...inputStyle(colors), padding: 4, height: 40 }} />
                    </Field>
                </div>
                {usesGradient && (
                    <Field label="Cores do degradê (2 a 4)" colors={colors}>
                        <div className="flex items-center gap-2 flex-wrap">
                            {form.border_colors.map((c, i) => (
                                <input key={i} type="color" value={c} onChange={(e) => set('border_colors', form.border_colors.map((x, j) => (j === i ? e.target.value : x)))} style={{ width: 44, height: 36, border: 'none', background: 'none' }} />
                            ))}
                            {form.border_colors.length < 4 && <button type="button" onClick={() => set('border_colors', [...form.border_colors, '#f0abfc'])} className="text-xs font-black px-2 py-1 rounded-full" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>+ cor</button>}
                            {form.border_colors.length > 2 && <button type="button" onClick={() => set('border_colors', form.border_colors.slice(0, -1))} className="text-xs font-black px-2 py-1 rounded-full" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>− cor</button>}
                        </div>
                    </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Fundo" colors={colors}>{sel(form.background_style, (v) => set('background_style', v as typeof form.background_style), BACKGROUND_STYLES)}</Field>
                    <Field label="Selo" colors={colors}>{sel(form.badge_style, (v) => set('badge_style', v as typeof form.badge_style), BADGE_STYLES)}</Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Ícone (opcional)" colors={colors} hint="Um emoji, ex: 🥇"><input value={form.icon} onChange={(e) => set('icon', e.target.value)} maxLength={4} style={inputStyle(colors)} /></Field>
                    <Field label="Status" colors={colors}>
                        <select value={form.isActive ? '1' : '0'} onChange={(e) => set('isActive', e.target.value === '1')} style={inputStyle(colors)}>
                            <option value="1">Ativo</option>
                            <option value="0">Desativado</option>
                        </select>
                    </Field>
                </div>
                <Field label="Descrição (opcional)" colors={colors}><input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={300} style={inputStyle(colors)} /></Field>

                <div className="flex gap-2 pt-1">
                    <button onClick={onClose} className="flex-1 py-3 rounded-full text-sm font-bold" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Cancelar</button>
                    <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-full text-sm font-black text-white disabled:opacity-50" style={{ background: GRADIENT }}>{saving ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </div>
        </Dialog>
    )
}

// ============================================================================
// PESSOAS
// ============================================================================
function PeoplePanel({ overview, cardStyle, colors }: { overview: Overview; cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [slug, setSlug] = useState('')
    const [data, setData] = useState<UserGraduation | null>(null)
    const [loading, setLoading] = useState(false)
    const [grantLevel, setGrantLevel] = useState('')
    const [pre, setPre] = useState('')
    const [pos, setPos] = useState('')
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [logs, setLogs] = useState<SystemLog[]>([])
    const activeLevels = overview.levels.filter((l) => l.is_active)

    const load = useCallback(async (id: string) => {
        setLoading(true)
        try {
            const [u, l] = await Promise.all([api<UserGraduation>('user', { userId: id }), api<{ logs: SystemLog[] }>('logs', { userId: id, limit: 15 })])
            setData(u)
            setLogs(l.logs)
            setPre(u.custom_enabled && u.custom_prepaid_bp !== null ? String(bpToPercent(u.custom_prepaid_bp)) : '')
            setPos(u.custom_enabled && u.custom_postpaid_bp !== null ? String(bpToPercent(u.custom_postpaid_bp)) : '')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar a pessoa')
        } finally {
            setLoading(false)
        }
    }, [])

    // Escolheu um perfil na busca: acha o id e carrega
    useEffect(() => {
        const clean = slug.trim().replace(/^@/, '')
        if (!clean) { setData(null); return }
        let cancelled = false
        supabase.from('profiles').select('id').eq('profileSlug', clean).maybeSingle().then(({ data: p }) => {
            if (!cancelled && p?.id) load(p.id)
        })
        return () => { cancelled = true }
    }, [slug, load])

    const act = async (action: string, extra: Record<string, unknown>, okMsg: string) => {
        if (!data) return
        setBusy(true)
        try {
            await api(action, { userId: data.user.id, reason, ...extra })
            toast.success(okMsg)
            await load(data.user.id)
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível concluir')
        } finally {
            setBusy(false)
        }
    }

    const treeLoader = useCallback<TreeLoader>(async (parentId, offset) => {
        const res = await api<{ children: NetworkChild[] }>('tree', { userId: parentId ?? data!.user.id, offset, limit: TREE_PAGE_SIZE })
        return { children: res.children, total: Number(res.children[0]?.total_count ?? 0) }
    }, [data])

    const btn = (label: string, onClick: () => void, kind: 'primary' | 'danger' | 'ghost' = 'primary', disabled = false) => (
        <button
            onClick={onClick}
            disabled={busy || disabled}
            className="text-xs font-black px-4 py-2.5 rounded-full disabled:opacity-40"
            style={kind === 'primary' ? { background: GRADIENT, color: '#fff' } : kind === 'danger' ? { background: '#ef444418', color: '#ef4444' } : { background: `${colors.border}40`, color: colors.textPrimary }}
        >
            {label}
        </button>
    )

    return (
        <div className="space-y-4">
            <div style={cardStyle}>
                <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Escolha a pessoa</p>
                <ProfilePicker value={slug} onChange={setSlug} colors={colors} placeholder="Nome ou @ do perfil" />
            </div>

            {loading && <div className="flex justify-center py-4"><Spinner size={22} color={colors.accent} /></div>}

            {data && !loading && (
                <>
                    <div style={cardStyle} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <LevelAvatarFrame level={data.current_level}>
                                {data.user.avatarUrl
                                    ? <img src={data.user.avatarUrl} alt="" className="w-12 h-12 object-cover" />
                                    : <span className="w-12 h-12 flex items-center justify-center text-sm font-black text-white" style={{ background: GRADIENT }}>{(data.user.name || '?').charAt(0)}</span>}
                            </LevelAvatarFrame>
                            <div className="min-w-0">
                                <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{data.user.name || 'Sem nome'}</p>
                                <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>@{data.user.profileSlug} · {data.user.email || 'sem e-mail'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Hierarquia atual</p><LevelBadge level={data.current_level} size="sm" /></div>
                            <div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Maior conquistada</p>{data.highest_level ? <LevelBadge level={data.highest_level} size="sm" /> : <span className="font-black" style={{ color: colors.textPrimary }}>Inicial</span>}</div>
                            <div><p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Nível concedido</p>{data.manual_level ? <LevelBadge level={data.manual_level} size="sm" /> : <span className="font-black" style={{ color: colors.textSecondary }}>Nenhum</span>}</div>
                            <Stat label="Indicações diretas" value={String(data.direct_referrals)} colors={colors} />
                            <Stat label="Total da rede" value={String(data.total_network)} colors={colors} />
                            <Stat label="Conquistou em" value={data.level_achieved_at ? new Date(data.level_achieved_at).toLocaleDateString('pt-BR') : '—'} colors={colors} />
                            <Stat label="Padrão (pré / pós)" value={`${formatPercent(data.standard_prepaid_bp)} / ${formatPercent(data.standard_postpaid_bp)}`} colors={colors} />
                            <Stat label="Personalizada (pré / pós)" value={data.custom_enabled ? `${data.custom_prepaid_bp !== null ? formatPercent(data.custom_prepaid_bp) : '—'} / ${data.custom_postpaid_bp !== null ? formatPercent(data.custom_postpaid_bp) : '—'}` : 'Nenhuma'} colors={colors} />
                            <Stat label="Efetiva (pré / pós)" value={`${formatPercent(data.effective_prepaid.commission_rate_bp)} / ${formatPercent(data.effective_postpaid.commission_rate_bp)}`} colors={colors} />
                        </div>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            Origem da comissão (pré): {SOURCE_LABELS[data.effective_prepaid.commission_source]} · (pós): {SOURCE_LABELS[data.effective_postpaid.commission_source]}
                        </p>
                    </div>

                    <div style={cardStyle} className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Nível</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Conceder um nível só eleva: se a pessoa já conquistou um nível maior, vale o maior.</p>
                        <div className="flex gap-2 flex-wrap items-end">
                            <div className="flex-1 min-w-[160px]">
                                <select value={grantLevel} onChange={(e) => setGrantLevel(e.target.value)} style={inputStyle(colors)}>
                                    <option value="">Escolha o nível…</option>
                                    {activeLevels.map((l) => <option key={l.id} value={l.id}>{l.name} ({formatPercent(l.commission_prepaid_bp)})</option>)}
                                </select>
                            </div>
                            {btn('Conceder nível', () => act('grant_level', { levelId: grantLevel }, 'Nível concedido'), 'primary', !grantLevel)}
                            {data.manual_level && btn('Remover concessão manual', () => act('remove_level', {}, 'Concessão removida'), 'danger')}
                        </div>

                        <p className="text-xs font-black uppercase tracking-wider pt-2" style={{ color: colors.textSecondary }}>Comissão personalizada</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Vale no lugar da comissão do nível, mas não muda o nome do nível. Teto: {formatPercent(overview.settings.max_commission_bp)}.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Pré-pago (%)" colors={colors}><input value={pre} onChange={(e) => setPre(e.target.value)} inputMode="decimal" placeholder="ex: 62" style={inputStyle(colors)} /></Field>
                            <Field label="Pós-pago (%)" colors={colors}><input value={pos} onChange={(e) => setPos(e.target.value)} inputMode="decimal" placeholder="ex: 65" style={inputStyle(colors)} /></Field>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {btn('Definir comissão personalizada', () => act('set_commission', { prepaidPercent: pre, postpaidPercent: pos }, 'Comissão personalizada definida'), 'primary', pre === '' && pos === '')}
                            {data.custom_enabled && btn('Remover comissão personalizada', () => act('clear_commission', {}, 'Comissão personalizada removida'), 'danger')}
                        </div>

                        <Field label="Motivo (opcional, fica no histórico)" colors={colors}>
                            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} style={inputStyle(colors)} placeholder="Ex: parceria com a loja X" />
                        </Field>
                    </div>

                    <div style={cardStyle} className="space-y-2">
                        <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Como chegou ao nível</p>
                        {data.history.length === 0 ? <p className="text-xs" style={{ color: colors.textSecondary }}>Ainda no nível inicial.</p> : data.history.map((h, i) => (
                            <div key={i} className="text-xs flex items-baseline justify-between gap-3">
                                <span style={{ color: colors.textPrimary }}>
                                    {h.type === 'manual_grant' ? 'Concedido' : h.type === 'admin_change' ? 'Ajustado' : 'Subiu'}: {h.previous || '—'} → <b>{h.new}</b>
                                    {h.reason ? ` · ${h.reason}` : ''}{h.by ? ` · por ${h.by}` : ''}
                                </span>
                                <span className="flex-shrink-0" style={{ color: colors.textSecondary }}>{new Date(h.at).toLocaleDateString('pt-BR')}</span>
                            </div>
                        ))}
                    </div>

                    <div style={cardStyle}>
                        <NetworkTree key={data.user.id} rootId={null} loader={treeLoader} rootLabel={`Rede de ${data.user.name || '@' + data.user.profileSlug}`} />
                    </div>

                    {logs.length > 0 && (
                        <div style={cardStyle} className="space-y-1.5">
                            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Últimas alterações administrativas</p>
                            {logs.map((g) => <LogLine key={g.id} log={g} levels={overview.levels} colors={colors} />)}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ============================================================================
// AUDITORIA
// ============================================================================
function levelName(levels: NetworkLevel[], id: unknown): string {
    return levels.find((l) => l.id === id)?.name || 'nível'
}

function describeLog(g: SystemLog, levels: NetworkLevel[]): string {
    const who = g.actor ? g.actor : g.actorSlug ? `@${g.actorSlug}` : 'Sistema'
    const target = g.target || (g.targetSlug ? `@${g.targetSlug}` : 'alguém')
    const pct = (bp: unknown) => (typeof bp === 'number' ? formatPercent(bp) : '—')
    switch (g.action) {
        case 'level_created': return `${who} criou o nível ${g.new?.name}`
        case 'level_updated': {
            const changes: string[] = []
            if (g.old && g.new) {
                if (g.old.commission_prepaid_bp !== g.new.commission_prepaid_bp) changes.push(`pré ${pct(g.old.commission_prepaid_bp)} → ${pct(g.new.commission_prepaid_bp)}`)
                if (g.old.commission_postpaid_bp !== g.new.commission_postpaid_bp) changes.push(`pós ${pct(g.old.commission_postpaid_bp)} → ${pct(g.new.commission_postpaid_bp)}`)
                if (g.old.min_direct_referrals !== g.new.min_direct_referrals) changes.push(`indicados ${g.old.min_direct_referrals} → ${g.new.min_direct_referrals}`)
                if (g.old.is_active !== g.new.is_active) changes.push(g.new.is_active ? 'ativou' : 'desativou')
                if (g.old.name !== g.new.name) changes.push(`nome ${g.old.name} → ${g.new.name}`)
            }
            return `${who} alterou ${g.new?.name}${changes.length ? ': ' + changes.join(', ') : ' (visual/descrição)'}`
        }
        case 'levels_reordered': return `${who} reordenou os níveis`
        case 'network_settings_changed': return `${who} alterou os ajustes (teto ${pct(g.old?.max_commission_bp)} → ${pct(g.new?.max_commission_bp)})`
        case 'level_granted': return `${who} concedeu ${levelName(levels, g.new)} para ${target}`
        case 'level_grant_removed': return `${who} removeu o nível concedido (${levelName(levels, g.old)}) de ${target}`
        case 'custom_commission_set': return `${who} definiu comissão de ${target}: pré ${pct(g.new?.prepaid_bp)}, pós ${pct(g.new?.postpaid_bp)}${g.old?.enabled ? ` (antes pré ${pct(g.old?.prepaid_bp)}, pós ${pct(g.old?.postpaid_bp)})` : ''}`
        case 'custom_commission_cleared': return `${who} removeu a comissão personalizada de ${target}`
        case 'level_auto_upgrade': return `${target} subiu automaticamente para ${levelName(levels, g.new)}`
        default: return `${who}: ${g.action}`
    }
}

function LogLine({ log, levels, colors }: { log: SystemLog; levels: NetworkLevel[]; colors: ThemeColors }) {
    return (
        <div className="text-xs flex items-baseline justify-between gap-3">
            <span style={{ color: colors.textPrimary }}>{describeLog(log, levels)}{log.reason ? ` — ${log.reason}` : ''}</span>
            <span className="flex-shrink-0" style={{ color: colors.textSecondary }}>{new Date(log.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    )
}

function AuditPanel({ overview, cardStyle, colors }: { overview: Overview; cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [logs, setLogs] = useState<SystemLog[] | null>(null)
    useEffect(() => {
        api<{ logs: SystemLog[] }>('logs', { limit: 100 }).then((r) => setLogs(r.logs)).catch((e) => { toast.error(e.message); setLogs([]) })
    }, [])
    if (logs === null) return <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
    return (
        <div style={cardStyle} className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Alterações recentes ({logs.length})</p>
            {logs.length === 0 ? <p className="text-xs" style={{ color: colors.textSecondary }}>Nada registrado ainda.</p> : logs.map((g) => <LogLine key={g.id} log={g} levels={overview.levels} colors={colors} />)}
        </div>
    )
}

// ============================================================================
// AJUSTES
// ============================================================================
function SettingsPanel({ overview, reload, cardStyle, colors }: { overview: Overview; reload: () => Promise<void>; cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [maxPct, setMaxPct] = useState(String(bpToPercent(overview.settings.max_commission_bp)))
    const [postRef, setPostRef] = useState(String(overview.settings.postpaid_reference_cents / 100))
    const [busy, setBusy] = useState(false)
    const useMemoPlans = useMemo(() => overview.plans || [], [overview.plans])

    const save = async () => {
        setBusy(true)
        try {
            await api('settings', { maxPercent: maxPct, postpaidReferenceReais: postRef })
            toast.success('Ajustes salvos')
            await reload()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível salvar')
        } finally {
            setBusy(false)
        }
    }
    const recheck = async () => {
        setBusy(true)
        try {
            const r = await api<{ upgraded: number }>('recheck')
            toast.success(r.upgraded ? `${r.upgraded} pessoa(s) subiram de nível` : 'Todo mundo já está no nível certo')
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível reavaliar')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Limites e referências</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Teto de comissão (%)" colors={colors} hint="Nenhum nível nem comissão personalizada passa disso. Padrão: 70%.">
                        <input value={maxPct} onChange={(e) => setMaxPct(e.target.value)} inputMode="decimal" style={inputStyle(colors)} />
                    </Field>
                    <Field label="Quitação do Pós-pago (R$, só referência)" colors={colors} hint="Usado nos exemplos de ganho. A comissão sempre sai do valor realmente pago.">
                        <input value={postRef} onChange={(e) => setPostRef(e.target.value)} inputMode="decimal" style={inputStyle(colors)} />
                    </Field>
                </div>
                <button onClick={save} disabled={busy} className="text-xs font-black px-5 py-2.5 rounded-full text-white disabled:opacity-50" style={{ background: GRADIENT }}>Salvar ajustes</button>
            </div>

            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Planos (preço que serve de base)</p>
                {useMemoPlans.map((p) => (
                    <div key={p.code} className="flex items-center justify-between text-sm">
                        <span style={{ color: colors.textPrimary }}>{p.name}</span>
                        <span className="font-black" style={{ color: colors.textPrimary }}>{p.price_cents > 0 ? `${formatCents(p.price_cents)} / mês` : 'sem mensalidade (paga ao quitar)'}</span>
                    </div>
                ))}
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>O preço do Pré-pago se edita na aba Planos. A comissão incide sobre o valor que o indicado de fato pagou.</p>
            </div>

            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Reavaliar níveis</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Já acontece sozinho a cada indicação nova e a cada edição de nível. Use se quiser forçar a conferência de todo mundo. Ninguém desce de nível.</p>
                <button onClick={recheck} disabled={busy} className="text-xs font-black px-5 py-2.5 rounded-full disabled:opacity-50" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Reavaliar agora</button>
            </div>
        </div>
    )
}
