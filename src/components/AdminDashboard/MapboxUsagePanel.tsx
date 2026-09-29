// components/AdminDashboard/MapboxUsagePanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Map, RefreshCw, Pencil, Activity } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { ExpenseForm, type ExpenseRow } from './ExpenseForm'

interface MapboxUsagePanelProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface TelemetryDay {
    day: string
    directions: number
    optimization: number
}

interface MapboxStats {
    expense: ExpenseRow | null
    days: TelemetryDay[]
    totalDirections: number
    totalOptimization: number
}

function money(v: number | null | undefined): string {
    return `R$ ${Number(v || 0).toFixed(2)}`
}

// Painel "Mapbox" dentro da aba Financeiro: custo (a mesma linha de
// service_expenses de sempre) + o único uso que dá pra rastrear sozinho —
// chamadas de rota (Directions/Optimization, ver src/lib/mapboxRoute.ts).
// Geocoding (busca de endereço) e carregamento de mapa (tiles) não têm
// wrapper central no código, então não entram aqui — o Mapbox não expõe
// nada disso por API pública pra completar a lacuna.
export default function MapboxUsagePanel({ cardStyle, colors }: MapboxUsagePanelProps) {
    const [stats, setStats] = useState<MapboxStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCost, setEditingCost] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<MapboxStats>('/api/admin/expenses/mapbox-stats')
            setStats(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar dados do Mapbox')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    if (loading && !stats) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }
    if (!stats) return null

    const expense = stats.expense
    const maxDirections = Math.max(...stats.days.map((d) => d.directions), 1)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                    <Map size={13} />
                    Mapbox
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

            {expense && !editingCost && (
                <div style={cardStyle} className="flex items-center justify-between gap-3">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {expense.notes || 'Mapas, rotas e geocoding'}
                        {' — '}
                        <strong style={{ color: colors.textPrimary }}>
                            {expense.billing_cycle === 'usage' ? 'variável (por uso)' : money(expense.monthly_cost)}
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

            {editingCost && expense && (
                <ExpenseForm
                    colors={colors}
                    cardStyle={cardStyle}
                    initial={expense}
                    onCancel={() => setEditingCost(false)}
                    onSaved={() => { setEditingCost(false); load() }}
                />
            )}

            <div style={cardStyle}>
                <p className="text-sm" style={{ color: colors.textPrimary }}>
                    Usado pra: mapa ao vivo (pedir motorista, radar, escolher local), rotas e navegação por voz
                    (Directions/Optimization API), geocoding de endereço e imagem estática de mapa. O token
                    (<code>NEXT_PUBLIC_MAPBOX_TOKEN</code>) é público, exposto no navegador — normal pro Mapbox,
                    a segurança deles é por restrição de domínio, não por esconder o token.
                </p>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <Activity size={12} /> Chamadas de rota (auto, últimos 30 dias)
                </p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                    Só conta Directions/Optimization (rota e navegação) — não inclui mapa/geocoding, que não tem
                    como rastrear sem um ponto central no código pra isso.
                </p>
                <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                        Directions: {stats.totalDirections.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                        Optimization: {stats.totalOptimization.toLocaleString('pt-BR')}
                    </span>
                </div>
                {stats.days.length > 0 && (
                    <div className="flex items-end gap-0.5 h-14">
                        {stats.days.map((d) => {
                            const height = (d.directions / maxDirections) * 100
                            return (
                                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.directions} directions, ${d.optimization} optimization`}>
                                    <div
                                        className="w-full rounded-t"
                                        style={{ height: `${Math.max(height, 3)}%`, background: colors.accent, minHeight: 2, opacity: d.directions > 0 ? 1 : 0.2 }}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
