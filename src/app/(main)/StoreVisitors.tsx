// src/components/StoreVisitors.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import {
    ChevronDown, ChevronUp, Users, Eye, RefreshCw,
    User, Smartphone, Monitor, Tablet, Calendar,
    BarChart3, TrendingUp, Clock
} from 'lucide-react'
import { format, formatDistanceToNow, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// ===== COMPONENTE =====
interface StoreVisitorsProps {
    storeId: string
}

type Period = 'today' | '7days' | '30days'

export default function StoreVisitors({ storeId }: StoreVisitorsProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [isExpanded, setIsExpanded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState<Period>('7days')

    // Métricas principais
    const [onlineNow, setOnlineNow] = useState(0)
    const [todayVisitors, setTodayVisitors] = useState(0)
    const [totalVisits, setTotalVisits] = useState(0)      // contagem de eventos
    const [totalUnique, setTotalUnique] = useState(0)      // visitantes únicos

    // Dados do gráfico (visitas por dia)
    const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([])

    // Lista de visitantes (últimos 50)
    const [visitors, setVisitors] = useState<any[]>([])
    const [totalCount, setTotalCount] = useState(0)

    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const channelRef = useRef<any>(null)

    // ---------- Buscar dados (somente leitura) ----------
    const fetchVisitorData = useCallback(async () => {
        if (!storeId) return
        try {
            //console.log('[StoreVisitors] Buscando dados...')
            const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
            const todayStart = startOfDay(new Date()).toISOString()

            // --- Métricas rápidas ---
            // Online (último minuto)
            const { data: onlineData } = await supabase
                .from('store_visits')
                .select('viewer_id, anonymous_id')
                .eq('store_id', storeId)
                .gte('created_at', oneMinAgo)
            const onlineSet = new Set(onlineData?.map(v => v.viewer_id || v.anonymous_id))
            setOnlineNow(onlineSet.size)

            // Hoje – visitantes únicos
            const { data: todayData } = await supabase
                .from('store_visits')
                .select('viewer_id, anonymous_id')
                .eq('store_id', storeId)
                .gte('created_at', todayStart)
            const todaySet = new Set(todayData?.map(v => v.viewer_id || v.anonymous_id))
            setTodayVisitors(todaySet.size)

            // Totais gerais
            const { data: allData } = await supabase
                .from('store_visits')
                .select('viewer_id, anonymous_id')
                .eq('store_id', storeId)
            setTotalVisits(allData?.length || 0)
            const uniqueSet = new Set(allData?.map(v => v.viewer_id || v.anonymous_id))
            setTotalUnique(uniqueSet.size)

            // --- Dados para o gráfico (últimos 7 dias por padrão) ---
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
                .from('store_visits')
                .select('created_at')
                .eq('store_id', storeId)
                .gte('created_at', startISO)
                .lte('created_at', endISO)

            // Agrupar por dia
            const dayMap = new Map<string, number>()
            dailyVisits?.forEach(v => {
                const day = format(new Date(v.created_at), 'yyyy-MM-dd')
                dayMap.set(day, (dayMap.get(day) || 0) + 1)
            })

            // Preencher todos os dias do intervalo
            const dateRange = eachDayOfInterval({ start: startDate, end: endDate })
            const chartData = dateRange.map(date => {
                const key = format(date, 'yyyy-MM-dd')
                return {
                    date: format(date, 'dd/MM'),
                    count: dayMap.get(key) || 0,
                }
            })
            setDailyData(chartData)

            // --- Lista dos últimos visitantes (com detalhes) ---
            const { data: visits, count } = await supabase
                .from('store_visits')
                .select('*', { count: 'exact' })
                .eq('store_id', storeId)
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
            }

        } catch (error) {
            console.warn('[StoreVisitors] Erro ao buscar dados:', error)
        } finally {
            setLoading(false)
        }
    }, [storeId, period])

    // ---------- Efeito principal ----------
    useEffect(() => {
        if (!storeId) return
        let cancelled = false

        const load = async () => {
            if (!cancelled) {
                await fetchVisitorData()
            }
        }
        load()

        // Atualizar a cada 5 segundos (antes era 30s)
        intervalRef.current = setInterval(() => {
            if (!cancelled) {
                fetchVisitorData()
            }
        }, 5000)

        // Realtime: atualizar quando houver novas visitas (ouvir inserções na store_visits)
        const channel = supabase
            .channel(`visitors-${storeId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'store_visits',
                    filter: `store_id=eq.${storeId}`,
                },
                () => {
                    if (!cancelled) {
                        fetchVisitorData()
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    //console.log('[StoreVisitors] Canal Realtime inscrito com sucesso')
                }
            })

        channelRef.current = channel

        return () => {
            cancelled = true
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId, period])

    // ---------- Renderização ----------
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const accentLight = colors.accentLight || `${accentColor}30`

    const getDeviceIcon = (type: string | null) => {
        if (type === 'mobile') return <Smartphone size={14} />
        if (type === 'tablet') return <Tablet size={14} />
        return <Monitor size={14} />
    }

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    const maxCount = Math.max(...dailyData.map(d => d.count), 1)

    return (
        <div className="mb-6">
            <div
                className="rounded-2xl border"
                style={{
                    background: colors.surface,
                    borderColor: colors.border,
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between p-4 text-left"
                >
                    <span className="text-lg font-black flex items-center gap-2" style={{ color: textPrimary }}>
                        <Users size={20} style={{ color: accentColor }} />
                        Visitantes
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: accentLight, color: accentColor }}>
                            {totalUnique}
                        </span>
                    </span>
                    <div className="flex items-center gap-2">
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <div className="px-4 pb-6">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border }}>
                                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                                            <Eye size={14} />
                                            <span>Online</span>
                                        </div>
                                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{onlineNow}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border }}>
                                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                                            <Calendar size={14} />
                                            <span>Hoje</span>
                                        </div>
                                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{todayVisitors}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border }}>
                                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                                            <TrendingUp size={14} />
                                            <span>Visitas</span>
                                        </div>
                                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{totalVisits}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border }}>
                                        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
                                            <Users size={14} />
                                            <span>Únicos</span>
                                        </div>
                                        <p className="text-2xl font-black" style={{ color: textPrimary }}>{totalUnique}</p>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: textPrimary }}>
                                            <BarChart3 size={16} style={{ color: accentColor }} />
                                            Visitas por dia
                                        </div>
                                        <div className="flex gap-1">
                                            {(['today', '7days', '30days'] as Period[]).map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setPeriod(p)}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${period === p ? 'text-white' : ''}`}
                                                    style={{
                                                        background: period === p ? accentColor : 'transparent',
                                                        color: period === p ? '#fff' : textSecondary,
                                                        border: `1px solid ${period === p ? accentColor : colors.border}`,
                                                    }}
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
                                                            background: item.count > 0 ? accentColor : `${accentColor}30`,
                                                            minHeight: item.count > 0 ? '8px' : '4px',
                                                        }}
                                                    />
                                                    <span className="text-[8px] mt-0.5" style={{ color: textSecondary }}>
                                                        {item.date}
                                                    </span>
                                                    {item.count > 0 && (
                                                        <span className="text-[8px] font-bold" style={{ color: accentColor }}>
                                                            {item.count}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {visitors.length === 0 ? (
                                    <div className="py-8 text-center" style={{ color: textSecondary }}>
                                        <p>Nenhum visitante registrado ainda.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                                        {visitors.map((visit) => {
                                            const isAnonymous = visit.isAnonymous
                                            const profile = visit.profile
                                            const deviceIcon = getDeviceIcon(visit.device_type)
                                            const timeAgo = formatDistanceToNow(new Date(visit.created_at), {
                                                addSuffix: true,
                                                locale: ptBRLocale,
                                            })
                                            const fullDate = format(new Date(visit.created_at), "dd/MM/yyyy HH:mm", {
                                                locale: ptBRLocale,
                                            })

                                            return (
                                                <div
                                                    key={visit.id}
                                                    className="flex items-center gap-3 p-3 rounded-xl border"
                                                    style={{
                                                        background: cardStyle.background,
                                                        borderColor: colors.border,
                                                    }}
                                                >
                                                    <div
                                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                                        style={{
                                                            background: isAnonymous
                                                                ? '#ef444430'
                                                                : `${accentColor}30`,
                                                        }}
                                                    >
                                                        {isAnonymous ? (
                                                            <User size={16} style={{ color: '#ef4444' }} />
                                                        ) : profile?.avatar_url ? (
                                                            <img
                                                                src={profile.avatar_url}
                                                                alt=""
                                                                className="w-full h-full rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-sm" style={{ color: accentColor }}>
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
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}