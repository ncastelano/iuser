// components/AdminDashboard/SupabaseUsagePanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Database, ExternalLink, Pencil, RefreshCw, Table2 } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'

const SUPABASE_PROJECT_REF = 'mqtwehsmkuknkrtrqbnf'
const SUPABASE_USAGE_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/billing/usage`

interface SupabaseUsagePanelProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface TopTable {
    table_name: string
    size_bytes: number
    size_pretty: string
    approx_rows: number
}

interface DbStats {
    database_size_bytes: number
    database_size_pretty: string
    top_tables: TopTable[]
}

interface UsageMetric {
    id: string
    metric_name: string
    used_value: number
    included_value: number
    unit: string
    overage_price_per_unit: number
    notes: string | null
    updated_at: string
}

function overageCost(m: UsageMetric): number {
    const over = Math.max(0, m.used_value - m.included_value)
    return over * m.overage_price_per_unit
}

function usageColor(used: number, included: number): string {
    if (included <= 0) return '#94a3b8'
    const pct = (used / included) * 100
    if (pct >= 90) return '#ef4444'
    if (pct >= 70) return '#f59e0b'
    return '#22c55e'
}

// Painel "Supabase" dentro da aba Financeiro: uma parte é lida direto do
// Postgres (tamanho do banco, maiores tabelas) e outra o admin preenche à
// mão olhando a página de uso/billing do próprio Supabase — banda, storage
// e MAUs não dão pra ler via SQL, só pela API de billing deles.
export default function SupabaseUsagePanel({ cardStyle, colors }: SupabaseUsagePanelProps) {
    const [dbStats, setDbStats] = useState<DbStats | null>(null)
    const [loadingStats, setLoadingStats] = useState(true)
    const [metrics, setMetrics] = useState<UsageMetric[]>([])
    const [loadingMetrics, setLoadingMetrics] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editUsed, setEditUsed] = useState('')
    const [editIncluded, setEditIncluded] = useState('')
    const [editPrice, setEditPrice] = useState('')
    const [saving, setSaving] = useState(false)

    const loadStats = useCallback(async () => {
        setLoadingStats(true)
        try {
            const res = await callAdminApi<DbStats>('/api/admin/expenses/supabase-stats')
            setDbStats(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar estatísticas do banco')
        } finally {
            setLoadingStats(false)
        }
    }, [])

    const loadMetrics = useCallback(async () => {
        setLoadingMetrics(true)
        try {
            const res = await callAdminApi<{ metrics: UsageMetric[] }>('/api/admin/expenses/supabase-metrics/list')
            setMetrics(res.metrics)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar métricas de uso')
        } finally {
            setLoadingMetrics(false)
        }
    }, [])

    useEffect(() => { loadStats(); loadMetrics() }, [loadStats, loadMetrics])

    const startEdit = (m: UsageMetric) => {
        setEditingId(m.id)
        setEditUsed(String(m.used_value))
        setEditIncluded(String(m.included_value))
        setEditPrice(String(m.overage_price_per_unit))
    }

    const saveEdit = async (id: string) => {
        setSaving(true)
        try {
            await callAdminApi('/api/admin/expenses/supabase-metrics/save', {
                id,
                usedValue: Number(editUsed.replace(',', '.')) || 0,
                includedValue: Number(editIncluded.replace(',', '.')) || 0,
                overagePricePerUnit: Number(editPrice.replace(',', '.')) || 0,
            })
            toast.success('Atualizado!')
            setEditingId(null)
            await loadMetrics()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 10,
        padding: '6px 10px',
        fontSize: 12,
    }

    const maxTableSize = Math.max(...(dbStats?.top_tables.map((t) => t.size_bytes) || [1]), 1)
    const totalOverage = metrics.reduce((sum, m) => sum + overageCost(m), 0)

    return (
        <div style={cardStyle} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                    <Database size={13} />
                    Supabase — uso e limites
                </p>
                <a
                    href={SUPABASE_USAGE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] font-bold"
                    style={{ color: colors.accent }}
                >
                    Ver no Supabase <ExternalLink size={11} />
                </a>
            </div>

            {/* ===== Auto: tamanho do banco ===== */}
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-[10px] uppercase font-bold" style={{ color: colors.textSecondary }}>Tamanho do banco (auto)</p>
                    <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        {loadingStats ? '...' : dbStats?.database_size_pretty || '—'}
                    </p>
                </div>
                <button
                    onClick={loadStats}
                    disabled={loadingStats}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                >
                    {loadingStats ? <Spinner size={13} /> : <RefreshCw size={13} />}
                </button>
            </div>

            {dbStats && dbStats.top_tables.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                        <Table2 size={11} /> Maiores tabelas
                    </p>
                    {dbStats.top_tables.map((t) => (
                        <div key={t.table_name} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold truncate" style={{ color: colors.textPrimary }}>{t.table_name}</span>
                                <span style={{ color: colors.textSecondary }}>{t.size_pretty} · {t.approx_rows.toLocaleString('pt-BR')} linhas</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${colors.border}30` }}>
                                <div style={{ width: `${(t.size_bytes / maxTableSize) * 100}%`, background: colors.accent, height: '100%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ===== Manual: uso x cota de cada recurso ===== */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: colors.border }}>
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Uso x cota do plano (atualize olhando o Supabase)
                    </p>
                    {!loadingMetrics && totalOverage > 0 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#ef444420', color: '#ef4444' }}>
                            +US$ {totalOverage.toFixed(2)} estimado
                        </span>
                    )}
                </div>
                <p className="text-[9px] -mt-1" style={{ color: colors.textSecondary }}>
                    Estimativa em dólar (é como o Supabase cobra), com base no preço de overage por unidade de cada métrica — confira/ajuste contra a página de preços do Supabase se o plano mudar.
                </p>
                {loadingMetrics ? (
                    <div className="flex justify-center py-4"><Spinner size={18} color={colors.accent} /></div>
                ) : metrics.map((m) => {
                    const pct = m.included_value > 0 ? Math.min(100, (m.used_value / m.included_value) * 100) : 0
                    const color = usageColor(m.used_value, m.included_value)
                    const isEditing = editingId === m.id
                    const cost = overageCost(m)
                    return (
                        <div key={m.id} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold" style={{ color: colors.textPrimary }}>{m.metric_name}</span>
                                {!isEditing && (
                                    <div className="flex items-center gap-2">
                                        <span style={{ color: colors.textSecondary }}>
                                            {m.used_value.toLocaleString('pt-BR')} / {m.included_value.toLocaleString('pt-BR')} {m.unit}
                                            {cost > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}> · +US$ {cost.toFixed(2)}</span>}
                                        </span>
                                        <button onClick={() => startEdit(m)} style={{ color: colors.textSecondary }}>
                                            <Pencil size={11} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            {isEditing ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <input type="text" inputMode="decimal" value={editUsed} onChange={(e) => setEditUsed(e.target.value)} placeholder="usado" style={{ ...inputStyle, width: 80 }} />
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>de</span>
                                    <input type="text" inputMode="decimal" value={editIncluded} onChange={(e) => setEditIncluded(e.target.value)} placeholder="incluído" style={{ ...inputStyle, width: 80 }} />
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>{m.unit}</span>
                                    <div className="w-full flex items-center gap-1.5">
                                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>US$</span>
                                        <input type="text" inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="preço por unidade extra" style={{ ...inputStyle, width: 130 }} />
                                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>por {m.unit} acima da cota</span>
                                    </div>
                                    <button onClick={() => saveEdit(m.id)} disabled={saving} className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white disabled:opacity-60" style={{ background: colors.accent }}>
                                        {saving ? <Spinner size={11} /> : 'Salvar'}
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <div className="h-2 rounded-full overflow-hidden" style={{ background: `${colors.border}30` }}>
                                    <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
