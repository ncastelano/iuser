// src/components/ProfileDashboard/ProfileNotification.tsx
//
// "Notificações do perfil": tudo o que acontece com o perfil — seguidor novo, curtida em publicação/serviço/produto,
// comentário (na publicação, no perfil, resposta ao seu comentário), curtida no seu comentário, visita ao perfil,
// quem entrou por um link seu e quem se cadastrou pelo seu convite. Os eventos são gravados por gatilhos do banco
// (profile_notifications); aqui só se lê, se marca como lido e se escuta o Realtime.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Bell, Heart, MessageCircle, UserPlus, Eye, Link2, PartyPopper, CornerDownRight, CheckCheck, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getAvatarUrl } from '@/lib/avatar'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Spinner } from '@/components/Spinner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import DashboardSection from './DashboardSection'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Notif {
    id: string
    kind: string
    ref_id: string | null
    meta: { title?: string; snippet?: string; slug?: string; owner_slug?: string; path?: string }
    created_at: string
    read_at: string | null
    actor_id: string | null
    actor_name: string | null
    actor_slug: string | null
    actor_avatar: string | null
}

const PAGE_SIZE = 10
const PREVIEW_COUNT = 5

type Filter = 'all' | 'likes' | 'comments' | 'followers' | 'visits'

const FILTERS: { id: Filter; label: string; kinds: string[] | null }[] = [
    { id: 'all', label: 'Tudo', kinds: null },
    { id: 'likes', label: 'Curtidas', kinds: ['publication_like', 'service_like', 'product_like', 'comment_like'] },
    { id: 'comments', label: 'Comentários', kinds: ['publication_comment', 'profile_comment', 'comment_reply'] },
    { id: 'followers', label: 'Seguidores', kinds: ['follow', 'invite_signup'] },
    { id: 'visits', label: 'Visitas', kinds: ['profile_view', 'link_visit'] },
]

const KIND_ICON: Record<string, { icon: typeof Bell; color: string }> = {
    follow: { icon: UserPlus, color: '#3b82f6' },
    invite_signup: { icon: PartyPopper, color: '#f97316' },
    profile_view: { icon: Eye, color: '#64748b' },
    link_visit: { icon: Link2, color: '#14b8a6' },
    publication_like: { icon: Heart, color: '#ef4444' },
    service_like: { icon: Heart, color: '#ef4444' },
    product_like: { icon: Heart, color: '#ef4444' },
    comment_like: { icon: Heart, color: '#ef4444' },
    publication_comment: { icon: MessageCircle, color: '#8b5cf6' },
    profile_comment: { icon: MessageCircle, color: '#8b5cf6' },
    comment_reply: { icon: CornerDownRight, color: '#8b5cf6' },
}

function dayLabel(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
    if (diff <= 0) return 'Hoje'
    if (diff === 1) return 'Ontem'
    const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// "há 5 minutos", "há 2 horas", "há 3 dias"
function timeLabel(iso: string) {
    return formatDistanceToNow(new Date(iso), { locale: ptBR, addSuffix: true }).replace('cerca de ', '').replace('em ', 'há ')
}

export default function ProfileNotification({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const router = useRouter()
    const [items, setItems] = useState<Notif[] | null>(null)
    const [filter, setFilter] = useState<Filter>('all')
    const [page, setPage] = useState(0)

    const load = useCallback(async () => {
        const { data } = await supabase.rpc('get_my_notifications', { p_limit: 100 })
        setItems((data as Notif[]) || [])
    }, [])

    useEffect(() => {
        load()
        const channel = supabase
            .channel(`profile-notifications-${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profile_notifications', filter: `profile_id=eq.${userId}` }, () => load())
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [userId, load])

    const unread = useMemo(() => (items || []).filter((n) => !n.read_at).length, [items])

    const visible = useMemo(() => {
        const kinds = FILTERS.find((f) => f.id === filter)?.kinds
        return (items || []).filter((n) => !kinds || kinds.includes(n.kind))
    }, [items, filter])

    const markAllRead = async () => {
        await supabase.rpc('mark_notifications_read', { p_ids: null })
        setItems((prev) => (prev || []).map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    }

    const nameOf = (n: Notif) => n.actor_name || (n.actor_slug ? `@${n.actor_slug}` : 'Um visitante')

    const textOf = (n: Notif): string => {
        const who = nameOf(n)
        const title = n.meta?.title ? `“${n.meta.title}”` : ''
        const snip = n.meta?.snippet ? `“${n.meta.snippet}”` : ''
        switch (n.kind) {
            case 'follow': return `${who} começou a seguir você`
            case 'invite_signup': return `${who} entrou no iUser pelo seu convite 🎉`
            case 'profile_view': return `${who} visitou seu perfil`
            case 'link_visit': return `${who} entrou por um link seu${n.meta?.path ? ` (${n.meta.path})` : ''}`
            case 'publication_like': return `${who} curtiu sua publicação ${title}`.trim()
            case 'service_like': return `${who} curtiu seu serviço ${title}`.trim()
            case 'product_like': return `${who} curtiu seu produto ${title}`.trim()
            case 'comment_like': return `${who} curtiu seu comentário ${snip}`.trim()
            case 'publication_comment': return `${who} comentou ${title ? `em ${title}` : 'na sua publicação'}: ${snip}`
            case 'profile_comment': return `${who} comentou no seu perfil: ${snip}`
            case 'comment_reply': return `${who} respondeu ao seu comentário: ${snip}`
            default: return who
        }
    }

    const hrefOf = (n: Notif): string | null => {
        if (n.meta?.owner_slug && n.meta?.slug && ['publication_like', 'service_like', 'product_like', 'publication_comment', 'comment_like', 'comment_reply'].includes(n.kind)) {
            return `/${n.meta.owner_slug}/${n.meta.slug}`
        }
        if (n.kind === 'link_visit' && n.meta?.path) return n.meta.path
        if (n.actor_slug) return `/${n.actor_slug}`
        return null
    }

    const open = async (n: Notif) => {
        if (!n.read_at) {
            supabase.rpc('mark_notifications_read', { p_ids: [n.id] })
            setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
        }
        const href = hrefOf(n)
        if (href) router.push(href)
    }

    // 10 por vez, pra o cartão não ficar alto demais
    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, totalPages - 1)
    const pageRows = useMemo(() => visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE), [visible, safePage])

    // Agrupa por dia (só os da página atual)
    const groups = useMemo(() => {
        const out: { label: string; rows: Notif[] }[] = []
        for (const n of pageRows) {
            const label = dayLabel(n.created_at)
            const last = out[out.length - 1]
            if (last && last.label === label) last.rows.push(n)
            else out.push({ label, rows: [n] })
        }
        return out
    }, [pageRows])

    const renderRow = (n: Notif) => {
                                const meta = KIND_ICON[n.kind] || { icon: Bell, color: colors.accent }
        const Icon = meta.icon
        const avatar = getAvatarUrl(supabase, n.actor_avatar)
        const clickable = !!hrefOf(n)
        return (
            <button
                key={n.id}
                onClick={() => open(n)}
                className={`w-full flex items-start gap-3 px-2 py-1.5 rounded-xl text-left transition-colors ${clickable ? 'hover:bg-black/5' : 'cursor-default'}`}
                style={{ background: n.read_at ? 'transparent' : '#22c55e14' }}
            >
                <span className="relative flex-shrink-0">
                    {n.actor_id ? (
                        <PlanAvatarRing userId={n.actor_id}>
                            {avatar ? (
                                <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                            ) : (
                                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black" style={{ background: GRADIENT }}>
                                    {(n.actor_name || '?').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </PlanAvatarRing>
                    ) : (
                        <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${colors.border}55`, color: colors.textSecondary }}><User size={20} /></span>
                    )}
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: meta.color, border: `2px solid ${colors.surface}` }}>
                        <Icon size={11} />
                    </span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug break-words" style={{ color: colors.textPrimary, fontWeight: n.read_at ? 500 : 800 }}>{textOf(n)}</span>
                    <span className="block text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{timeLabel(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#22c55e' }} />}
            </button>
        )
    }

    // As 5 mais recentes, visíveis mesmo com o cartão fechado
    const preview = useMemo(() => (items || []).slice(0, PREVIEW_COUNT), [items])

    return (
        <DashboardSection
            storageKey="notificacoes-perfil"
            title="Notificações do perfil"
            subtitle="Tudo o que acontece com o seu perfil"
            collapsedContent={items !== null && preview.length > 0 ? (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Últimas notificações</p>
                    {preview.map((n) => renderRow(n))}
                </>
            ) : undefined}
            collapsedSummary={unread > 0
                ? <span><b style={{ color: '#16a34a' }}>{unread}</b> {unread === 1 ? 'novidade' : 'novidades'} no seu perfil</span>
                : undefined}
        >
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => { setFilter(f.id); setPage(0) }}
                            className="px-3.5 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all"
                            style={filter === f.id
                                ? { background: GRADIENT, color: '#fff', border: '1px solid transparent' }
                                : { background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {unread > 0 && (
                    <button onClick={markAllRead} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black" style={{ color: colors.accent, border: `1px solid ${colors.accent}` }}>
                        <CheckCheck size={14} /> Marcar tudo como lido
                    </button>
                )}
            </div>

            {items === null ? (
                <div className="flex justify-center py-6"><Spinner size={22} color={colors.accent} /></div>
            ) : visible.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 text-center">
                    <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Bell size={24} /></span>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nada por aqui ainda</p>
                    <p className="text-xs max-w-xs" style={{ color: colors.textSecondary }}>
                        Quando alguém seguir, curtir, comentar ou visitar o seu perfil, você vê aqui na hora.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {groups.map((g) => (
                        <div key={g.label} className="flex flex-col gap-0.5">
                            <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{g.label}</p>
                            {g.rows.map((n) => renderRow(n))}
                        </div>
                    ))}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 pt-1">
                            <button
                                onClick={() => setPage(Math.max(0, safePage - 1))}
                                disabled={safePage === 0}
                                aria-label="Página anterior"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-35 transition-transform active:scale-95"
                                style={{ background: GRADIENT }}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{safePage + 1} / {totalPages}</span>
                            <button
                                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                                disabled={safePage >= totalPages - 1}
                                aria-label="Próxima página"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-35 transition-transform active:scale-95"
                                style={{ background: GRADIENT }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </DashboardSection>
    )
}
