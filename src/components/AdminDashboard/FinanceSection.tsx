// components/AdminDashboard/FinanceSection.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { hexToRgb } from '@/lib/color'
import { callAdminApi } from '@/lib/callAdminApi'
import { Plus, Pencil, Trash2, AlertTriangle, TrendingUp, TrendingDown, Wallet, ExternalLink } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import SupabaseUsagePanel from './SupabaseUsagePanel'
import AsaasFinancePanel from './AsaasFinancePanel'
import { ExpenseForm, BILLING_CYCLE_LABEL, normalizedMonthlyCost, daysUntil, type ExpenseRow } from './ExpenseForm'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface FinanceSectionProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

// Aba "Financeiro" do admin: quanto o iUser gasta com serviços externos
// pagos (Supabase, Asaas, Mapbox, Firebase, hospedagem etc) por mês, x
// quanto entra de receita recorrente (assinaturas ativas) — pra nunca
// deixar uma conta vencer sem perceber e o iUser sair do ar.
export default function FinanceSection({ cardStyle, colors }: FinanceSectionProps) {
    const surfaceRgb = hexToRgb(colors.surface)
    const [expenses, setExpenses] = useState<ExpenseRow[]>([])
    const [monthlyRevenue, setMonthlyRevenue] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<ExpenseRow | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<ExpenseRow | null>(null)
    const [deleting, setDeleting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<{ expenses: ExpenseRow[]; monthlyRevenue: number }>('/api/admin/expenses/list')
            setExpenses(res.expenses)
            setMonthlyRevenue(res.monthlyRevenue)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar gastos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const startEdit = (row: ExpenseRow | null) => {
        setEditing(row)
        setShowForm(true)
    }

    const handleDelete = async () => {
        if (!deleteConfirm) return
        setDeleting(true)
        try {
            await callAdminApi('/api/admin/expenses/delete', { id: deleteConfirm.id })
            toast.success('Removido!')
            setDeleteConfirm(null)
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao remover')
        } finally {
            setDeleting(false)
        }
    }

    const activeExpenses = expenses.filter((e) => e.is_active)
    const totalFixedMonthly = activeExpenses.reduce((sum, e) => sum + normalizedMonthlyCost(e), 0)
    const totalUsageBased = activeExpenses.filter((e) => e.billing_cycle === 'usage').length
    const saldo = monthlyRevenue - totalFixedMonthly

    const upcoming = activeExpenses
        .map((e) => ({ row: e, days: daysUntil(e.next_due_date) }))
        .filter((e): e is { row: ExpenseRow; days: number } => e.days !== null && e.days <= 7)
        .sort((a, b) => a.days - b.days)

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    return (
        <div className="space-y-5">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                        <Wallet size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Financeiro</h3>
                        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                            Gastos com serviços pagos x receita recorrente
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl border" style={{ borderColor: colors.border, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                            <TrendingDown size={13} /> Gasto fixo/mês
                        </div>
                        <p className="text-lg font-black" style={{ color: colors.textPrimary }}>R$ {totalFixedMonthly.toFixed(2)}</p>
                        {totalUsageBased > 0 && (
                            <p className="text-[9px]" style={{ color: colors.textSecondary }}>+{totalUsageBased} de uso variável</p>
                        )}
                    </div>
                    <div className="p-3 rounded-2xl border" style={{ borderColor: colors.border, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                            <TrendingUp size={13} /> Receita/mês
                        </div>
                        <p className="text-lg font-black" style={{ color: '#22c55e' }}>R$ {monthlyRevenue.toFixed(2)}</p>
                    </div>
                    <div
                        className="p-3 rounded-2xl border col-span-2 sm:col-span-1"
                        style={{ borderColor: saldo >= 0 ? '#22c55e40' : '#ef444440', background: saldo >= 0 ? '#22c55e10' : '#ef444410' }}
                    >
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                            Saldo estimado
                        </div>
                        <p className="text-lg font-black" style={{ color: saldo >= 0 ? '#22c55e' : '#ef4444' }}>
                            {saldo >= 0 ? '+' : ''}R$ {saldo.toFixed(2)}
                        </p>
                    </div>
                </div>

                {upcoming.length > 0 && (
                    <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: '#f9731615', border: '1px solid #f9731640' }}>
                        <p className="text-xs font-black flex items-center gap-1.5" style={{ color: '#f97316' }}>
                            <AlertTriangle size={13} /> Vencendo em breve
                        </p>
                        {upcoming.map(({ row, days }) => (
                            <p key={row.id} className="text-[11px]" style={{ color: colors.textPrimary }}>
                                <strong>{row.service_name}</strong> — {days < 0 ? `venceu há ${Math.abs(days)} dia${Math.abs(days) !== 1 ? 's' : ''}` : days === 0 ? 'vence hoje' : `vence em ${days} dia${days !== 1 ? 's' : ''}`}
                            </p>
                        ))}
                    </div>
                )}

                <button
                    onClick={() => startEdit(null)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold self-start"
                    style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }}
                >
                    <Plus size={14} /> Adicionar serviço
                </button>
            </div>

            <SupabaseUsagePanel cardStyle={cardStyle} colors={colors} />
            <AsaasFinancePanel cardStyle={cardStyle} colors={colors} />

            {showForm && (
                <ExpenseForm
                    colors={colors}
                    cardStyle={cardStyle}
                    initial={editing}
                    onCancel={() => { setShowForm(false); setEditing(null) }}
                    onSaved={async () => { setShowForm(false); setEditing(null); await load() }}
                />
            )}

            <div className="space-y-2">
                {/* Supabase e Asaas têm card próprio acima (custo + uso/mapeamento
                juntos, ver SupabaseUsagePanel/AsaasFinancePanel) — não repetem aqui
                pra não separar a mesma coisa em dois lugares diferentes na tela. */}
                {(() => {
                    const otherExpenses = expenses.filter((e) => e.service_name !== 'Supabase' && e.service_name !== 'Asaas')
                    return (
                        <>
                            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Outros serviços ({otherExpenses.length})
                            </p>
                            {otherExpenses.length === 0 ? (
                                <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>Nenhum outro serviço cadastrado ainda.</div>
                            ) : otherExpenses.map((row) => {
                    const days = daysUntil(row.next_due_date)
                    return (
                        <div key={row.id} style={cardStyle} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{row.service_name}</p>
                                    {row.plan_name && (
                                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>({row.plan_name})</span>
                                    )}
                                    {!row.is_active && (
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                                            Inativo
                                        </span>
                                    )}
                                    {row.billing_url && (
                                        <a href={row.billing_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                            <ExternalLink size={11} style={{ color: colors.textSecondary }} />
                                        </a>
                                    )}
                                </div>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {row.category || 'Sem categoria'} · {BILLING_CYCLE_LABEL[row.billing_cycle]}
                                    {row.billing_cycle !== 'usage' && row.billing_cycle !== 'one_time' && ` · R$ ${Number(row.monthly_cost).toFixed(2)}`}
                                    {row.next_due_date && (
                                        <> · vence {new Date(row.next_due_date + 'T00:00:00').toLocaleDateString('pt-BR')}{days !== null && days <= 7 && (
                                            <span style={{ color: '#f97316', fontWeight: 700 }}> ({days < 0 ? 'atrasado' : days === 0 ? 'hoje' : `${days}d`})</span>
                                        )}</>
                                    )}
                                </p>
                                {row.notes && <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>{row.notes}</p>}
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                    onClick={() => startEdit(row)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                >
                                    <Pencil size={13} />
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(row)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: '#ef444420', color: '#ef4444' }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    )
                            })}
                        </>
                    )
                })()}
            </div>

            {deleteConfirm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-black mb-2" style={{ color: colors.textPrimary }}>Remover serviço</h3>
                        <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                            Tem certeza que deseja remover <strong style={{ color: colors.textPrimary }}>{deleteConfirm.service_name}</strong>?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                                style={{ background: '#ef4444', color: '#fff' }}
                            >
                                {deleting ? <Spinner size={14} color="#ffffff" /> : 'Remover'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
