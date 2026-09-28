// components/AdminDashboard/SupabaseUsagePanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Database, ExternalLink, Pencil, RefreshCw, Table2, AlertTriangle, Activity } from 'lucide-react'
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
    planName: string | null
    cycleEndsAt: string | null
}

interface RequestCounts {
    configured: boolean
    windowHours?: number
    auth?: number
    realtime?: number
    rest?: number
    storage?: number
}

interface TelemetryDay {
    day: string
    egress_bytes: number
    realtime_messages: number
}

interface TelemetrySummary {
    days: TelemetryDay[]
    totalEgressBytes: number
    totalRealtimeMessages: number
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
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

// Métricas cujo "usado" é sincronizado automaticamente a cada
// carregamento (ver supabase-stats/route.ts) — só a cota (included_value)
// continua editável à mão, porque isso depende do plano, não dá pra
// calcular. Banco/Storage/MAU vêm direto do Postgres (exatos); Egress e
// Realtime vêm da nossa telemetria própria (src/lib/usageTelemetry.ts) —
// aproximados, não batem 100% com o número que o Supabase cobra.
const AUTO_SYNCED_METRICS = new Set([
    'Armazenamento (Storage)',
    'Usuários ativos por mês (MAU)',
    'Largura de banda (Egress)',
    'Mensagens Realtime',
])
const TELEMETRY_METRICS = new Set(['Largura de banda (Egress)', 'Mensagens Realtime'])

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
    const [requests, setRequests] = useState<RequestCounts | null>(null)
    const [loadingRequests, setLoadingRequests] = useState(true)
    const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null)
    const [loadingTelemetry, setLoadingTelemetry] = useState(true)
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

    const loadRequests = useCallback(async () => {
        setLoadingRequests(true)
        try {
            const res = await callAdminApi<RequestCounts>('/api/admin/expenses/supabase-requests')
            setRequests(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar requisições')
        } finally {
            setLoadingRequests(false)
        }
    }, [])

    const loadTelemetry = useCallback(async () => {
        setLoadingTelemetry(true)
        try {
            const res = await callAdminApi<TelemetrySummary>('/api/admin/expenses/usage-telemetry')
            setTelemetry(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar telemetria própria')
        } finally {
            setLoadingTelemetry(false)
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

    useEffect(() => {
        // loadStats sincroniza Storage/MAU no banco antes de loadMetrics
        // ler a lista — se rodassem em paralelo, loadMetrics podia pegar o
        // valor antigo dessas duas métricas por uma corrida de carregamento.
        loadStats().then(loadMetrics)
        loadRequests()
        loadTelemetry()
    }, [loadStats, loadMetrics, loadRequests, loadTelemetry])

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
    const isFreePlan = (dbStats?.planName || '').toLowerCase().includes('free')
    const atRisk = metrics.filter((m) => m.included_value > 0 && (m.used_value / m.included_value) * 100 >= 80)

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

            {dbStats?.planName && (
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span style={{ color: colors.textSecondary }}>
                        Plano: <strong style={{ color: colors.textPrimary }}>{dbStats.planName}</strong>
                        {dbStats.cycleEndsAt && ` · ciclo até ${new Date(dbStats.cycleEndsAt + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    </span>
                </div>
            )}

            {isFreePlan && (
                <div className="rounded-2xl p-3" style={{ background: '#3b82f615', border: '1px solid #3b82f640' }}>
                    <p className="text-[11px]" style={{ color: colors.textPrimary }}>
                        No plano <strong>Free</strong>, passar de uma cota <strong>não gera cobrança</strong> — o Supabase
                        restringe/deixa o recurso lento até o próximo ciclo. Não é uma conta surpresa, mas pode
                        tirar o iUser do ar se passar da cota. Fique de olho nos avisos abaixo.
                    </p>
                </div>
            )}

            {atRisk.length > 0 && (
                <div className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: '#ef444415', border: '1px solid #ef444440' }}>
                    <p className="text-[11px] font-black flex items-center gap-1.5" style={{ color: '#ef4444' }}>
                        <AlertTriangle size={13} /> Perto da cota
                    </p>
                    {atRisk.map((m) => (
                        <p key={m.id} className="text-[10px]" style={{ color: colors.textPrimary }}>
                            <strong>{m.metric_name}</strong>: {m.used_value.toLocaleString('pt-BR')} / {m.included_value.toLocaleString('pt-BR')} {m.unit}
                            {' '}({Math.round((m.used_value / m.included_value) * 100)}%)
                        </p>
                    ))}
                </div>
            )}

            {/* ===== Auto: tamanho do banco ===== */}
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-[10px] uppercase font-bold" style={{ color: colors.textSecondary }}>Tamanho do banco (auto)</p>
                    <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        {loadingStats ? '...' : dbStats?.database_size_pretty || '—'}
                    </p>
                </div>
                <button
                    onClick={() => loadStats().then(loadMetrics)}
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

            {/* ===== Auto: requisições por serviço (API de administração do Supabase) ===== */}
            {!loadingRequests && requests?.configured && (
                <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                    <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                        <Activity size={11} /> Requisições por serviço (últimas {requests.windowHours}h, auto)
                    </p>
                    <p className="text-[9px] -mt-1" style={{ color: colors.textSecondary }}>
                        Contagem de chamadas de API — sinal de atividade, não é a mesma métrica de Egress/Realtime Messages do billing.
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Auth', value: requests.auth || 0 },
                            { label: 'Realtime', value: requests.realtime || 0 },
                            { label: 'REST', value: requests.rest || 0 },
                            { label: 'Storage', value: requests.storage || 0 },
                        ].map((r) => (
                            <div key={r.label} className="text-center p-2 rounded-xl" style={{ background: `${colors.border}20` }}>
                                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{r.value.toLocaleString('pt-BR')}</p>
                                <p className="text-[9px]" style={{ color: colors.textSecondary }}>{r.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {!loadingRequests && requests && !requests.configured && (
                <p className="text-[9px] pt-2 border-t" style={{ color: colors.textSecondary, borderColor: colors.border }}>
                    SUPABASE_MANAGEMENT_API_TOKEN não configurado nesse ambiente — sem contagem de requisições automática aqui.
                </p>
            )}

            {/* ===== Nossa telemetria própria: Egress + Realtime Messages ===== */}
            {!loadingTelemetry && telemetry && telemetry.days.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: colors.border }}>
                    <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: '#3b82f6' }}>
                        <Activity size={11} /> Nossa telemetria (Egress + Realtime, últimos {telemetry.days.length} dias)
                    </p>
                    <p className="text-[9px] -mt-1" style={{ color: colors.textSecondary }}>
                        Contagem própria (não é a do Supabase) — soma {formatBytes(telemetry.totalEgressBytes)} de Egress e{' '}
                        {telemetry.totalRealtimeMessages.toLocaleString('pt-BR')} mensagens Realtime no período. Já alimenta os campos "Egress" e "Mensagens Realtime" abaixo.
                    </p>
                    <div className="flex items-end gap-0.5 h-14">
                        {telemetry.days.map((d) => {
                            const maxEgress = Math.max(...telemetry.days.map((x) => x.egress_bytes), 1)
                            const height = (d.egress_bytes / maxEgress) * 100
                            return (
                                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${formatBytes(d.egress_bytes)}, ${d.realtime_messages} msgs`}>
                                    <div
                                        className="w-full rounded-t"
                                        style={{ height: `${Math.max(height, 3)}%`, background: '#3b82f6', minHeight: 2, opacity: d.egress_bytes > 0 ? 1 : 0.2 }}
                                    />
                                </div>
                            )
                        })}
                    </div>
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
                    {isFreePlan
                        ? 'No Free não tem cobrança de excedente (o preço por unidade fica zerado) — o que importa aqui é não deixar nenhuma barra chegar perto de 100%.'
                        : 'Estimativa em dólar (é como o Supabase cobra), com base no preço de overage por unidade de cada métrica — confira/ajuste contra a página de preços do Supabase se o plano mudar.'}
                </p>
                {loadingMetrics ? (
                    <div className="flex justify-center py-4"><Spinner size={18} color={colors.accent} /></div>
                ) : metrics.map((m) => {
                    const pct = m.included_value > 0 ? Math.min(100, (m.used_value / m.included_value) * 100) : 0
                    const color = usageColor(m.used_value, m.included_value)
                    const isEditing = editingId === m.id
                    const cost = overageCost(m)
                    const isAuto = AUTO_SYNCED_METRICS.has(m.metric_name)
                    const isTelemetry = TELEMETRY_METRICS.has(m.metric_name)
                    return (
                        <div key={m.id} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                                    {m.metric_name}
                                    {isAuto && (
                                        <span
                                            className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full"
                                            style={{ background: isTelemetry ? '#3b82f620' : '#22c55e20', color: isTelemetry ? '#3b82f6' : '#22c55e' }}
                                            title={isTelemetry ? 'Medido pela nossa própria telemetria — aproximado' : 'Lido direto do banco — exato'}
                                        >
                                            {isTelemetry ? 'auto ~' : 'auto'}
                                        </span>
                                    )}
                                </span>
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
                                    {isAuto ? (
                                        <span className="text-[10px] italic" style={{ color: colors.textSecondary }}>
                                            usado: {m.used_value.toLocaleString('pt-BR')} {m.unit} ({isTelemetry ? 'telemetria própria, aproximado' : 'sincronizado do banco, exato'})
                                        </span>
                                    ) : (
                                        <input type="text" inputMode="decimal" value={editUsed} onChange={(e) => setEditUsed(e.target.value)} placeholder="usado" style={{ ...inputStyle, width: 80 }} />
                                    )}
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
