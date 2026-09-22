// components/AdminDashboard/AdminDashboard.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme, type ThemeColors } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { Check, X, Copy, Plus, ShieldOff, ShieldCheck, Send, CalendarClock, Wallet, Tag, Sparkles } from 'lucide-react'
import HierarchyAdmin from './HierarchyAdmin'
import { callAdminApi } from '@/lib/callAdminApi'

type Section = 'pagamentos' | 'saques' | 'planos' | 'hierarquia'

const SECTIONS: { id: Section; label: string; icon: typeof Send }[] = [
    { id: 'pagamentos', label: 'Pagamentos', icon: Wallet },
    { id: 'planos', label: 'Planos', icon: CalendarClock },
    { id: 'hierarquia', label: 'Hierarquia', icon: ShieldCheck },
    { id: 'saques', label: 'Saques', icon: Send },
]

// Painel do administrador geral - mesma "casca" visual de ProfileDashboard /
// StoreDashboard, aberto como aba do Header em OwnerClientPage. Só a conta
// ncastelano@gmail.com chega a montar isso (o tab nem existe pra mais
// ninguém), mas cada ação de verdade ainda re-verifica no servidor.
export default function AdminDashboard() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [section, setSection] = useState<Section>('pagamentos')
    const [checking, setChecking] = useState(true)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        callAdminApi<{ isSuperAdmin: boolean }>('/api/admin/whoami')
            .then((r) => setAuthorized(r.isSuperAdmin))
            .catch(() => setAuthorized(false))
            .finally(() => setChecking(false))
    }, [])

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: 16,
    }

    if (checking) {
        return (
            <div className="flex items-center justify-center py-16">
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    if (!authorized) {
        return (
            <div style={cardStyle} className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldOff size={28} color={colors.textSecondary} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Sem permissão</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
                {SECTIONS.map((s) => {
                    const Icon = s.icon
                    const active = section === s.id
                    return (
                        <button
                            key={s.id}
                            onClick={() => setSection(s.id)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                            style={{
                                background: active ? colors.accent : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                color: active ? colors.accentText : colors.textPrimary,
                                border: `1px solid ${active ? colors.accent : colors.border}`,
                            }}
                        >
                            <Icon size={14} />
                            {s.label}
                        </button>
                    )
                })}
            </div>

            {section === 'pagamentos' && <SubscriptionsSection cardStyle={cardStyle} colors={colors} />}
            {section === 'saques' && <WithdrawalsSection cardStyle={cardStyle} colors={colors} />}
            {section === 'hierarquia' && <HierarchyAdmin cardStyle={cardStyle} colors={colors} />}
            {section === 'planos' && (
                <div className="space-y-5">
                    <PlanManageSection cardStyle={cardStyle} colors={colors} />
                    <PlanPricingSection cardStyle={cardStyle} colors={colors} />
                    <ServicePricingSection cardStyle={cardStyle} colors={colors} />
                    <PlanGrantsSection cardStyle={cardStyle} colors={colors} />
                    <PlanCodesSection cardStyle={cardStyle} colors={colors} />
                </div>
            )}
        </div>
    )
}

interface SectionProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface SubscriptionRow {
    id: string
    status: 'pending' | 'active' | 'past_due' | 'canceled'
    source: 'asaas' | 'admin_grant' | 'code' | 'leader_grant'
    current_period_end: string | null
    created_at: string
    plans: { code: string; name: string; price: number } | { code: string; name: string; price: number }[] | null
    profiles: { name: string | null; profileSlug: string | null } | { name: string | null; profileSlug: string | null }[] | null
}

interface GrantedFreeSummary {
    activeCount: number
    plans: { code: string; name: string; count: number }[]
}

interface PaidSummary {
    onceCount: number
    multipleCount: number
    activeCount: number
    totalRevenue: number
}

const STATUS_LABEL: Record<SubscriptionRow['status'], { label: string; color: string }> = {
    active: { label: 'Ativa', color: '#22c55e' },
    pending: { label: 'Pendente', color: '#a3a3a3' },
    past_due: { label: 'Atrasada', color: '#f59e0b' },
    canceled: { label: 'Cancelada', color: '#ef4444' },
}

const SUBSCRIPTION_SOURCE_LABEL: Record<SubscriptionRow['source'], string> = {
    asaas: 'Pago via Asaas',
    admin_grant: 'Concedido pelo admin',
    code: 'Código promocional',
    leader_grant: 'Concedido por liderança',
}

// Quem comprou (ou ganhou) cada plano — visão de negócio pro admin: quantos
// planos a própria iuser está vendendo de verdade e quanto isso representa
// em receita recorrente, além do histórico completo de assinaturas.
function SubscriptionsSection({ cardStyle, colors }: SectionProps) {
    const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
    const [grantedFree, setGrantedFree] = useState<GrantedFreeSummary>({ activeCount: 0, plans: [] })
    const [paid, setPaid] = useState<PaidSummary>({ onceCount: 0, multipleCount: 0, activeCount: 0, totalRevenue: 0 })
    const [activeCount, setActiveCount] = useState(0)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<{
                subscriptions: SubscriptionRow[]
                grantedFree: GrantedFreeSummary
                paid: PaidSummary
                activeSubscriptions: { count: number }
            }>('/api/admin/subscriptions/list')
            setSubscriptions(res.subscriptions)
            setGrantedFree(res.grantedFree)
            setPaid(res.paid)
            setActiveCount(res.activeSubscriptions.count)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar assinaturas')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-1">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Assinaturas ativas
                </p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{activeCount}</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>De qualquer origem — pago ou concedido, ver abaixo</p>
            </div>

            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#22c55e' }}>
                    Pago de verdade
                </p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                    R$ {paid.totalRevenue.toFixed(2)}
                </p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    {paid.activeCount} assinatura{paid.activeCount !== 1 ? 's' : ''} ativa{paid.activeCount !== 1 ? 's' : ''} via Asaas ·{' '}
                    {paid.onceCount} pagou 1x · {paid.multipleCount} pagou 2x ou mais
                </p>
            </div>

            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Concedido de graça (não é receita)
                </p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{grantedFree.activeCount}</p>
                <div className="flex flex-wrap gap-2">
                    {grantedFree.plans.map((p) => (
                        <span
                            key={p.code}
                            className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                            style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                        >
                            {p.name}: {p.count}
                        </span>
                    ))}
                    {grantedFree.plans.length === 0 && (
                        <span className="text-xs" style={{ color: colors.textSecondary }}>Nenhum plano concedido de graça ativo.</span>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Todas as assinaturas ({subscriptions.length})
                </p>
                {subscriptions.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                        Nenhuma assinatura ainda.
                    </div>
                ) : subscriptions.map((s) => {
                    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
                    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
                    const status = STATUS_LABEL[s.status]
                    return (
                        <div key={s.id} style={cardStyle} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                    {profile?.name || (profile?.profileSlug ? `@${profile.profileSlug}` : 'Usuário')}
                                    {' · '}
                                    {plan?.name || plan?.code}
                                </p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    R$ {plan ? Number(plan.price).toFixed(2) : '—'} · {SUBSCRIPTION_SOURCE_LABEL[s.source]} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                            <span
                                className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0"
                                style={{ background: `${status.color}20`, color: status.color }}
                            >
                                {status.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

interface WithdrawalRow {
    id: string
    user_id: string
    amount: number
    pix_key: string
    pix_key_type: string | null
    status: 'pending' | 'paid' | 'rejected' | 'failed'
    requested_at: string
    failure_reason: string | null
    asaas_transfer_id: string | null
    profiles: { name: string | null; profileSlug: string | null } | null
}

function WithdrawalsSection({ cardStyle, colors }: SectionProps) {
    const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
    const [loading, setLoading] = useState(true)
    const [actingId, setActingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { withdrawals } = await callAdminApi<{ withdrawals: WithdrawalRow[] }>('/api/admin/withdrawals')
            setWithdrawals(withdrawals)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar saques')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const resolve = async (id: string, action: 'paid' | 'reject') => {
        setActingId(id)
        try {
            await callAdminApi(`/api/admin/withdrawals/${id}/mark-paid`, { action })
            toast.success(action === 'paid' ? 'Saque marcado como pago!' : 'Pedido rejeitado')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar saque')
        } finally {
            setActingId(null)
        }
    }

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    // O saque agora é automático (a rota já chama a Asaas na hora e marca
    // paid/failed sozinha) — 'pending' só existe no instante entre gravar o
    // pedido e a resposta da Asaas, então na prática quem aparece aqui de
    // verdade pra revisar é 'failed' (a Asaas recusou por algum motivo).
    const needsAttention = withdrawals.filter((w) => w.status === 'pending' || w.status === 'failed')
    const resolved = withdrawals.filter((w) => w.status === 'paid' || w.status === 'rejected')

    return (
        <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Precisam de atenção ({needsAttention.length})
            </p>
            {needsAttention.length === 0 && (
                <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                    Nenhum saque travado — os automáticos estão passando de boa.
                </div>
            )}
            {needsAttention.map((w) => (
                <div key={w.id} style={cardStyle} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                            {w.profiles?.name || (w.profiles?.profileSlug ? `@${w.profiles.profileSlug}` : 'Usuário')}
                            {' · '}
                            R$ {Number(w.amount).toFixed(2)}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
                            PIX: {w.pix_key} · {new Date(w.requested_at).toLocaleString('pt-BR')}
                        </p>
                        {w.status === 'failed' && w.failure_reason && (
                            <p className="text-[11px] font-bold mt-0.5" style={{ color: '#ef4444' }}>
                                Falhou: {w.failure_reason}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => resolve(w.id, 'paid')}
                            disabled={actingId === w.id}
                            className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center disabled:opacity-50"
                            title="Marcar como pago (depois de resolver/transferir manualmente)"
                        >
                            {actingId === w.id ? <Spinner size={14} /> : <Check size={16} />}
                        </button>
                        <button
                            onClick={() => resolve(w.id, 'reject')}
                            disabled={actingId === w.id}
                            className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center disabled:opacity-50"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ))}

            {resolved.length > 0 && (
                <>
                    <p className="text-xs font-black uppercase tracking-wider mt-5" style={{ color: colors.textSecondary }}>
                        Histórico
                    </p>
                    {resolved.map((w) => (
                        <div key={w.id} style={cardStyle} className="flex items-center justify-between gap-3 opacity-80">
                            <div className="min-w-0">
                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                    {w.profiles?.name || (w.profiles?.profileSlug ? `@${w.profiles.profileSlug}` : 'Usuário')}
                                    {' · '}
                                    R$ {Number(w.amount).toFixed(2)}
                                </p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {w.status === 'paid' ? 'Pago automaticamente' : 'Rejeitado'}
                                </p>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}

const GRANT_PLAN_OPTIONS = [
    { code: 'motorista', label: 'Motorista' },
    { code: 'motorista_beta', label: 'Motorista Beta (até fim do ano)' },
    { code: 'prestador', label: 'Prestador de serviço' },
    { code: 'loja', label: 'Loja' },
    { code: 'recrutador', label: 'Recrutador' },
    { code: 'combo', label: 'Combo' },
]

// 31/12 23:59:59 no horário de Brasília, expresso como dias a partir de
// agora — usado como sugestão inicial pro campo "dias" quando o admin
// concede o plano motorista_beta ("válido até o fim do ano").
function daysUntilEndOfYear(): number {
    const now = new Date()
    const endOfYearBrasilia = new Date(Date.UTC(now.getUTCFullYear(), 11, 32, 2, 59, 59))
    const diffMs = endOfYearBrasilia.getTime() - now.getTime()
    return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)))
}

interface PlanRow {
    id: string
    code: string
    name: string
    price: number
}

interface FullPlanRow {
    id: string
    code: string
    name: string
    price: number
    description: string | null
    features: string[] | null
    billing_cycle: string
    max_active_subscriptions: number | null
    grants_driver: boolean
    grants_provider: boolean
    grants_store: boolean
    grants_recruiter: boolean
    is_active: boolean
    promo_price: number | null
    promo_starts_at: string | null
    promo_ends_at: string | null
}

const BILLING_CYCLE_OPTIONS = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY']

// Admin cria planos com qualquer código (não só os 6 fixos), edita texto/
// config dos existentes, e roda promoções temporárias — tudo publicado
// como os mesmos cards que já aparecem em /planos.
function PlanManageSection({ cardStyle, colors }: SectionProps) {
    const [plans, setPlans] = useState<FullPlanRow[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
    const [promoPlanId, setPromoPlanId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase.from('plans').select('*').order('created_at', { ascending: false })
        setPlans((data as FullPlanRow[]) || [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div className="space-y-3">
            <div style={cardStyle} className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                        <Sparkles size={12} />
                        Gerenciar planos
                    </p>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <Plus size={12} /> Criar plano
                    </button>
                </div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Crie planos novos com qualquer código, edite texto/benefícios dos existentes, ou rode uma promoção temporária (preço alternativo válido só numa janela de datas).
                </p>

                {showCreateForm && (
                    <PlanForm
                        colors={colors}
                        inputStyle={inputStyle}
                        mode="create"
                        onSubmit={async (values) => {
                            await callAdminApi('/api/admin/plans/create', values)
                            toast.success('Plano criado!')
                            setShowCreateForm(false)
                            await load()
                        }}
                    />
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
            ) : (
                <div className="space-y-2">
                    {plans.map((plan) => (
                        <div key={plan.id} style={cardStyle} className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                        {plan.name} <span className="text-[10px] font-normal" style={{ color: colors.textSecondary }}>({plan.code})</span>
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        R$ {Number(plan.price).toFixed(2)} · {plan.billing_cycle}
                                        {!plan.is_active && ' · inativo'}
                                        {plan.promo_price && ` · promo R$ ${Number(plan.promo_price).toFixed(2)}`}
                                    </p>
                                </div>
                                <div className="flex gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => { setEditingPlanId(editingPlanId === plan.id ? null : plan.id); setPromoPlanId(null) }}
                                        className="text-[10px] font-bold px-2.5 py-1.5 rounded-full"
                                        style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                    >
                                        Editar
                                    </button>
                                    <button
                                        onClick={() => { setPromoPlanId(promoPlanId === plan.id ? null : plan.id); setEditingPlanId(null) }}
                                        className="text-[10px] font-bold px-2.5 py-1.5 rounded-full"
                                        style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                    >
                                        Promoção
                                    </button>
                                </div>
                            </div>

                            {editingPlanId === plan.id && (
                                <PlanForm
                                    colors={colors}
                                    inputStyle={inputStyle}
                                    mode="edit"
                                    initial={plan}
                                    onSubmit={async (values) => {
                                        await callAdminApi('/api/admin/plans/update', { planId: plan.id, ...values })
                                        toast.success('Plano atualizado!')
                                        setEditingPlanId(null)
                                        await load()
                                    }}
                                />
                            )}

                            {promoPlanId === plan.id && (
                                <PromoForm
                                    colors={colors}
                                    inputStyle={inputStyle}
                                    plan={plan}
                                    onSubmit={async (values) => {
                                        await callAdminApi('/api/admin/plans/set-promo', { planId: plan.id, ...values })
                                        toast.success(values.clear ? 'Promoção removida' : 'Promoção definida!')
                                        setPromoPlanId(null)
                                        await load()
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function PlanForm({
    colors,
    inputStyle,
    mode,
    initial,
    onSubmit,
}: {
    colors: ThemeColors
    inputStyle: React.CSSProperties
    mode: 'create' | 'edit'
    initial?: FullPlanRow
    onSubmit: (values: any) => Promise<void>
}) {
    const [code, setCode] = useState(initial?.code || '')
    const [name, setName] = useState(initial?.name || '')
    const [price, setPrice] = useState(initial ? String(initial.price) : '')
    const [description, setDescription] = useState(initial?.description || '')
    const [featuresText, setFeaturesText] = useState((initial?.features || []).join('\n'))
    const [billingCycle, setBillingCycle] = useState(initial?.billing_cycle || 'MONTHLY')
    const [maxSubs, setMaxSubs] = useState(initial?.max_active_subscriptions ? String(initial.max_active_subscriptions) : '')
    const [grantsDriver, setGrantsDriver] = useState(!!initial?.grants_driver)
    const [grantsProvider, setGrantsProvider] = useState(!!initial?.grants_provider)
    const [grantsStore, setGrantsStore] = useState(!!initial?.grants_store)
    const [grantsRecruiter, setGrantsRecruiter] = useState(!!initial?.grants_recruiter)
    const [isActive, setIsActive] = useState(initial ? initial.is_active : true)
    const [saving, setSaving] = useState(false)

    const submit = async () => {
        setSaving(true)
        try {
            await onSubmit({
                ...(mode === 'create' ? { code: code.trim().toLowerCase(), price: Number(price.replace(',', '.')) } : {}),
                name: name.trim(),
                description: description.trim(),
                features: featuresText.split('\n').map((f) => f.trim()).filter(Boolean),
                billingCycle,
                maxActiveSubscriptions: maxSubs ? Number(maxSubs) : null,
                grantsDriver,
                grantsProvider,
                grantsStore,
                grantsRecruiter,
                isActive,
            })
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar plano')
        } finally {
            setSaving(false)
        }
    }

    const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
        <label className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    )

    return (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: colors.border }}>
            {mode === 'create' && (
                <input
                    type="text"
                    placeholder="código (ex: vip)"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    style={inputStyle}
                    className="w-full"
                />
            )}
            <input type="text" placeholder="Nome do plano" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} className="w-full" />
            {mode === 'create' && (
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="preço (R$)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    style={inputStyle}
                    className="w-full"
                />
            )}
            <textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={inputStyle} className="w-full resize-none" />
            <textarea
                placeholder="Benefícios (um por linha)"
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                rows={3}
                style={inputStyle}
                className="w-full resize-none"
            />
            <div className="flex flex-wrap gap-2 items-center">
                <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} style={inputStyle}>
                    {BILLING_CYCLE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                    type="number"
                    min={1}
                    placeholder="vagas (opcional)"
                    value={maxSubs}
                    onChange={(e) => setMaxSubs(e.target.value)}
                    style={{ ...inputStyle, width: 130 }}
                />
            </div>
            <div className="flex flex-wrap gap-3">
                {checkbox('Motorista', grantsDriver, setGrantsDriver)}
                {checkbox('Prestador', grantsProvider, setGrantsProvider)}
                {checkbox('Loja', grantsStore, setGrantsStore)}
                {checkbox('Recrutador', grantsRecruiter, setGrantsRecruiter)}
                {checkbox('Ativo', isActive, setIsActive)}
            </div>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50" style={{ background: colors.accent }}>
                {saving ? <Spinner size={14} /> : mode === 'create' ? 'Criar plano' : 'Salvar alterações'}
            </button>
        </div>
    )
}

function PromoForm({
    colors,
    inputStyle,
    plan,
    onSubmit,
}: {
    colors: ThemeColors
    inputStyle: React.CSSProperties
    plan: FullPlanRow
    onSubmit: (values: any) => Promise<void>
}) {
    const toLocalInput = (iso: string | null) => {
        if (!iso) return ''
        const d = new Date(iso)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const [promoPrice, setPromoPrice] = useState(plan.promo_price ? String(plan.promo_price) : '')
    const [startsAt, setStartsAt] = useState(toLocalInput(plan.promo_starts_at))
    const [endsAt, setEndsAt] = useState(toLocalInput(plan.promo_ends_at))
    const [saving, setSaving] = useState(false)

    const submit = async () => {
        setSaving(true)
        try {
            await onSubmit({
                promoPrice: Number(promoPrice.replace(',', '.')),
                promoStartsAt: startsAt ? new Date(startsAt).toISOString() : null,
                promoEndsAt: endsAt ? new Date(endsAt).toISOString() : null,
            })
        } catch (err: any) {
            toast.error(err.message || 'Erro ao definir promoção')
        } finally {
            setSaving(false)
        }
    }

    const clearPromo = async () => {
        setSaving(true)
        try {
            await onSubmit({ clear: true })
        } catch (err: any) {
            toast.error(err.message || 'Erro ao remover promoção')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: colors.border }}>
            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                Preço normal: R$ {Number(plan.price).toFixed(2)}. Enquanto a promoção estiver dentro da janela, quem comprar paga o valor promocional.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="preço promocional"
                    value={promoPrice}
                    onChange={(e) => setPromoPrice(e.target.value)}
                    style={{ ...inputStyle, width: 140 }}
                />
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} />
                <span style={{ color: colors.textSecondary }} className="text-xs">até</span>
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle} />
            </div>
            <div className="flex gap-2">
                <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50" style={{ background: colors.accent }}>
                    {saving ? <Spinner size={14} /> : 'Salvar promoção'}
                </button>
                {plan.promo_price && (
                    <button
                        onClick={clearPromo}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl font-bold text-xs disabled:opacity-50"
                        style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                    >
                        Remover promoção
                    </button>
                )}
            </div>
        </div>
    )
}

// Reajusta o preço de um plano (promoção, aumento etc) pra quem vai assinar
// DAQUI PRA FRENTE e propaga pra quem já é assinante via Asaas na mesma
// hora — sem isso, quem já paga ficaria travado no valor antigo, e a
// comissão de indicação (calculada em cima do valor real cobrado em cada
// pagamento, não do preço "atual") só refletiria o reajuste na próxima
// cobrança de cada assinante de qualquer forma.
function PlanPricingSection({ cardStyle, colors }: SectionProps) {
    const [plans, setPlans] = useState<PlanRow[]>([])
    const [loading, setLoading] = useState(true)
    const [planCode, setPlanCode] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('plans')
            .select('id, code, name, price')
            .order('price', { ascending: true })
        setPlans((data as PlanRow[]) || [])
        if (data && data.length > 0 && !planCode) {
            setPlanCode(data[0].code)
            setNewPrice(String(data[0].price))
        }
        setLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => { load() }, [load])

    const selectedPlan = plans.find((p) => p.code === planCode)

    const save = async () => {
        const priceNumber = Number(newPrice.replace(',', '.'))
        if (!planCode || !priceNumber || priceNumber <= 0) {
            toast.error('Preço inválido')
            return
        }
        setSaving(true)
        try {
            const result = await callAdminApi<{ updated: number; failed: number; total: number }>('/api/admin/plans/update-price', {
                planCode,
                newPrice: priceNumber,
            })
            toast.success(
                result.total > 0
                    ? `Preço atualizado! ${result.updated}/${result.total} assinaturas existentes ajustadas${result.failed ? ` (${result.failed} falharam)` : ''}.`
                    : 'Preço atualizado!'
            )
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao reajustar preço')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                <Tag size={12} />
                Reajustar preço de um plano
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
                Vale pra quem assinar dali pra frente e também é aplicado na hora pra quem já é assinante (promoção, aumento etc) — sem precisar de deploy.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
                <select
                    value={planCode}
                    onChange={(e) => {
                        setPlanCode(e.target.value)
                        const p = plans.find((pl) => pl.code === e.target.value)
                        if (p) setNewPrice(String(p.price))
                    }}
                    style={inputStyle}
                >
                    {plans.map((p) => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                </select>
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                    atual: R$ {selectedPlan ? Number(selectedPlan.price).toFixed(2) : '—'}
                </span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="novo preço"
                    style={{ ...inputStyle, width: 100 }}
                />
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                    style={{ background: colors.accent }}
                >
                    {saving ? <Spinner size={14} /> : 'Salvar'}
                </button>
            </div>
        </div>
    )
}

interface ServicePricingRow {
    service_type: string
    label: string
    base_price: number
    postpaid_price: number
}

// Preço por tipo de serviço do plano Pós-pago (corrida, serviço, pedido de
// loja, produto, agenda, agendamento...) — antes era um valor 0,50 fixo
// cravado no banco, agora cada tipo tem seu próprio preço, com teto de 3x a
// referência (base_price), garantido tanto aqui quanto por CHECK no banco.
function ServicePricingSection({ cardStyle, colors }: SectionProps) {
    const [rows, setRows] = useState<ServicePricingRow[]>([])
    const [loading, setLoading] = useState(true)
    const [editingType, setEditingType] = useState<string | null>(null)
    const [baseInput, setBaseInput] = useState('')
    const [postpaidInput, setPostpaidInput] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase.from('service_pricing').select('*').order('service_type', { ascending: true })
        setRows((data as ServicePricingRow[]) || [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    const startEdit = (row: ServicePricingRow) => {
        setEditingType(editingType === row.service_type ? null : row.service_type)
        setBaseInput(String(row.base_price))
        setPostpaidInput(String(row.postpaid_price))
    }

    const cap = baseInput ? Number(baseInput.replace(',', '.')) * 3 : null

    const save = async (serviceType: string) => {
        const base = Number(baseInput.replace(',', '.'))
        const postpaid = Number(postpaidInput.replace(',', '.'))
        if (!base || base <= 0 || !postpaid || postpaid <= 0) {
            toast.error('Preço inválido')
            return
        }
        if (cap != null && postpaid > cap) {
            toast.error(`O preço do pós-pago não pode passar de 3x a referência (máx. R$ ${cap.toFixed(2)})`)
            return
        }
        setSaving(true)
        try {
            await callAdminApi('/api/admin/service-pricing/update', { serviceType, basePrice: base, postpaidPrice: postpaid })
            toast.success('Preço atualizado!')
            setEditingType(null)
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar preço')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                <Tag size={12} />
                Preços do pós-pago (por tipo de serviço)
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
                O preço cobrado (postpaid_price) não pode passar de 3x a referência (base_price) — o mesmo teto que o banco garante. Some pra quem está no plano pós-pago.
            </p>
            <div className="space-y-2">
                {rows.map((row) => (
                    <div key={row.service_type} className="space-y-2 pb-2 border-b last:border-b-0" style={{ borderColor: colors.border }}>
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-black" style={{ color: colors.textPrimary }}>{row.label}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    Cobrado: R$ {Number(row.postpaid_price).toFixed(2)} · referência: R$ {Number(row.base_price).toFixed(2)}
                                </p>
                            </div>
                            <button
                                onClick={() => startEdit(row)}
                                className="text-[10px] font-bold px-2.5 py-1.5 rounded-full flex-shrink-0"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                            >
                                Editar
                            </button>
                        </div>

                        {editingType === row.service_type && (
                            <div className="flex flex-wrap gap-2 items-center pt-1">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>Referência</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={baseInput}
                                        onChange={(e) => setBaseInput(e.target.value)}
                                        style={{ ...inputStyle, width: 100 }}
                                    />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        Cobrado {cap != null && `(máx. R$ ${cap.toFixed(2)})`}
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={postpaidInput}
                                        onChange={(e) => setPostpaidInput(e.target.value)}
                                        style={{ ...inputStyle, width: 100 }}
                                    />
                                </div>
                                <button
                                    onClick={() => save(row.service_type)}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50 self-end"
                                    style={{ background: colors.accent }}
                                >
                                    {saving ? <Spinner size={14} /> : 'Salvar'}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// Concede um plano (motorista/prestador/loja/combo) por um número de dias,
// sem passar pela Asaas — pra dar acesso de graça por um período (parceiros,
// testes, cortesia). O admin geral nunca precisa disso pra si mesmo: ele já
// tem bypass automático em get_active_plan_grants.
function PlanGrantsSection({ cardStyle, colors }: SectionProps) {
    const [slug, setSlug] = useState('')
    const [planCode, setPlanCode] = useState('combo')
    const [days, setDays] = useState('30')
    const [granting, setGranting] = useState(false)
    // Só os planos que esse usuário pode conceder (o banco decide, pela
    // permissão dele) — a lista deixou de ser fixa no código.
    const [grantable, setGrantable] = useState<{ code: string; name: string }[]>([])

    useEffect(() => {
        supabase.rpc('get_my_grantable_plans').then(({ data }) => {
            const list = (data as { code: string; name: string }[]) || []
            setGrantable(list)
            if (list.length > 0) setPlanCode((prev) => (list.some((p) => p.code === prev) ? prev : list[0].code))
        })
    }, [])

    const handlePlanCodeChange = (code: string) => {
        setPlanCode(code)
        // "Motorista Beta" é vendido como "válido até o fim do ano" — sugere
        // os dias certos pra isso em vez de deixar o padrão genérico de 30.
        if (code === 'motorista_beta') setDays(String(daysUntilEndOfYear()))
    }

    const grant = async () => {
        if (!slug.trim()) return
        setGranting(true)
        try {
            await callAdminApi('/api/admin/plans/grant', {
                profileSlug: slug.trim(),
                planCode,
                days: Number(days),
            })
            toast.success(`Plano concedido a @${slug.trim()} por ${days} dias!`)
            setSlug('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder plano')
        } finally {
            setGranting(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Conceder plano sem cobrar
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
                A pessoa fica com o plano ativo pelo número de dias escolhido, sem passar pela Asaas — nem ela nem você paga nada.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
                <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="@slug do perfil"
                    style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                />
                <select value={planCode} onChange={(e) => handlePlanCodeChange(e.target.value)} style={inputStyle}>
                    {grantable.map((p) => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                </select>
                <input
                    type="number"
                    min={1}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    style={{ ...inputStyle, width: 90 }}
                    placeholder="dias"
                />
                <button
                    onClick={grant}
                    disabled={granting || !slug.trim()}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                    style={{ background: colors.accent }}
                >
                    {granting ? <Spinner size={14} /> : 'Conceder'}
                </button>
            </div>
        </div>
    )
}

interface PlanCodeRow {
    id: string
    code: string
    grant_type: 'days' | 'lifetime'
    days: number | null
    active: boolean
    max_uses: number
    use_count: number
    created_at: string
    plans: { code: string; name: string } | { code: string; name: string }[] | null
}

// Código promocional (motorista/prestador/loja/combo) que qualquer usuário
// resgata sozinho em /planos — pra convidar gente da plataforma pra um
// combo de cortesia, por exemplo, sem precisar saber o @slug de cada um
// de antemão (diferente da concessão direta acima, que já pede o slug).
function PlanCodesSection({ cardStyle, colors }: SectionProps) {
    const [codes, setCodes] = useState<PlanCodeRow[]>([])
    const [loading, setLoading] = useState(true)
    const [planCode, setPlanCode] = useState('combo')
    const [grantType, setGrantType] = useState<'days' | 'lifetime'>('days')
    const [days, setDays] = useState('30')
    const [maxUses, setMaxUses] = useState('1')
    const [generating, setGenerating] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { codes } = await callAdminApi<{ codes: PlanCodeRow[] }>('/api/admin/plan-codes/list')
            setCodes(codes)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar códigos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const generate = async () => {
        setGenerating(true)
        try {
            await callAdminApi('/api/admin/plan-codes/create', {
                planCode,
                grantType,
                days: grantType === 'days' ? Number(days) : undefined,
                maxUses: Number(maxUses),
            })
            toast.success('Código gerado!')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar código')
        } finally {
            setGenerating(false)
        }
    }

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code)
        toast.success('Código copiado!')
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Gerar código promocional
                </p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Qualquer pessoa com o código resgata sozinha em /planos — bom pra convidar várias pessoas da plataforma de uma vez pro combo, sem saber o @slug de cada uma.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} style={inputStyle}>
                        {GRANT_PLAN_OPTIONS.map((p) => (
                            <option key={p.code} value={p.code}>{p.label}</option>
                        ))}
                    </select>
                    <select value={grantType} onChange={(e) => setGrantType(e.target.value as any)} style={inputStyle}>
                        <option value="days">Por dias</option>
                        <option value="lifetime">Vitalício</option>
                    </select>
                    {grantType === 'days' && (
                        <input
                            type="number"
                            min={1}
                            value={days}
                            onChange={(e) => setDays(e.target.value)}
                            style={{ ...inputStyle, width: 80 }}
                            placeholder="dias"
                        />
                    )}
                    <input
                        type="number"
                        min={1}
                        value={maxUses}
                        onChange={(e) => setMaxUses(e.target.value)}
                        style={{ ...inputStyle, width: 90 }}
                        placeholder="usos"
                        title="Quantas pessoas diferentes podem usar esse mesmo código"
                    />
                    <button
                        onClick={generate}
                        disabled={generating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                        style={{ background: colors.accent }}
                    >
                        {generating ? <Spinner size={14} /> : <Plus size={14} />}
                        Gerar
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Códigos gerados ({codes.length})
                </p>
                {loading ? (
                    <div className="flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
                ) : codes.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                        Nenhum código gerado ainda.
                    </div>
                ) : codes.map((c) => {
                    const plan = Array.isArray(c.plans) ? c.plans[0] : c.plans
                    return (
                        <div key={c.id} style={cardStyle} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-mono font-bold truncate" style={{ color: colors.textPrimary }}>{c.code}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {plan?.name || plan?.code} · {c.grant_type === 'lifetime' ? 'Vitalício' : `${c.days} dias`} · usado {c.use_count}/{c.max_uses} {!c.active && '· inativo'}
                                </p>
                            </div>
                            <button
                                onClick={() => copyCode(c.code)}
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: colors.accent, color: colors.accentText }}
                            >
                                <Copy size={13} />
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
