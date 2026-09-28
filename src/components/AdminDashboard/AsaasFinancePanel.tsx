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

// Lista buscável de pessoas (quem pagou / quem sacou), uma linha por
// transação — não agrega por nome, porque o pedido é justamente dar pra
// ver quantas vezes cada um pagou e a que hora, não só o total. Foto e
// link pro perfil só existem pra quem está cadastrado no app (profileSlug).
function PersonSearchList({ items, colors }: { items: PersonRow[]; colors: ThemeColors }) {
    const [search, setSearch] = useState('')
    const filtered = search.trim()
        ? items.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
        : items

    return (
        <div className="space-y-1.5">
            <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.textSecondary }} />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Buscar entre ${items.length} pessoa(s)...`}
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg text-[10px]"
                    style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                />
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
                {filtered.length === 0 ? (
                    <p className="text-[10px] py-1 px-1" style={{ color: colors.textSecondary }}>Nada encontrado.</p>
                ) : filtered.map((p, i) => {
                    const rowStyle: React.CSSProperties = { background: `${colors.border}15` }
                    const content = (
                        <>
                            {p.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.avatarUrl} alt={p.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                            ) : (
                                <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black"
                                    style={{ background: `${colors.border}40`, color: colors.textSecondary }}
                                >
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold truncate" style={{ color: p.profileSlug ? colors.accent : colors.textPrimary }}>
                                    {p.name}
                                </p>
                                <p className="text-[9px] truncate" style={{ color: colors.textSecondary }}>{formatDateTime(p.date)}</p>
                            </div>
                            <span className="text-[10px] font-black flex-shrink-0" style={{ color: colors.textPrimary }}>{money(p.value)}</span>
                        </>
                    )
                    return p.profileSlug ? (
                        <a
                            key={i}
                            href={`/${p.profileSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-1.5 py-1 rounded-lg"
                            style={rowStyle}
                        >
                            {content}
                        </a>
                    ) : (
                        <div key={i} className="flex items-center gap-2 px-1.5 py-1 rounded-lg" style={rowStyle}>
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
// (migration 20261012000000), exceto o saldo Asaas (getBalance, só existe do lado deles).
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

    const row = (label: string, value: string, opts?: { color?: string; sub?: string }) => (
        <div className="flex items-center justify-between gap-2 text-[11px]">
            <span style={{ color: colors.textSecondary }}>{label}</span>
            <span className="text-right">
                <span className="font-black" style={{ color: opts?.color || colors.textPrimary }}>{value}</span>
                {opts?.sub && <span className="block text-[9px]" style={{ color: colors.textSecondary }}>{opts.sub}</span>}
            </span>
        </div>
    )

    return (
        <div style={cardStyle} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                    <Landmark size={13} />
                    Asaas — mapeamento financeiro
                </p>
                <button
                    onClick={load}
                    disabled={loading}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                >
                    {loading ? <Spinner size={13} /> : <RefreshCw size={13} />}
                </button>
            </div>

            {loading && !overview ? (
                <div className="flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
            ) : overview && (
                <>
                    {overview.expense && !editingCost && (
                        <div className="flex items-center justify-between gap-2 text-[11px] p-2.5 rounded-xl" style={{ background: `${colors.border}20` }}>
                            <span style={{ color: colors.textSecondary }}>
                                {overview.expense.notes || 'Cobrança de assinaturas e saques via PIX'}
                                {' · '}Custo: <strong style={{ color: colors.textPrimary }}>
                                    {overview.expense.billing_cycle === 'usage' ? 'variável (por transação)' : money(overview.expense.monthly_cost)}
                                </strong>
                            </span>
                            <button onClick={() => setEditingCost(true)} style={{ color: colors.textSecondary }} className="flex-shrink-0">
                                <Pencil size={12} />
                            </button>
                        </div>
                    )}

                    {editingCost && overview.expense && (
                        <ExpenseForm
                            colors={colors}
                            cardStyle={{ background: 'transparent', padding: 0 }}
                            initial={overview.expense}
                            onCancel={() => setEditingCost(false)}
                            onSaved={() => { setEditingCost(false); load() }}
                        />
                    )}

                    {overview.isSandbox && (
                        <div className="rounded-2xl p-3" style={{ background: '#f59e0b15', border: '1px solid #f59e0b40' }}>
                            <p className="text-[11px]" style={{ color: colors.textPrimary }}>
                                <strong>Ambiente sandbox</strong> (<code>ASAAS_API_BASE_URL</code>) — os valores abaixo do nosso banco são
                                reais, mas nenhum PIX de verdade está circulando na Asaas ainda. Antes de ir pra produção, troque pra
                                a URL de produção da Asaas e uma chave de API de produção.
                            </p>
                        </div>
                    )}

                    {/* ===== 1. Na conta Asaas (externo) ===== */}
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Na conta Asaas (externo, via API deles)
                        </p>
                        {overview.asaasBalance !== null ? (
                            row('Saldo disponível', money(overview.asaasBalance))
                        ) : (
                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                {overview.asaasBalanceError || 'Não configurado'}
                            </p>
                        )}
                        {row('Recebido bruto (últimas 20 cobranças)', money(overview.receivedGrossTotal))}
                        {overview.payers.length > 0 && <PersonSearchList items={overview.payers} colors={colors} />}
                        {row('Taxa da Asaas descontada', `-${money(overview.asaasFeesTotal)}`, { color: '#ef4444' })}
                        {row('Ficou líquido pra plataforma', money(overview.receivedNetTotal), { color: '#22c55e' })}
                        {(overview.pendingPaymentsTotal > 0 || overview.overduePaymentsTotal > 0) && (
                            <p className="text-[9px] pt-0.5" style={{ color: colors.textSecondary }}>
                                {overview.pendingPaymentsTotal > 0 && `${money(overview.pendingPaymentsTotal)} pendente`}
                                {overview.pendingPaymentsTotal > 0 && overview.overduePaymentsTotal > 0 && ' · '}
                                {overview.overduePaymentsTotal > 0 && `${money(overview.overduePaymentsTotal)} vencido, não recebido`}
                            </p>
                        )}
                    </div>

                    {/* ===== 1b. Pra onde foi o líquido ===== */}
                    {overview.receivedNetTotal > 0 && (
                        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Pra onde foi o líquido ({money(overview.receivedNetTotal)})
                            </p>
                            {row(
                                'Repasse de comissão (quem indicou)',
                                `-${money(overview.commissionTransfersTotal)}`,
                                { color: overview.commissionTransfersTotal > 0 ? '#ef4444' : colors.textPrimary }
                            )}
                            {overview.commissionWithdrawers.length > 0 && <PersonSearchList items={overview.commissionWithdrawers} colors={colors} />}
                            {row(
                                'Outras retiradas da conta',
                                `-${money(overview.otherTransfersTotal)}`,
                                { color: overview.otherTransfersTotal > 0 ? '#ef4444' : colors.textPrimary, sub: 'ex: o dono da conta sacando pra si, fora do fluxo de comissão' }
                            )}
                            {overview.otherWithdrawers.length > 0 && <PersonSearchList items={overview.otherWithdrawers} colors={colors} />}
                            {row(
                                'Ainda não repassado (estimado)',
                                money(overview.unexplainedTotal),
                                { sub: 'diferença pro saldo real pode ser taxa/ajuste da conta fora dessas 20 cobranças' }
                            )}
                        </div>
                    )}

                    {/* ===== 2. Na aplicação (nosso banco) ===== */}
                    <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                            <TrendingUp size={11} /> Na aplicação (banco, auto)
                        </p>
                        {row('MRR (assinaturas ativas)', money(overview.mrr))}
                        {row(
                            'Assinaturas',
                            `${overview.active_subscriptions} ativas`,
                            { sub: `${overview.past_due_subscriptions} atrasadas · ${overview.canceled_subscriptions} canceladas` }
                        )}
                        {row('Receita de assinatura (total)', money(overview.subscription_revenue_total))}
                        {row('Receita de assinatura (mês)', money(overview.subscription_revenue_this_month), { color: '#22c55e' })}
                        {row('Pós-pago recebido (total)', money(overview.postpaid_collected_total))}
                        {row('Pós-pago recebido (mês)', money(overview.postpaid_collected_this_month), { color: '#22c55e' })}
                    </div>

                    {/* ===== 3. Carteira das pessoas (o que devemos) ===== */}
                    <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                            <Wallet size={11} /> Carteira das pessoas (o que devemos)
                        </p>
                        {row(
                            'Passivo total (saldo somado)',
                            money(overview.wallet_liability_total),
                            { color: overview.wallet_liability_total > 0 ? '#ef4444' : colors.textPrimary, sub: `${overview.wallet_positive_users} pessoa(s) com saldo pra sacar` }
                        )}
                        {row(
                            'Saques pendentes',
                            money(overview.pending_withdrawals_total),
                            { color: overview.pending_withdrawals_count > 0 ? '#f97316' : colors.textPrimary, sub: `${overview.pending_withdrawals_count} pedido(s) aguardando` }
                        )}
                    </div>

                    {/* ===== 4. O que cada pessoa pode pagar (pós-pago em aberto) ===== */}
                    <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                            <HandCoins size={11} /> O que nos devem (pós-pago em aberto)
                        </p>
                        {row(
                            'Dívida em aberto (total)',
                            money(overview.postpaid_debt_outstanding_total),
                            { color: '#22c55e', sub: `${overview.postpaid_debt_users_count} pessoa(s) devendo` }
                        )}
                        {overview.postpaid_debt_blocked_count > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] pt-1" style={{ color: '#ef4444' }}>
                                <AlertTriangle size={11} />
                                {overview.postpaid_debt_blocked_count} pessoa(s) bloqueada(s) (dívida ≥ R$ 50)
                            </div>
                        )}
                    </div>

                    {/* ===== 5. Atividade recente na Asaas ===== */}
                    <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                            <History size={11} /> Atividade recente na Asaas
                        </p>
                        <p className="text-[9px] -mt-1" style={{ color: colors.textSecondary }}>
                            Direto da Asaas (últimas 20 cobranças + transferências) — inclui até cobrança criada manualmente
                            no dashboard deles. "Fora do app" = não bate com nenhuma assinatura/saque registrado no nosso banco.
                        </p>
                        {overview.asaasActivityError && (
                            <p className="text-[10px] py-1" style={{ color: '#ef4444' }}>{overview.asaasActivityError}</p>
                        )}
                        {overview.activity.length === 0 ? (
                            <p className="text-[10px] py-2" style={{ color: colors.textSecondary }}>Nenhuma atividade ainda.</p>
                        ) : overview.activity.map((a, i) => {
                            const isOutflow = a.kind === 'transfer'
                            const Icon = isOutflow ? ArrowUpCircle : ArrowDownCircle
                            const statusInfo = STATUS_LABEL[a.status] || { label: a.status.toLowerCase(), color: colors.textSecondary }
                            const isReceived = a.status === 'RECEIVED' || a.status === 'CONFIRMED' || a.status === 'DONE'
                            return (
                                <div key={`${a.kind}-${a.asaasId}-${i}`} className="flex items-center justify-between gap-2 text-[11px] py-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon size={14} style={{ color: statusInfo.color, flexShrink: 0 }} />
                                        <div className="min-w-0">
                                            <p className="font-bold truncate flex items-center gap-1" style={{ color: colors.textPrimary }}>
                                                {isOutflow ? 'Transferência' : 'Cobrança'}{a.personName && ` · ${a.personName}`}
                                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}>
                                                    {statusInfo.label}
                                                </span>
                                                {!a.linked && (
                                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                                        fora do app
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[9px] truncate" style={{ color: colors.textSecondary }}>
                                                {new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                {a.detail && ` · ${a.detail}`}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="font-black flex-shrink-0 text-right" style={{ color: isOutflow ? '#ef4444' : isReceived ? '#22c55e' : colors.textSecondary }}>
                                        {isOutflow ? '-' : '+'}{money(a.value)}
                                        {!isOutflow && a.value !== a.netValue && (
                                            <span className="block text-[8px] font-normal" style={{ color: colors.textSecondary }}>líquido {money(a.netValue)}</span>
                                        )}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}
