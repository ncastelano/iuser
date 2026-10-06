// src/components/ServiceRequestVisitors.tsx
//
// "Visitantes dos serviços": quem viu um pedido de serviço — mesma ideia do
// Visitantes do Perfil (online, hoje, visitas, únicos, gráfico por dia e lista
// dos mais recentes), só que por card de pedido. Só o dono do pedido consegue
// ler a tabela (RLS), então este componente só faz sentido no diálogo dele.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Eye, Calendar, TrendingUp, User, Smartphone, Monitor, Tablet, BarChart3, ExternalLink } from 'lucide-react'
import { format, formatDistanceToNow, subDays, startOfDay, eachDayOfInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type Period = 'today' | '7days' | '30days'

interface Visit {
    id: string
    viewer_id: string | null
    anonymous_id: string | null
    device_type: string | null
    created_at: string
}

interface Viewer {
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

export default function ServiceRequestVisitors({ requestId }: { requestId: string }) {
    const { colors } = useTheme()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState<Period>('7days')
    const [visits, setVisits] = useState<Visit[]>([])
    const [viewers, setViewers] = useState<Map<string, Viewer>>(new Map())

    const load = useCallback(async () => {
        const { data } = await supabase
            .from('service_request_visits')
            .select('id, viewer_id, anonymous_id, device_type, created_at')
            .eq('service_request_id', requestId)
            .order('created_at', { ascending: false })
            .limit(500)
        const rows = (data || []) as Visit[]
        setVisits(rows)

        const ids = Array.from(new Set(rows.map((v) => v.viewer_id).filter(Boolean))) as string[]
        if (ids.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ids)
            setViewers(new Map((profiles || []).map((p) => [p.id, { name: p.name, profileSlug: p.profileSlug, avatarUrl: getAvatarUrl(supabase, p.avatar_url) }])))
        }
        setLoading(false)
    }, [requestId])

    useEffect(() => {
        load()
        const interval = setInterval(load, 10000)
        return () => clearInterval(interval)
    }, [load])

    const who = (v: Visit) => v.viewer_id || v.anonymous_id || v.id
    const unique = (list: Visit[]) => new Set(list.map(who)).size
    const todayStart = startOfDay(new Date()).getTime()
    const oneMinAgo = Date.now() - 60 * 1000
    const todayVisits = visits.filter((v) => new Date(v.created_at).getTime() >= todayStart)
    const onlineNow = unique(visits.filter((v) => new Date(v.created_at).getTime() >= oneMinAgo))

    const endDate = new Date()
    const startDate = period === 'today' ? startOfDay(endDate) : subDays(endDate, period === '30days' ? 29 : 6)
    const dayMap = new Map<string, number>()
    visits.forEach((v) => {
        const day = format(new Date(v.created_at), 'yyyy-MM-dd')
        dayMap.set(day, (dayMap.get(day) || 0) + 1)
    })
    const chart = eachDayOfInterval({ start: startDate, end: endDate }).map((d) => ({
        date: format(d, 'dd/MM'),
        count: dayMap.get(format(d, 'yyyy-MM-dd')) || 0,
    }))
    const maxCount = Math.max(...chart.map((c) => c.count), 1)

    const deviceIcon = (t: string | null) => (t === 'mobile' ? <Smartphone size={12} /> : t === 'tablet' ? <Tablet size={12} /> : <Monitor size={12} />)

    const metric = (icon: React.ReactNode, label: string, value: number) => (
        <div className="p-3 rounded-2xl border" style={{ borderColor: colors.border, background: `${colors.border}20` }}>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: colors.textSecondary }}>{icon}<span>{label}</span></div>
            <p className="text-xl font-black" style={{ color: colors.textPrimary }}>{value}</p>
        </div>
    )

    return (
        <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: `${colors.border}15`, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                    <Users size={20} />
                </div>
                <div>
                    <h4 className="text-base font-black" style={{ color: colors.textPrimary }}>Visitantes dos serviços</h4>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        <span className="font-bold" style={{ color: '#f97316' }}>{unique(visits)}</span> únicos ·{' '}
                        <span className="font-bold" style={{ color: '#10b981' }}>{unique(todayVisits)}</span> hoje ·{' '}
                        <span className="font-bold" style={{ color: '#f59e0b' }}>{onlineNow}</span> online
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {metric(<Eye size={13} />, 'Online', onlineNow)}
                {metric(<Calendar size={13} />, 'Hoje', unique(todayVisits))}
                {metric(<TrendingUp size={13} />, 'Visitas', visits.length)}
                {metric(<Users size={13} />, 'Únicos', unique(visits))}
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                        <BarChart3 size={14} style={{ color: '#f97316' }} />
                        Visitas por dia
                    </span>
                    <div className="flex gap-1">
                        {(['today', '7days', '30days'] as Period[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                                style={{
                                    background: period === p ? GRADIENT : 'transparent',
                                    color: period === p ? '#fff' : colors.textSecondary,
                                    border: `1px solid ${period === p ? 'transparent' : colors.border}`,
                                }}
                            >
                                {p === 'today' ? 'Hoje' : p === '7days' ? '7 dias' : '30 dias'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-end gap-1 h-16">
                    {chart.map((item, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                            <div
                                className="w-full rounded-t"
                                style={{
                                    height: `${Math.max((item.count / maxCount) * 100, 2)}%`,
                                    minHeight: item.count > 0 ? 8 : 4,
                                    background: item.count > 0 ? GRADIENT : '#f9731630',
                                }}
                            />
                            {chart.length <= 10 && <span className="text-[8px] mt-0.5" style={{ color: colors.textSecondary }}>{item.date}</span>}
                            {item.count > 0 && <span className="text-[8px] font-bold" style={{ color: '#f97316' }}>{item.count}</span>}
                        </div>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-4"><Spinner size={20} color={colors.textSecondary} /></div>
            ) : visits.length === 0 ? (
                <div className="rounded-xl p-4 text-center" style={{ border: `1px dashed ${colors.border}` }}>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Ninguém viu esse pedido ainda. Quando um profissional abrir, ele aparece aqui.
                    </p>
                </div>
            ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {visits.slice(0, 50).map((v) => {
                        const viewer = v.viewer_id ? viewers.get(v.viewer_id) : null
                        const anonymous = !v.viewer_id
                        const clickable = !!viewer?.profileSlug
                        return (
                            <div
                                key={v.id}
                                onClick={() => clickable && router.push(`/${viewer!.profileSlug}`)}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border ${clickable ? 'cursor-pointer' : ''}`}
                                style={{ borderColor: colors.border, background: `${colors.border}15` }}
                            >
                                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: anonymous ? '#ef444430' : '#f9731630' }}>
                                    {anonymous ? (
                                        <User size={16} style={{ color: '#ef4444' }} />
                                    ) : viewer?.avatarUrl ? (
                                        <img src={viewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-bold text-sm" style={{ color: '#f97316' }}>{viewer?.name?.charAt(0) || '?'}</span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm truncate" style={{ color: colors.textPrimary }}>
                                            {anonymous ? 'Visitante anônimo' : viewer?.name || (viewer?.profileSlug ? `@${viewer.profileSlug}` : 'Usuário')}
                                        </span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: anonymous ? '#ef444420' : '#10b98120', color: anonymous ? '#ef4444' : '#10b981' }}>
                                            {anonymous ? 'Anônimo' : 'Logado'}
                                        </span>
                                        {clickable && <ExternalLink size={10} style={{ color: colors.textSecondary }} />}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                                        <span>{formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">{deviceIcon(v.device_type)}{v.device_type || 'desktop'}</span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {visits.length > 50 && (
                        <p className="text-center text-[11px]" style={{ color: colors.textSecondary }}>Mostrando os 50 mais recentes de {visits.length} visitas</p>
                    )}
                </div>
            )}
        </div>
    )
}
