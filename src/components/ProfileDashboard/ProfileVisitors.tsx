// src/components/ProfileVisitors.tsx
'use client'

import { profileLabel } from '@/lib/profileDisplay'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import {
    Users,
    Eye,
    Calendar,
    TrendingUp,
    User,
    Smartphone,
    Monitor,
    Tablet,
    BarChart3,
    ExternalLink,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'
import { format, formatDistanceToNow, subDays, startOfDay, eachDayOfInterval } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import PlanAvatarRing from '@/components/PlanAvatarRing'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.625rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

interface ProfileVisitorsProps {
    profileId: string
    onLatestUpdate?: (iso: string) => void
}

type Period = 'today' | '7days' | '30days'

export default function ProfileVisitors({ profileId, onLatestUpdate }: ProfileVisitorsProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()

    const [isExpanded, setIsExpanded] = usePersistedExpanded('profileVisitors', true)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState<Period>('7days')

    const [onlineNow, setOnlineNow] = useState(0)
    const [todayVisitors, setTodayVisitors] = useState(0)
    const [totalVisits, setTotalVisits] = useState(0)
    const [totalUnique, setTotalUnique] = useState(0)

    const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([])

    const [visitors, setVisitors] = useState<any[]>([])
    const [totalCount, setTotalCount] = useState(0)

    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const channelRef = useRef<any>(null)

    const fetchVisitorData = useCallback(async () => {
        if (!profileId) return
        try {
            const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
            const todayStart = startOfDay(new Date()).toISOString()

            // Online (último minuto)
            const { data: onlineData } = await supabase
                .from('profile_visits')
                .select('viewer_id, anonymous_id')
                .eq('profile_id', profileId)
                .gte('created_at', oneMinAgo)
            const onlineSet = new Set(onlineData?.map(v => v.viewer_id || v.anonymous_id))
            setOnlineNow(onlineSet.size)

            // Hoje – visitantes únicos
            const { data: todayData } = await supabase
                .from('profile_visits')
                .select('viewer_id, anonymous_id')
                .eq('profile_id', profileId)
                .gte('created_at', todayStart)
            const todaySet = new Set(todayData?.map(v => v.viewer_id || v.anonymous_id))
            setTodayVisitors(todaySet.size)

            // Totais gerais
            const { data: allData } = await supabase
                .from('profile_visits')
                .select('viewer_id, anonymous_id')
                .eq('profile_id', profileId)
            setTotalVisits(allData?.length || 0)
            const uniqueSet = new Set(allData?.map(v => v.viewer_id || v.anonymous_id))
            setTotalUnique(uniqueSet.size)

            // --- Dados para o gráfico ---
            const endDate = new Date()
            let startDate: Date
            switch (period) {
                case 'today':
                    startDate = startOfDay(new Date())
                    break
                case '30days':
                    startDate = subDays(endDate, 29)
                    break
                case '7days':
                default:
                    startDate = subDays(endDate, 6)
                    break
            }
            const startISO = startDate.toISOString()
            const endISO = endDate.toISOString()

            const { data: dailyVisits } = await supabase
                .from('profile_visits')
                .select('created_at')
                .eq('profile_id', profileId)
                .gte('created_at', startISO)
                .lte('created_at', endISO)

            const dayMap = new Map<string, number>()
            dailyVisits?.forEach(v => {
                const day = format(new Date(v.created_at), 'yyyy-MM-dd')
                dayMap.set(day, (dayMap.get(day) || 0) + 1)
            })

            const dateRange = eachDayOfInterval({ start: startDate, end: endDate })
            const chartData = dateRange.map(date => {
                const key = format(date, 'yyyy-MM-dd')
                return {
                    date: format(date, 'dd/MM'),
                    count: dayMap.get(key) || 0,
                }
            })
            setDailyData(chartData)

            // --- Lista dos últimos visitantes ---
            const { data: visits, count } = await supabase
                .from('profile_visits')
                .select('*', { count: 'exact' })
                .eq('profile_id', profileId)
                .order('created_at', { ascending: false })
                .limit(50)

            if (visits) {
                const userIds = visits
                    .map(v => v.viewer_id)
                    .filter(id => id !== null) as string[]
                let profileMap = new Map()
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .in('id', userIds)
                    profiles?.forEach(p => profileMap.set(p.id, p))
                }

                const enriched = visits.map(v => ({
                    ...v,
                    profile: v.viewer_id ? profileMap.get(v.viewer_id) || null : null,
                    isAnonymous: v.viewer_id === null,
                }))
                setVisitors(enriched)
                setTotalCount(count || 0)
                if (visits.length > 0) onLatestUpdate?.(visits[0].created_at)
            }
        } catch (error) {
            console.warn('[ProfileVisitors] Erro ao buscar dados:', error)
        } finally {
            setLoading(false)
        }
    }, [profileId, period, onLatestUpdate])

    useEffect(() => {
        if (!profileId) return
        let cancelled = false

        const load = async () => {
            if (!cancelled) {
                await fetchVisitorData()
            }
        }
        load()

        // Atualizar a cada 5 segundos
        intervalRef.current = setInterval(() => {
            if (!cancelled) {
                fetchVisitorData()
            }
        }, 5000)

        const channel = supabase
            .channel(`profile-visitors-${profileId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'profile_visits',
                    filter: `profile_id=eq.${profileId}`,
                },
                () => {
                    if (!cancelled) {
                        fetchVisitorData()
                    }
                }
            )
            .subscribe()

        channelRef.current = channel

        return () => {
            cancelled = true
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
            }
        }
    }, [profileId, period, fetchVisitorData])

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const accentLight = colors.accentLight || `${accentColor}30`

    const getDeviceIcon = (type: string | null) => {
        if (type === 'mobile') return <Smartphone size={14} />
        if (type === 'tablet') return <Tablet size={14} />
        return <Monitor size={14} />
    }

    const getAvatarUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const handleVisitorClick = (visitor: any) => {
        if (visitor.profile?.profileSlug) {
            router.push(`/${visitor.profile.profileSlug}`)
        }
    }

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
        border: `1px solid ${colors.border}`,
    }

    const maxCount = Math.max(...dailyData.map(d => d.count), 1)

    // ----- Dados prontos pra desenhar -----
    const hostOf = (ref: string | null) => {
        if (!ref) return null
        try { return new URL(ref).host.replace(/^www\./, '') } catch { return ref.slice(0, 30) }
    }
    const nameOf = (v: any) => (v.isAnonymous ? 'Visitante anônimo' : profileLabel(v.profile))
    const when = (v: any) => formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBRLocale }).replace('cerca de ', '')

    // Os 5 últimos visitantes DIFERENTES (pra pilha de fotos e a prévia)
    const recentDistinct = (() => {
        const seen = new Set<string>()
        const out: any[] = []
        for (const v of visitors) {
            const key = v.viewer_id || v.anonymous_id || v.id
            if (seen.has(key)) continue
            seen.add(key)
            out.push(v)
            if (out.length >= 5) break
        }
        return out
    })()
    const extraDistinct = Math.max(0, totalUnique - recentDistinct.length)

    // Foto (ou o anônimo). `size` em px.
    const Face = ({ v, size = 36 }: { v: any; size?: number }) => {
        const profile = v.profile
        const url = v.isAnonymous ? null : getAvatarUrl(profile?.avatar_url)
        const letter = ((profile?.profileSlug || profile?.name) || '?').charAt(0).toUpperCase()
        const inner = (
            <span
                className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 font-black"
                style={{
                    width: size, height: size, fontSize: size * 0.4,
                    background: v.isAnonymous ? '#64748b26' : url ? `${colors.border}55` : GRADIENT,
                    color: v.isAnonymous ? '#64748b' : '#fff',
                }}
            >
                {v.isAnonymous ? <User size={size * 0.5} /> : url ? <img src={url} alt="" className="w-full h-full object-cover" /> : letter}
            </span>
        )
        return v.isAnonymous ? inner : <PlanAvatarRing userId={profile?.id} linkToProfile={false}>{inner}</PlanAvatarRing>
    }

    // Linha compacta de um visitante (a mesma na prévia e na lista aberta)
    const Row = ({ v, detailed = false }: { v: any; detailed?: boolean }) => {
        const linkable = !v.isAnonymous && v.profile?.profileSlug
        const host = hostOf(v.referrer)
        return (
            <div
                onClick={() => handleVisitorClick(v)}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors ${linkable ? 'cursor-pointer hover:bg-black/5' : ''}`}
            >
                <Face v={v} size={detailed ? 40 : 34} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-black truncate" style={{ color: textPrimary }}>{nameOf(v)}</span>
                        <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-black flex-shrink-0"
                            style={{ background: v.isAnonymous ? '#64748b22' : '#10b98122', color: v.isAnonymous ? '#64748b' : '#10b981' }}
                        >
                            {v.isAnonymous ? 'Anônimo' : 'Logado'}
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: textSecondary }}>
                        <span>{when(v)}</span>
                        <span className="flex items-center gap-1">· {getDeviceIcon(v.device_type)}</span>
                        {detailed && host && <span className="truncate">· via {host}</span>}
                    </span>
                    {detailed && (
                        <span className="block text-[10px] opacity-70" style={{ color: textSecondary }}>
                            {format(new Date(v.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBRLocale })}
                        </span>
                    )}
                </span>
                {linkable && <ExternalLink size={12} className="flex-shrink-0" style={{ color: textSecondary }} />}
            </div>
        )
    }

    // Agrupa a lista aberta por dia
    const dayLabel = (iso: string) => {
        const d = new Date(iso)
        const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000)
        if (diff <= 0) return 'Hoje'
        if (diff === 1) return 'Ontem'
        return format(d, "dd 'de' MMMM", { locale: ptBRLocale })
    }
    const groups: { label: string; rows: any[] }[] = []
    visitors.forEach((v) => {
        const label = dayLabel(v.created_at)
        const last = groups[groups.length - 1]
        if (last && last.label === label) last.rows.push(v)
        else groups.push({ label, rows: [v] })
    })

    const Stat = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
        <div className="rounded-2xl px-3 py-2 flex items-center gap-2.5 border" style={{ background: cardStyle.background, borderColor: colors.border }}>
            <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}22`, color }}>{icon}</span>
            <span className="leading-tight">
                <span className="block text-lg font-black" style={{ color: textPrimary }}>{value}</span>
                <span className="block text-[10px]" style={{ color: textSecondary }}>{label}</span>
            </span>
        </div>
    )

    if (!profileId) return null

    return (
        <div className="mb-6 mt-4">
            <div
                className="rounded-2xl relative flex flex-col p-4 gap-3"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho: título + números + seta (clicável, lembra aberto/fechado) */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <div className="min-w-0">
                        <h3 className="text-sm font-black" style={{ color: textPrimary }}>Visitantes do perfil</h3>
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] mt-0.5" style={{ color: textSecondary }}>
                            <span><b style={{ color: '#f97316' }}>{totalUnique}</b> únicos</span>
                            <span><b style={{ color: '#10b981' }}>{todayVisitors}</b> hoje</span>
                            <span className="flex items-center gap-1">
                                {onlineNow > 0 && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />}
                                <b style={{ color: '#f59e0b' }}>{onlineNow}</b> online
                            </span>
                        </div>
                    </div>
                    {isExpanded
                        ? <ChevronUp size={18} style={{ color: textSecondary }} className="flex-shrink-0" />
                        : <ChevronDown size={18} style={{ color: textSecondary }} className="flex-shrink-0" />}
                </button>

                {/* Fechado: pilha com os 5 últimos (foto ou anônimo) + as 5 linhas compactas */}
                {!isExpanded && !loading && recentDistinct.length > 0 && (
                    <>
                        <div className="flex items-center gap-2.5">
                            <span className="flex -space-x-2">
                                {recentDistinct.map((v) => (
                                    <span key={v.id} className="rounded-full" style={{ boxShadow: `0 0 0 2px ${colors.surface}` }}><Face v={v} size={30} /></span>
                                ))}
                            </span>
                            {extraDistinct > 0 && (
                                <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: `${colors.border}55`, color: textSecondary }}>+{extraDistinct}</span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            {recentDistinct.map((v) => <Row key={v.id} v={v} />)}
                        </div>
                    </>
                )}
                {!isExpanded && !loading && recentDistinct.length === 0 && (
                    <p className="text-xs" style={{ color: textSecondary }}>Ninguém visitou ainda. Quando alguém abrir o seu perfil, aparece aqui na hora.</p>
                )}

                {isExpanded && (
                <>
                {/* Números */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat icon={<Eye size={16} />} label="Online agora" value={onlineNow} color="#f59e0b" />
                    <Stat icon={<Calendar size={16} />} label="Hoje" value={todayVisitors} color="#10b981" />
                    <Stat icon={<TrendingUp size={16} />} label="Visitas" value={totalVisits} color="#f97316" />
                    <Stat icon={<Users size={16} />} label="Únicos" value={totalUnique} color="#8b5cf6" />
                </div>

                {/* Gráfico */}
                <div className="rounded-2xl p-3 border" style={{ background: cardStyle.background, borderColor: colors.border }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-black" style={{ color: textPrimary }}>
                            <BarChart3 size={14} style={{ color: '#f97316' }} />
                            Visitas por dia
                        </div>
                        <div className="flex gap-1">
                            {(['today', '7days', '30days'] as Period[]).map(pp => (
                                <button
                                    key={pp}
                                    onClick={() => setPeriod(pp)}
                                    style={{
                                        ...pillButtonStyle,
                                        background: period === pp ? GRADIENT : 'transparent',
                                        color: period === pp ? '#ffffff' : textSecondary,
                                        border: `1px solid ${period === pp ? 'transparent' : colors.border}`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    {pp === 'today' ? 'Hoje' : pp === '7days' ? '7 dias' : '30 dias'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-end gap-1 h-16">
                        {dailyData.map((item, idx) => {
                            const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                                    {item.count > 0 && <span className="text-[8px] font-black" style={{ color: '#f97316' }}>{item.count}</span>}
                                    <div
                                        className="w-full rounded-t transition-all duration-300"
                                        style={{
                                            height: `${Math.max(height, 4)}%`,
                                            background: item.count > 0 ? GRADIENT : `#f9731630`,
                                            minHeight: item.count > 0 ? '8px' : '3px',
                                        }}
                                    />
                                    {dailyData.length <= 12 && <span className="text-[8px] mt-0.5" style={{ color: textSecondary }}>{item.date}</span>}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Lista completa, por dia, com horário, aparelho e origem */}
                {loading ? (
                    <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    </div>
                ) : visitors.length === 0 ? (
                    <div className="rounded-2xl p-5 text-center" style={{ background: cardStyle.background, border: `1px dashed ${colors.border}` }}>
                        <p className="text-sm" style={{ color: textSecondary }}>Nenhum visitante registrado ainda.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                        {groups.map((g) => (
                            <div key={g.label} className="flex flex-col gap-0.5">
                                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: textSecondary }}>{g.label}</p>
                                {g.rows.map((v) => <Row key={v.id} v={v} detailed />)}
                            </div>
                        ))}
                        {totalCount > 50 && (
                            <p className="text-center text-xs" style={{ color: textSecondary }}>
                                Mostrando os 50 mais recentes de {totalCount} visitas
                            </p>
                        )}
                    </div>
                )}
                </>
                )}
            </div>
        </div>
    )
}
