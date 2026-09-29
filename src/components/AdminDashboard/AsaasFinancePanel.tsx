// components/AdminDashboard/AsaasFinancePanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Landmark, RefreshCw, Wallet, HandCoins, TrendingUp, AlertTriangle, Pencil, History, ArrowDownCircle, ArrowUpCircle, Search } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { ExpenseForm, type ExpenseRow } from './ExpenseForm'

interface AsaasFinancePanelProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface AsaasOverview {
    mrr: number
    active_subscriptions: number
    past_due_subscriptions: number
    canceled_subscriptions: number
    subscription_revenue_total: number
    subscription_revenue_this_month: number
    postpaid_collected_total: number
    postpaid_collected_this_month: number
    wallet_liability_total: number
    wallet_positive_users: number
    pending_withdrawals_total: number
    pending_withdrawals_count: number
    postpaid_debt_outstanding_total: number
    postpaid_debt_users_count: number
    postpaid_debt_blocked_count: number
    asaasBalance: number | null
    asaasBalanceError: string | null
    isSandbox: boolean
    expense: ExpenseRow | null
    receivedGrossTotal: number
    receivedNetTotal: number
    asaasFeesTotal: number
    pendingPaymentsTotal: number
    overduePaymentsTotal: number
    transfersOutTotal: number
    commissionTransfersTotal: number
    otherTransfersTotal: number
    unexplainedTotal: number
    platformProfitTotal: number
    totalAsaasCost: number
    payers: PersonRow[]
    commissionWithdrawers: PersonRow[]
    otherWithdrawers: PersonRow[]
    asaasActivityError: string | null
    activity: ActivityItem[]
}

interface PersonRow {
    name: string
    avatarUrl: string | null
    profileSlug: string | null
    linked: boolean
    date: string
    value: number
    netValue: number
    fee: number
}

interface ActivityItem {
    kind: 'payment' | 'transfer'
    status: string
    date: string
    value: number
    netValue: number
    personName: string | null
    detail: string | null
    linked: boolean
    asaasId: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    RECEIVED: { label: 'recebido', color: '#22c55e' },
    CONFIRMED: { label: 'confirmado', color: '#22c55e' },
    DONE: { label: 'concluído', color: '#22c55e' },
    PENDING: { label: 'pendente', color: '#94a3b8' },
    OVERDUE: { label: 'vencido', color: '#ef4444' },
    REFUNDED: { label: 'estornado', color: '#ef4444' },
    FAILED: { label: 'falhou', color: '#ef4444' },
}

function money(v: number | null | undefined): string {
    return `R$ ${Number(v || 0).toFixed(2)}`
}

// Asaas manda "2026-09-16 16:59:25" (com hora, de transferência/PIX) ou só
// "2026-09-16" (cobrança sem PIX associado) — trata os dois formatos.
function formatDateTime(dateStr: string): string {
    const hasTime = dateStr.includes(':')
    const d = new Date(hasTime ? dateStr.replace(' ', 'T') : `${dateStr}T00:00:00`)
    return hasTime
        ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('pt-BR')
}

// Pill de resumo — mesmo padrão de "grantedFree.plans" em SubscriptionsSection
// (AdminDashboard.tsx): rótulo + valor num badge arredondado.
function StatPill({ label, value, color, colors }: { label: string; value: string; color?: string; colors: ThemeColors }) {
    return (
        <span
            className="text-[11px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: color ? `${color}20` : `${colors.border}30`, color: color || colors.textSecondary }}
        >
            {label}: {value}
        </span>
    )
}

// Lista buscável de pessoas (quem pagou / quem sacou), uma linha por
// transação — não agrega por nome, porque o pedido é justamente dar pra
// ver quantas vezes cada um pagou e a que hora, não só o total. Foto e
// link pro perfil só existem pra quem está cadastrado no app (profileSlug).
function PersonSearchList({ items, colors }: { items: PersonRow[]; colors: ThemeColors }) {
    const [search, setSearch] = useState('')
    const filtered = search.trim()
        ? items.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
        : items

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Buscar entre ${items.length} pessoa(s)...`}
                    style={{ ...inputStyle, paddingLeft: 32, width: '100%' }}
                />
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
                {filtered.length === 0 ? (
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Nada encontrado.</p>
                ) : filtered.map((p, i) => {
                    const content = (
                        <>
                            {p.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.avatarUrl} alt={p.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                            ) : (
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                                    style={{ background: `${colors.border}40`, color: colors.textSecondary }}
                                >
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold truncate" style={{ color: p.profileSlug ? colors.accent : colors.textPrimary }}>
                                    {p.name}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{formatDateTime(p.date)}</p>
                            </div>
                            <span className="text-right flex-shrink-0">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{money(p.netValue)}</span>
                                {p.fee > 0.001 ? (
                                    <span className="block text-[10px]" style={{ color: colors.textSecondary }}>
                                        bruto {money(p.value)} · taxa -{money(p.fee)}
                                    </span>
                                ) : (
                                    <span className="block text-[10px]" style={{ color: colors.textSecondary }}>bruto {money(p.value)}</span>
                                )}
                            </span>
                        </>
                    )
                    return p.profileSlug ? (
                        <a
                            key={i}
                            href={`/${p.profileSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2 rounded-2xl"
                            style={{ background: `${colors.border}20` }}
                        >
                            {content}
                        </a>
                    ) : (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-2xl" style={{ background: `${colors.border}20` }}>
                            {content}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Painel "Asaas" dentro da aba Financeiro: o mapeamento completo de pra
// onde vai/vem cada real — o que está de fato na conta Asaas (externo, só
// eles sabem), o que o nosso banco registra como receita (assinatura +
// pós-pago), quanto devemos às pessoas (carteira/comissão) e quanto as
// pessoas nos devem (pós-pago em aberto). Tudo via get_asaas_financial_overview
// (migration 20261012000000), exceto o saldo Asaas (getBalance, só existe do
// lado deles). Cada bloco é seu próprio card (mesmo padrão de
// SubscriptionsSection/WithdrawalsSection em AdminDashboard.tsx), não um
// card único cheio de divisórias.
export default function AsaasFinancePanel({ cardStyle, colors }: AsaasFinancePanelProps) {
    const [overview, setOverview] = useState<AsaasOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCost, setEditingCost] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<AsaasOverview>('/api/admin/expenses/asaas-overview')
            setOverview(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar mapeamento do Asaas')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    if (loading && !overview) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }
    if (!overview) return null

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                    <Landmark size={13} />
                    Asaas — mapeamento financeiro
                </p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                >
                    {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
                </button>
            </div>

            {overview.expense && !editingCost && (
                <div style={cardStyle} className="flex items-center justify-between gap-3">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {overview.expense.notes || 'Cobrança de assinaturas e saques via PIX'}
                        {' — '}
                        <strong style={{ color: colors.textPrimary }}>
                            {overview.expense.billing_cycle === 'usage' ? 'variável (por transação)' : money(overview.expense.monthly_cost)}
                        </strong>
                    </p>
                    <button
                        onClick={() => setEditingCost(true)}
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                    >
                        <Pencil size={14} />
                    </button>
                </div>
            )}

            {editingCost && overview.expense && (
                <ExpenseForm
                    colors={colors}
                    cardStyle={cardStyle}
                    initial={overview.expense}
                    onCancel={() => setEditingCost(false)}
                    onSaved={() => { setEditingCost(false); load() }}
                />
            )}

            {overview.isSandbox && (
                <div style={cardStyle}>
                    <p className="text-sm" style={{ color: colors.textPrimary }}>
                        <strong>Ambiente sandbox</strong> — os valores do nosso banco são reais, mas nenhum PIX de verdade está
                        circulando na Asaas ainda. Troque pra URL e chave de produção quando for pra valer.
                    </p>
                </div>
            )}

            {/* ===== Saldo na conta Asaas (externo) ===== */}
            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Saldo na conta Asaas
                </p>
                {overview.asaasBalance !== null ? (
                    <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{money(overview.asaasBalance)}</p>
                ) : (
                    <p className="text-sm" style={{ color: colors.textSecondary }}>{overview.asaasBalanceError || 'Não configurado'}</p>
                )}
                <div className="flex flex-wrap gap-2">
                    <StatPill label="Bruto recebido" value={money(overview.receivedGrossTotal)} colors={colors} />
                    <StatPill label="Taxa Asaas" value={`-${money(overview.asaasFeesTotal)}`} color="#ef4444" colors={colors} />
                    <StatPill label="Líquido" value={money(overview.receivedNetTotal)} color="#22c55e" colors={colors} />
                    {overview.pendingPaymentsTotal > 0 && (
                        <StatPill label="Pendente" value={money(overview.pendingPaymentsTotal)} colors={colors} />
                    )}
                    {overview.overduePaymentsTotal > 0 && (
                        <StatPill label="Vencido" value={money(overview.overduePaymentsTotal)} color="#ef4444" colors={colors} />
                    )}
                </div>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Baseado nas últimas 20 cobranças na Asaas.</p>
            </div>

            {overview.payers.length > 0 && (
                <div style={cardStyle} className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Quem pagou ({overview.payers.length})
                    </p>
                    <PersonSearchList items={overview.payers} colors={colors} />
                </div>
            )}

            {/* ===== Lucro da plataforma ===== */}
            {overview.receivedNetTotal > 0 && (
                <div style={cardStyle} className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Lucro da plataforma
                    </p>
                    <p className="text-2xl font-black" style={{ color: '#22c55e' }}>{money(overview.platformProfitTotal)}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        Já sacado pelo dono do iUser — fora do fluxo de comissão. Nenhum valor "ainda parado na conta" entra
                        aqui: o saldo real na Asaas hoje é {money(overview.asaasBalance)}.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <StatPill label="Líquido recebido" value={money(overview.receivedNetTotal)} colors={colors} />
                        <StatPill label="Comissão repassada" value={`-${money(overview.commissionTransfersTotal)}`} color="#ef4444" colors={colors} />
                        <StatPill label="Outro custo Asaas" value={`-${money(overview.unexplainedTotal)}`} color="#94a3b8" colors={colors} />
                    </div>
                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                        Comissão nunca foi dinheiro da iUser (repasse pra quem indicou). "Líquido recebido" já descontou a
                        taxa por cobrança da Asaas ({money(overview.asaasFeesTotal)} no total). "Outro custo Asaas" é uma
                        diferença que essas 20 cobranças/transferências não explicam sozinhas — provavelmente mais algum
                        custo da conta (ex: mensalidade), não é lucro parado. Lucro = líquido − comissão − esse outro custo.
                    </p>
                </div>
            )}

            {overview.commissionWithdrawers.length > 0 && (
                <div style={cardStyle} className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#ef4444' }}>
                        Repasse de comissão ({overview.commissionWithdrawers.length})
                    </p>
                    <PersonSearchList items={overview.commissionWithdrawers} colors={colors} />
                </div>
            )}

            {overview.otherWithdrawers.length > 0 && (
                <div style={cardStyle} className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                        Outras retiradas ({overview.otherWithdrawers.length})
                    </p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Ex: o dono da conta sacando pra si, fora do fluxo de comissão.</p>
                    <PersonSearchList items={overview.otherWithdrawers} colors={colors} />
                </div>
            )}

            {/* ===== Na aplicação (nosso banco) ===== */}
            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <TrendingUp size={12} /> Na aplicação (banco)
                </p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                    {money(overview.mrr)}<span className="text-xs font-bold" style={{ color: colors.textSecondary }}> MRR</span>
                </p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    {overview.active_subscriptions} ativa{overview.active_subscriptions !== 1 ? 's' : ''} · {overview.past_due_subscriptions} atrasada{overview.past_due_subscriptions !== 1 ? 's' : ''} · {overview.canceled_subscriptions} cancelada{overview.canceled_subscriptions !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                    <StatPill label="Assinatura (total)" value={money(overview.subscription_revenue_total)} colors={colors} />
                    <StatPill label="Assinatura (mês)" value={money(overview.subscription_revenue_this_month)} color="#22c55e" colors={colors} />
                    <StatPill label="Pós-pago (total)" value={money(overview.postpaid_collected_total)} colors={colors} />
                    <StatPill label="Pós-pago (mês)" value={money(overview.postpaid_collected_this_month)} color="#22c55e" colors={colors} />
                </div>
            </div>

            {/* ===== Carteira das pessoas (o que devemos) ===== */}
            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <Wallet size={12} /> Carteira das pessoas (o que devemos)
                </p>
                <p className="text-2xl font-black" style={{ color: overview.wallet_liability_total > 0 ? '#ef4444' : colors.textPrimary }}>
                    {money(overview.wallet_liability_total)}
                </p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    {overview.wallet_positive_users} pessoa{overview.wallet_positive_users !== 1 ? 's' : ''} com saldo pra sacar
                </p>
                {overview.pending_withdrawals_count > 0 && (
                    <StatPill label="Saques pendentes" value={`${money(overview.pending_withdrawals_total)} · ${overview.pending_withdrawals_count} pedido(s)`} color="#f97316" colors={colors} />
                )}
            </div>

            {/* ===== O que nos devem (pós-pago em aberto) ===== */}
            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <HandCoins size={12} /> O que nos devem (pós-pago em aberto)
                </p>
                <p className="text-2xl font-black" style={{ color: '#22c55e' }}>{money(overview.postpaid_debt_outstanding_total)}</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    {overview.postpaid_debt_users_count} pessoa{overview.postpaid_debt_users_count !== 1 ? 's' : ''} devendo
                </p>
                {overview.postpaid_debt_blocked_count > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: '#ef4444' }}>
                        <AlertTriangle size={13} />
                        {overview.postpaid_debt_blocked_count} pessoa{overview.postpaid_debt_blocked_count !== 1 ? 's' : ''} bloqueada{overview.postpaid_debt_blocked_count !== 1 ? 's' : ''} (dívida ≥ R$ 50)
                    </div>
                )}
            </div>

            {/* ===== Atividade recente na Asaas ===== */}
            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <History size={12} /> Atividade recente na Asaas ({overview.activity.length})
                </p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    Direto da Asaas — inclui cobrança criada manualmente no dashboard deles. "Fora do app" não bate com
                    nenhuma assinatura/saque registrado no nosso banco.
                </p>
                {overview.asaasActivityError && (
                    <div style={cardStyle}><p className="text-sm" style={{ color: '#ef4444' }}>{overview.asaasActivityError}</p></div>
                )}
                {overview.activity.length === 0 ? (
                    <div style={cardStyle}><p className="text-sm" style={{ color: colors.textSecondary }}>Nenhuma atividade ainda.</p></div>
                ) : overview.activity.map((a, i) => {
                    const isOutflow = a.kind === 'transfer'
                    const Icon = isOutflow ? ArrowUpCircle : ArrowDownCircle
                    const statusInfo = STATUS_LABEL[a.status] || { label: a.status.toLowerCase(), color: colors.textSecondary }
                    const isReceived = a.status === 'RECEIVED' || a.status === 'CONFIRMED' || a.status === 'DONE'
                    return (
                        <div key={`${a.kind}-${a.asaasId}-${i}`} style={cardStyle} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <Icon size={20} style={{ color: statusInfo.color, flexShrink: 0 }} />
                                <div className="min-w-0">
                                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {isOutflow ? 'Transferência' : 'Cobrança'}{a.personName && ` · ${a.personName}`}
                                    </p>
                                    <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
                                        {new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        {a.detail && ` · ${a.detail}`}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}>
                                            {statusInfo.label}
                                        </span>
                                        {!a.linked && (
                                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                                fora do app
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <p className="text-sm font-black" style={{ color: isOutflow ? '#ef4444' : isReceived ? '#22c55e' : colors.textSecondary }}>
                                    {isOutflow ? '-' : '+'}{money(a.value)}
                                </p>
                                {!isOutflow && a.value !== a.netValue && (
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>líquido {money(a.netValue)}</p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
