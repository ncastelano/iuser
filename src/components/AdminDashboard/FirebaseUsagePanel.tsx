// components/AdminDashboard/FirebaseUsagePanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Bell, RefreshCw, Pencil, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { ExpenseForm, type ExpenseRow } from './ExpenseForm'

interface FirebaseUsagePanelProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface TelemetryDay {
    day: string
    sends: number
}

interface FirebaseStats {
    expense: ExpenseRow | null
    configured: boolean
    days: TelemetryDay[]
    totalSends: number
}

function money(v: number | null | undefined): string {
    return `R$ ${Number(v || 0).toFixed(2)}`
}

// Painel "Firebase" dentro da aba Financeiro: custo + status real de
// configuração (sem FIREBASE_SERVICE_ACCOUNT_KEY, todo push nativo falha
// silencioso, ver isFirebasePushConfigured em src/lib/firebaseAdmin.ts) +
// telemetria própria de quantas notificações foram enviadas (o Firebase
// não expõe volume de envio por API pública com a service account que
// temos, só no console deles).
export default function FirebaseUsagePanel({ cardStyle, colors }: FirebaseUsagePanelProps) {
    const [stats, setStats] = useState<FirebaseStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [editingCost, setEditingCost] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<FirebaseStats>('/api/admin/expenses/firebase-stats')
            setStats(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar dados do Firebase')
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
    const maxSends = Math.max(...stats.days.map((d) => d.sends), 1)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                    <Bell size={13} />
                    Firebase
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
                        {expense.notes || 'Notificações push (mobile)'}
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

            <div style={cardStyle} className="flex items-center gap-3">
                {stats.configured ? <CheckCircle2 size={20} style={{ color: '#22c55e', flexShrink: 0 }} /> : <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />}
                <div>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                        {stats.configured ? 'Configurado' : 'Não configurado'}
                    </p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        {stats.configured
                            ? 'FIREBASE_SERVICE_ACCOUNT_KEY presente — push nativo (Android/iOS) funcionando.'
                            : 'Falta FIREBASE_SERVICE_ACCOUNT_KEY no ambiente — todo envio de push nativo falha silenciosamente (retorna 0 sem erro).'}
                    </p>
                </div>
            </div>

            <div style={cardStyle}>
                <p className="text-sm" style={{ color: colors.textPrimary }}>
                    Usado só pra push notification nativo (Android via FCM; iOS quando a chave APNs estiver
                    configurada no projeto Firebase) — não tem outro uso do Firebase no código.
                </p>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <Activity size={12} /> Notificações enviadas (auto, últimos 30 dias)
                </p>
                <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{stats.totalSends.toLocaleString('pt-BR')}</p>
                {stats.days.length > 0 && (
                    <div className="flex items-end gap-0.5 h-14">
                        {stats.days.map((d) => {
                            const height = (d.sends / maxSends) * 100
                            return (
                                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.sends} envios`}>
                                    <div
                                        className="w-full rounded-t"
                                        style={{ height: `${Math.max(height, 3)}%`, background: colors.accent, minHeight: 2, opacity: d.sends > 0 ? 1 : 0.2 }}
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
