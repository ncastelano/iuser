// src/components/ServiceRequestVisitors.tsx
//
// "Visitantes dos serviços": quem viu um pedido de serviço — mesma ideia do
// Visitantes do Perfil (online, hoje, visitas, únicos, gráfico por dia e lista
// dos mais recentes), só que por card de pedido. Só o dono do pedido consegue
// ler a tabela (RLS), então este componente só faz sentido no diálogo dele.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Eye, Calendar, TrendingUp, User, Smartphone, Monitor, Tablet, BarChart3, ExternalLink, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { format, formatDistanceToNow, subDays, startOfDay, startOfMonth, eachDayOfInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'
import PlanAvatarRing from '@/components/PlanAvatarRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type Period = 'today' | '7days' | '30days'
type Group = 'online' | 'today' | 'month' | 'unique'

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
    const [openGroup, setOpenGroup] = useState<Group | null>(null)

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
    const monthStart = startOfMonth(new Date()).getTime()
    const monthVisits = visits.filter((v) => new Date(v.created_at).getTime() >= monthStart)
    const onlineVisits = visits.filter((v) => new Date(v.created_at).getTime() >= oneMinAgo)
    const onlineNow = unique(onlineVisits)

    // Quem entra em cada lista: uma linha por PESSOA, com quantas vezes viu e quando foi a última
    const groupVisits: Record<Group, Visit[]> = { online: onlineVisits, today: todayVisits, month: monthVisits, unique: visits }
    const groupTitles: Record<Group, string> = { online: 'Online agora', today: 'Visitaram hoje', month: 'Visitaram este mês', unique: 'Todos os visitantes (únicos)' }

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

    const metric = (icon: React.ReactNode, label: string, value: number, group: Group) => (
        <button
            type="button"
            onClick={() => setOpenGroup(group)}
            title="Ver quem é"
            className="p-3 rounded-2xl border text-left transition-transform hover:scale-[1.03] active:scale-95 cursor-pointer"
            style={{ borderColor: colors.border, background: `${colors.border}20` }}
        >
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: colors.textSecondary }}>{icon}<span>{label}</span></div>
            <p className="text-xl font-black" style={{ color: colors.textPrimary }}>{value}</p>
        </button>
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
                {metric(<Eye size={13} />, 'Online', onlineNow, 'online')}
                {metric(<Calendar size={13} />, 'Hoje', unique(todayVisits), 'today')}
                {metric(<TrendingUp size={13} />, 'Este mês', monthVisits.length, 'month')}
                {metric(<Users size={13} />, 'Únicos', unique(visits), 'unique')}
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
                                <PlanAvatarRing userId={v.viewer_id}>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: anonymous ? '#ef444430' : '#f9731630' }}>
                                    {anonymous ? (
                                        <User size={16} style={{ color: '#ef4444' }} />
                                    ) : viewer?.avatarUrl ? (
                                        <img src={viewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-bold text-sm" style={{ color: '#f97316' }}>{viewer?.name?.charAt(0) || '?'}</span>
                                    )}
                                </div>
                                </PlanAvatarRing>
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

            {openGroup && createPortal(
                <GroupDialog
                    title={groupTitles[openGroup]}
                    visits={groupVisits[openGroup]}
                    viewers={viewers}
                    colors={colors}
                    onClose={() => setOpenGroup(null)}
                    onOpenProfile={(slug) => { setOpenGroup(null); router.push(`/${slug}`) }}
                    deviceIcon={deviceIcon}
                />,
                document.body,
            )}
        </div>
    )
}

// Lista de PESSOAS (não de visitas) de um dos números: quem está online, quem veio hoje/neste mês, todos os únicos
function GroupDialog({ title, visits, viewers, colors, onClose, onOpenProfile, deviceIcon }: {
    title: string
    visits: Visit[]
    viewers: Map<string, Viewer>
    colors: any
    onClose: () => void
    onOpenProfile: (slug: string) => void
    deviceIcon: (t: string | null) => React.ReactNode
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // visits vem do mais recente pro mais antigo: a 1ª vez que a pessoa aparece é a última visita dela
    const people = new Map<string, { visit: Visit; count: number }>()
    for (const v of visits) {
        const key = v.viewer_id || v.anonymous_id || v.id
        const cur = people.get(key)
        if (cur) cur.count += 1
        else people.set(key, { visit: v, count: 1 })
    }
    const list = Array.from(people.values())

    return (
        <div onClick={onClose} role="dialog" aria-modal="true" className="fixed inset-0 z-[1100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-3xl flex flex-col overflow-hidden"
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow, maxHeight: '80vh' }}
            >
                <div className="p-5 pb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{list.length} {list.length === 1 ? 'pessoa' : 'pessoas'}</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}66`, color: colors.textSecondary }}>
                        <X size={16} />
                    </button>
                </div>
                <div className="overflow-y-auto px-3 pb-4 flex-1">
                    {list.length === 0 ? (
                        <p className="text-sm text-center py-8" style={{ color: colors.textSecondary }}>Ninguém por aqui ainda.</p>
                    ) : (
                        <div className="space-y-1">
                            {list.map(({ visit: v, count }) => {
                                const viewer = v.viewer_id ? viewers.get(v.viewer_id) : null
                                const anonymous = !v.viewer_id
                                const slug = viewer?.profileSlug || null
                                const name = anonymous ? 'Visitante anônimo' : viewer?.name || (slug ? `@${slug}` : 'Usuário')
                                const row = (
                                    <>
                                        <PlanAvatarRing userId={v.viewer_id}>
                                            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: anonymous ? '#ef444430' : '#f9731630' }}>
                                                {anonymous ? <User size={18} style={{ color: '#ef4444' }} />
                                                    : viewer?.avatarUrl ? <img src={viewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                        : <span className="font-bold text-sm" style={{ color: '#f97316' }}>{viewer?.name?.charAt(0) || '?'}</span>}
                                            </div>
                                        </PlanAvatarRing>
                                        <div className="min-w-0 flex-1 text-left">
                                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{name}</p>
                                            <p className="text-[11px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                                                {count} {count === 1 ? 'visita' : 'visitas'} · {formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}
                                                <span className="flex items-center gap-1">{deviceIcon(v.device_type)}</span>
                                            </p>
                                        </div>
                                        {slug && <span className="text-[11px] font-black flex-shrink-0" style={{ color: colors.accent }}>Ver perfil</span>}
                                    </>
                                )
                                return slug ? (
                                    <button key={v.viewer_id || v.id} onClick={() => onOpenProfile(slug)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-black/5">{row}</button>
                                ) : (
                                    <div key={v.anonymous_id || v.id} className="w-full flex items-center gap-3 p-2.5 rounded-2xl opacity-80">{row}</div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
