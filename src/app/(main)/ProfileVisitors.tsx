// src/components/ProfileVisitors.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
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
} from 'lucide-react'
import { format, formatDistanceToNow, subDays, startOfDay, eachDayOfInterval } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

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

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
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
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    const maxCount = Math.max(...dailyData.map(d => d.count), 1)

    if (!profileId) return null

    return (
        <div className="mb-6 mt-4">
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
                {/* Cabeçalho com ícone arredondado */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                        }}
                    >
                        <Users size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                            Visitantes do Perfil
                        </h3>
                        <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: textSecondary }}>
                            <span>
                                <span className="font-bold" style={{ color: '#f97316' }}>
                                    {totalUnique}
                                </span>{' '}
                                únicos
                            </span>
                            <span>•</span>
                            <span>
                                <span className="font-bold" style={{ color: '#10b981' }}>
                                    {todayVisitors}
                                </span>{' '}
                                hoje
                            </span>
                            <span>•</span>
                            <span>
                                <span className="font-bold" style={{ color: '#f59e0b' }}>
                                    {onlineNow}
                                </span>{' '}
                                online
                            </span>
                        </div>
                    </div>
                </div>

                {/* Métricas principais - PILL */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-full border" style={{ borderColor: colors.border, background: cardStyle.background }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                            <Eye size={14} />
                            <span>Online</span>
                        </div>
                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{onlineNow}</p>
                    </div>
                    <div className="p-3 rounded-full border" style={{ borderColor: colors.border, background: cardStyle.background }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                            <Calendar size={14} />
                            <span>Hoje</span>
                        </div>
                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{todayVisitors}</p>
                    </div>
                    <div className="p-3 rounded-full border" style={{ borderColor: colors.border, background: cardStyle.background }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                            <TrendingUp size={14} />
                            <span>Visitas</span>
                        </div>
                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{totalVisits}</p>
                    </div>
                    <div className="p-3 rounded-full border" style={{ borderColor: colors.border, background: cardStyle.background }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                            <Users size={14} />
                            <span>Únicos</span>
                        </div>
                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{totalUnique}</p>
                    </div>
                </div>

                {/* Gráfico */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: textPrimary }}>
                            <BarChart3 size={16} style={{ color: '#f97316' }} />
                            Visitas por dia
                        </div>
                        <div className="flex gap-1">
                            {(['today', '7days', '30days'] as Period[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    style={{
                                        ...pillButtonStyle,
                                        background: period === p ? GRADIENT : 'transparent',
                                        color: period === p ? '#ffffff' : textSecondary,
                                        border: `1px solid ${period === p ? 'transparent' : colors.border}`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    {p === 'today' ? 'Hoje' : p === '7days' ? '7 dias' : '30 dias'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-end gap-1 h-20">
                        {dailyData.map((item, idx) => {
                            const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center">
                                    <div
                                        className="w-full rounded-t transition-all duration-300"
                                        style={{
                                            height: `${Math.max(height, 2)}%`,
                                            background: item.count > 0 ? GRADIENT : `${'#f97316'}30`,
                                            minHeight: item.count > 0 ? '8px' : '4px',
                                        }}
                                    />
                                    <span className="text-[8px] mt-0.5" style={{ color: textSecondary }}>
                                        {item.date}
                                    </span>
                                    {item.count > 0 && (
                                        <span className="text-[8px] font-bold" style={{ color: '#f97316' }}>
                                            {item.count}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Lista de visitantes */}
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    </div>
                ) : visitors.length === 0 ? (
                    <div
                        className="rounded-2xl p-6 text-center"
                        style={{
                            background: cardStyle.background,
                            border: `1px dashed ${colors.border}`,
                        }}
                    >
                        <p className="text-sm" style={{ color: textSecondary }}>
                            Nenhum visitante registrado ainda.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                        {visitors.map((visit) => {
                            const isAnonymous = visit.isAnonymous
                            const profile = visit.profile
                            const deviceIcon = getDeviceIcon(visit.device_type)
                            const avatarUrl = getAvatarUrl(profile?.avatar_url)
                            const timeAgo = formatDistanceToNow(new Date(visit.created_at), {
                                addSuffix: true,
                                locale: ptBRLocale,
                            })
                            const fullDate = format(new Date(visit.created_at), 'dd/MM/yyyy HH:mm', {
                                locale: ptBRLocale,
                            })

                            return (
                                <div
                                    key={visit.id}
                                    onClick={() => handleVisitorClick(visit)}
                                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all hover:shadow-md ${!isAnonymous && profile?.profileSlug ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
                                    style={{ background: cardStyle.background, borderColor: colors.border }}
                                >
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: isAnonymous ? '#ef444430' : '#f9731630',
                                        }}
                                    >
                                        {isAnonymous ? (
                                            <User size={16} style={{ color: '#ef4444' }} />
                                        ) : avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt=""
                                                className="w-full h-full rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="font-bold text-sm" style={{ color: '#f97316' }}>
                                                {profile?.name?.charAt(0) || '?'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm truncate" style={{ color: textPrimary }}>
                                                {isAnonymous ? 'Visitante anônimo' : profile?.name || 'Usuário'}
                                            </span>
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                                style={{
                                                    background: isAnonymous ? '#ef444420' : '#10b98120',
                                                    color: isAnonymous ? '#ef4444' : '#10b981',
                                                }}
                                            >
                                                {isAnonymous ? 'Anônimo' : 'Logado'}
                                            </span>
                                            {!isAnonymous && profile?.profileSlug && (
                                                <ExternalLink size={10} style={{ color: textSecondary }} />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: textSecondary }}>
                                            <span>{fullDate}</span>
                                            <span>•</span>
                                            <span>{timeAgo}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                {deviceIcon}
                                                {visit.device_type || 'desktop'}
                                            </span>
                                        </div>
                                        {visit.referrer && (
                                            <div className="text-[10px] truncate mt-0.5 opacity-60" style={{ color: textSecondary }}>
                                                Origem: {visit.referrer}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {totalCount > 50 && (
                            <p className="text-center text-xs mt-2" style={{ color: textSecondary }}>
                                Mostrando os 50 mais recentes de {totalCount} visitantes
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}