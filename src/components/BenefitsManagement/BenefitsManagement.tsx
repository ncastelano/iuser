// components/BenefitsManagement/BenefitsManagement.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { getAvatarUrl } from '@/lib/avatar'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import InviteButton from '@/components/InviteButton'
import { Gift, Check, X, Search, History, ShieldCheck } from 'lucide-react'
import {
    SCOPE_LABEL,
    type BenefitHistoryRow,
    type GrantTarget,
    type GrantablePlan,
    type MyStatus,
} from '@/lib/benefits/types'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type Tab = 'grant' | 'history' | 'status'

const TABS: { id: Tab; label: string; icon: typeof Gift }[] = [
    { id: 'grant', label: 'Conceder', icon: Gift },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'status', label: 'Meu status', icon: ShieldCheck },
]

// 31/12 23:59:59 (Brasília), em dias a partir de agora.
function daysUntilEndOfYear(): number {
    const now = new Date()
    const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 32, 2, 59, 59))
    return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

const DURATIONS = [
    { value: '7', label: '7 dias' },
    { value: '15', label: '15 dias' },
    { value: '30', label: '30 dias' },
    { value: '60', label: '60 dias' },
    { value: '90', label: '90 dias' },
    { value: '180', label: '180 dias' },
    { value: '365', label: '1 ano' },
    { value: 'eoy', label: 'Até o fim do ano' },
]

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

// Área única de gestão de benefícios. O que aparece (planos, pessoas,
// histórico) vem do banco já filtrado pelas permissões e pelo escopo de
// quem está logado — esconder aqui é só conforto; quem decide é o servidor.
export default function BenefitsManagement() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [tab, setTab] = useState<Tab>('grant')
    const [status, setStatus] = useState<MyStatus | null>(null)
    const [plans, setPlans] = useState<GrantablePlan[]>([])
    const [loading, setLoading] = useState(true)

    // conceder
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<GrantTarget[]>([])
    const [searching, setSearching] = useState(false)
    const [target, setTarget] = useState<GrantTarget | null>(null)
    const [planId, setPlanId] = useState('')
    const [duration, setDuration] = useState('30')
    const [reason, setReason] = useState('')
    const [startsAt, setStartsAt] = useState('')
    const [granting, setGranting] = useState(false)

    // histórico
    const [history, setHistory] = useState<BenefitHistoryRow[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: 16,
    }
    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '10px 12px',
        fontSize: 13,
        width: '100%',
    }

    const load = useCallback(async () => {
        const [{ data: statusData }, { data: plansData }] = await Promise.all([
            supabase.rpc('get_my_status'),
            supabase.rpc('get_my_grantable_plans'),
        ])
        setStatus((statusData as MyStatus) || null)
        const list = (plansData as GrantablePlan[]) || []
        setPlans(list)
        setPlanId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id || ''))
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    // Busca de pessoas (dentro do escopo, filtrado pelo banco).
    useEffect(() => {
        if (target || query.trim().length < 2) {
            setResults([])
            return
        }
        setSearching(true)
        const t = setTimeout(async () => {
            const { data } = await supabase.rpc('find_grant_targets', { p_query: query.trim() })
            setResults((data as GrantTarget[]) || [])
            setSearching(false)
        }, 300)
        return () => clearTimeout(t)
    }, [query, target])

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true)
        const { data } = await supabase.rpc('get_benefit_history', { p_limit: 100, p_only_granted: true })
        setHistory((data as BenefitHistoryRow[]) || [])
        setLoadingHistory(false)
    }, [])

    useEffect(() => {
        if (tab === 'history') loadHistory()
    }, [tab, loadHistory])

    const grant = async () => {
        if (!target || !planId) return
        setGranting(true)
        try {
            await callAdminApi('/api/benefits/grant', {
                targetUserId: target.id,
                planId,
                days: duration === 'eoy' ? daysUntilEndOfYear() : Number(duration),
                reason: reason.trim() || undefined,
                startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : undefined,
            })
            const plan = plans.find((p) => p.id === planId)
            toast.success(`${plan?.name || 'Benefício'} concedido a ${target.name || `@${target.profile_slug}`}!`)
            setTarget(null)
            setQuery('')
            setReason('')
            setStartsAt('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder benefício')
        } finally {
            setGranting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    const selectedPlan = plans.find((p) => p.id === planId)

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    <Gift size={20} />
                </div>
                <div>
                    <h2 className="text-base font-black" style={{ color: colors.textPrimary }}>Gestão de Benefícios</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        {status ? `${status.name} · nível ${status.level}` : 'Conceda planos dentro do seu escopo'}
                    </p>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {TABS.map((t) => {
                    const Icon = t.icon
                    const active = tab === t.id
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                            style={active
                                ? { background: GRADIENT, color: '#fff', border: '1px solid transparent' }
                                : { background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            <Icon size={14} />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === 'grant' && (
                <div className="space-y-4">
                    {plans.length === 0 ? (
                        <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                            Você não tem permissão para conceder nenhum plano no momento.
                        </div>
                    ) : (
                        <div style={cardStyle} className="space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Buscar usuário</p>
                                {target ? (
                                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: `${colors.accent}15`, border: `1px solid ${colors.accent}55` }}>
                                        <span className="flex-1 min-w-0 text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {target.name || `@${target.profile_slug}`}
                                            {target.profile_slug && <span className="font-medium" style={{ color: colors.textSecondary }}> @{target.profile_slug}</span>}
                                        </span>
                                        <button onClick={() => { setTarget(null); setQuery('') }} style={{ color: colors.textSecondary }}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                            <input
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                placeholder="Nome ou @slug"
                                                style={{ ...inputStyle, paddingLeft: 32 }}
                                            />
                                        </div>
                                        {searching && <p className="text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>Buscando...</p>}
                                        {!searching && query.trim().length >= 2 && results.length === 0 && (
                                            <p className="text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>Ninguém encontrado dentro do seu escopo.</p>
                                        )}
                                        {results.length > 0 && (
                                            <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                                {results.map((r) => {
                                                    const avatar = getAvatarUrl(supabase, r.avatar_url)
                                                    return (
                                                        <button
                                                            key={r.id}
                                                            onClick={() => { setTarget(r); setResults([]) }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/5"
                                                            style={{ borderBottom: `1px solid ${colors.border}` }}
                                                        >
                                                            <span className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${colors.border}40` }}>
                                                                {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                                                            </span>
                                                            <span className="min-w-0">
                                                                <span className="block text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{r.name || `@${r.profile_slug}`}</span>
                                                                {r.profile_slug && <span className="block text-[11px]" style={{ color: colors.textSecondary }}>@{r.profile_slug}</span>}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Plano</p>
                                    <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={inputStyle}>
                                        {plans.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Duração</p>
                                    <select value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle}>
                                        {DURATIONS.map((d) => (
                                            <option key={d.value} value={d.value}>{d.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Início (opcional — vazio = agora)</p>
                                <input
                                    type="date"
                                    value={startsAt}
                                    min={new Date().toISOString().slice(0, 10)}
                                    onChange={(e) => setStartsAt(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Motivo (opcional)</p>
                                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex: parceiro do bairro" style={inputStyle} />
                            </div>

                            {selectedPlan && (
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {selectedPlan.description || selectedPlan.name} · escopo: {SCOPE_LABEL[selectedPlan.scope]}
                                </p>
                            )}

                            <button
                                onClick={grant}
                                disabled={granting || !target || !planId}
                                className="w-full py-3 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT }}
                            >
                                {granting ? <Spinner size={14} color="#ffffff" /> : <Check size={16} />}
                                Conceder benefício
                            </button>
                        </div>
                    )}

                    <InviteButton />
                </div>
            )}

            {tab === 'history' && (
                <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Histórico de benefícios</p>
                    {loadingHistory ? (
                        <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
                    ) : history.length === 0 ? (
                        <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>Nenhum benefício concedido ainda.</div>
                    ) : (
                        <div style={{ ...cardStyle, padding: 0 }} className="overflow-hidden">
                            {history.map((h, i) => (
                                <div
                                    key={h.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                    style={{ borderTop: i === 0 ? undefined : `1px solid ${colors.border}` }}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {h.target_name || (h.target_slug ? `@${h.target_slug}` : 'Pessoa removida')} · {h.plan_name || h.plan_code}
                                        </p>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                            Concedido em {fmt(h.created_at)} · {h.is_scheduled ? `começa em ${fmt(h.starts_at)} · ` : ''}expira em {fmt(h.expires_at)}
                                            {h.actor_name ? ` · por ${h.actor_name}` : ''}
                                        </p>
                                        {h.reason && <p className="text-[11px] italic" style={{ color: colors.textSecondary }}>{h.reason}</p>}
                                    </div>
                                    <span
                                        className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0"
                                        style={h.is_active
                                            ? { background: '#22c55e20', color: '#22c55e' }
                                            : h.is_scheduled
                                                ? { background: '#f9731620', color: '#f97316' }
                                                : { background: `${colors.border}40`, color: colors.textSecondary }}
                                    >
                                        {h.is_active ? 'Ativo' : h.is_scheduled ? 'Agendado' : 'Expirado'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'status' && status && (
                <div style={cardStyle} className="space-y-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Meu status</p>
                        <p className="text-xl font-black" style={{ color: colors.textPrimary }}>{status.name}</p>
                        {status.description && <p className="text-xs" style={{ color: colors.textSecondary }}>{status.description}</p>}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Nível</p>
                        <p className="text-base font-black" style={{ color: colors.textPrimary }}>{status.level}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Permissões</p>
                        {status.permissions.length === 0 ? (
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma permissão de gestão.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {status.permissions.map((p) => (
                                    <li key={p.slug} className="flex items-start gap-2 text-sm" style={{ color: colors.textPrimary }}>
                                        <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                                        <span>
                                            <span className="font-semibold">{p.name}</span>
                                            <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Escopo: {SCOPE_LABEL[p.scope]}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
