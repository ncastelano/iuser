// components/AdminDashboard/ActivitySection.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { hexToRgb } from '@/lib/color'
import { callAdminApi } from '@/lib/callAdminApi'
import { Eye, Calendar, TrendingUp, Users, UserCheck, UserX, BarChart3 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import type { ThemeColors } from '@/app/contexts/theme'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ActivitySectionProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface ActivityVisit {
    id: string
    path: string
    user_id: string | null
    anonymous_id: string
    referrer: string | null
    created_at: string
    profile: { name: string | null; profileSlug: string | null } | null
}

interface ActivitySummary {
    onlineNow: number
    last24hUnique: number
    last7dUnique: number
    last30dUnique: number
    registeredUnique: number
    anonymousUnique: number
    totalVisits30d: number
    topPaths: { path: string; count: number }[]
    daily: { date: string; count: number }[]
    recent: ActivityVisit[]
}

// Aba "Atividade" do admin geral: todo mundo que passa pelo iUser, logado
// ou não, começando pela home — alimentada por site_visits (ver
// PageViewTracker.tsx, que grava uma linha a cada troca de página).
export default function ActivitySection({ cardStyle, colors }: ActivitySectionProps) {
    const surfaceRgb = hexToRgb(colors.surface)
    const [summary, setSummary] = useState<ActivitySummary | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<ActivitySummary>('/api/admin/activity/summary')
            setSummary(res)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar atividade')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
        const interval = setInterval(load, 30000)
        return () => clearInterval(interval)
    }, [load])

    if (loading && !summary) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    if (!summary) return null

    const registeredPct = summary.registeredUnique + summary.anonymousUnique > 0
        ? Math.round((summary.registeredUnique / (summary.registeredUnique + summary.anonymousUnique)) * 100)
        : 0

    const maxDaily = Math.max(...summary.daily.map((d) => d.count), 1)
    const maxPath = Math.max(...summary.topPaths.map((p) => p.count), 1)

    const pillCard = (icon: React.ReactNode, label: string, value: number, color: string) => (
        <div className="p-3 rounded-full border" style={{ borderColor: colors.border, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
        </div>
    )

    return (
        <div className="space-y-5">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Atividade no iUser</h3>
                        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                            Todo mundo que entra no site, cadastrado ou não — últimos 30 dias
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {pillCard(<Eye size={14} />, 'Online', summary.onlineNow, colors.textPrimary)}
                    {pillCard(<Calendar size={14} />, 'Últimas 24h', summary.last24hUnique, colors.textPrimary)}
                    {pillCard(<TrendingUp size={14} />, '7 dias', summary.last7dUnique, colors.textPrimary)}
                    {pillCard(<Users size={14} />, '30 dias', summary.last30dUnique, colors.textPrimary)}
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        <span>Cadastrados x anônimos (30 dias)</span>
                        <span>{registeredPct}% cadastrados</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: `${colors.border}30` }}>
                        <div style={{ width: `${registeredPct}%`, background: GRADIENT }} />
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: colors.textSecondary }}>
                        <span className="flex items-center gap-1"><UserCheck size={13} style={{ color: '#22c55e' }} /> {summary.registeredUnique} cadastrados</span>
                        <span className="flex items-center gap-1"><UserX size={13} style={{ color: '#ef4444' }} /> {summary.anonymousUnique} anônimos</span>
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>
                        <BarChart3 size={16} style={{ color: '#f97316' }} />
                        Visitas por dia
                    </div>
                    <div className="flex items-end gap-1 h-20">
                        {summary.daily.map((item) => {
                            const height = maxDaily > 0 ? (item.count / maxDaily) * 100 : 0
                            return (
                                <div key={item.date} className="flex-1 flex flex-col items-center">
                                    <div
                                        className="w-full rounded-t transition-all duration-300"
                                        style={{
                                            height: `${Math.max(height, 2)}%`,
                                            background: item.count > 0 ? GRADIENT : `${'#f97316'}30`,
                                            minHeight: item.count > 0 ? '8px' : '4px',
                                        }}
                                    />
                                    <span className="text-[8px] mt-0.5" style={{ color: colors.textSecondary }}>
                                        {item.date.slice(5).split('-').reverse().join('/')}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            <div style={cardStyle} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Páginas mais visitadas
                </p>
                {summary.topPaths.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Sem dados ainda.</p>
                ) : summary.topPaths.map((p) => (
                    <div key={p.path} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="truncate font-bold" style={{ color: colors.textPrimary }}>{p.path}</span>
                            <span style={{ color: colors.textSecondary }}>{p.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${colors.border}30` }}>
                            <div style={{ width: `${(p.count / maxPath) * 100}%`, background: GRADIENT, height: '100%' }} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Últimas visitas ({summary.recent.length})
                </p>
                {summary.recent.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>Nenhuma visita registrada ainda.</div>
                ) : summary.recent.map((visit) => {
                    const isAnonymous = !visit.user_id
                    return (
                        <div key={visit.id} style={cardStyle} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {isAnonymous ? 'Visitante anônimo' : visit.profile?.name || (visit.profile?.profileSlug ? `@${visit.profile.profileSlug}` : 'Usuário')}
                                    </span>
                                    <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                                        style={{ background: isAnonymous ? '#ef444420' : '#10b98120', color: isAnonymous ? '#ef4444' : '#10b981' }}
                                    >
                                        {isAnonymous ? 'Anônimo' : 'Cadastrado'}
                                    </span>
                                </div>
                                <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
                                    {visit.path} · {formatDistanceToNow(new Date(visit.created_at), { addSuffix: true, locale: ptBRLocale })}
                                </p>
                                {visit.referrer && (
                                    <p className="text-[10px] truncate opacity-60" style={{ color: colors.textSecondary }}>
                                        Origem: {visit.referrer}
                                    </p>
                                )}
                            </div>
                            <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                {format(new Date(visit.created_at), 'dd/MM HH:mm')}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
