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
import PlanAvatarRing from '@/components/PlanAvatarRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ActivitySectionProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface ActivityVisitor {
    key: string
    userId: string | null
    anonymousId: string
    profile: {
        name: string | null
        profileSlug: string | null
        avatarUrl: string | null
        createdAt: string | null
        invitedBy: { name: string | null; profileSlug: string | null } | null
    } | null
    visits: number
    lastSeen: string
    firstSeen: string
    online: boolean
    referrer: string | null
    /** O que a pessoa fez por último, mais recente primeiro (páginas repetidas em seguida já vêm juntas) */
    steps: { path: string; count: number; at: string }[]
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
    visitors: ActivityVisitor[]
    visitorsTotal: number
}

// Rota → o que a pessoa fez, em português (o que não conhece mostra o endereço mesmo)
const ROOT_LABELS: Record<string, string> = {
    '': 'Abriu a home', inicio: 'Abriu a home', carrinho: 'Abriu o carrinho', compromissos: 'Abriu a agenda', compromisso: 'Viu um compromisso',
    planos: 'Viu os planos', radar: 'Abriu o radar', social: 'Abriu o social', publicacoes: 'Viu as publicações', comunidade: 'Abriu a comunidade',
    convite: 'Abriu um convite', cadastrar: 'Abriu o cadastro', login: 'Abriu o login', 'criar-loja': 'Estava criando uma loja',
    'criar-loja-com-cadastro': 'Estava criando uma loja e a conta', 'pedir-motorista': 'Pediu um motorista', 'aceitar-corridas': 'Viu corridas pra aceitar',
    'minhas-corridas': 'Viu as suas corridas', 'acompanhar-corrida': 'Acompanhou uma corrida', 'painel-motorista': 'Abriu o painel do motorista',
    'painel-prestador': 'Abriu o painel do prestador', 'solicitar-servico': 'Pediu um serviço', 'procurar-servico': 'Procurou um serviço',
    pedidos: 'Viu os pedidos', 'lojas-em-destaque': 'Viu as lojas em destaque', lojas: 'Viu as lojas', administrador: 'Abriu a administração',
}
function describePath(path: string): { label: string; detail: string | null } {
    const clean = path.split('?')[0].replace(/\/+$/, '')
    const segs = clean.split('/').filter(Boolean)
    const first = segs[0] || ''
    if (ROOT_LABELS[first] !== undefined && (segs.length <= 1 || ['compromissos', 'planos', 'lojas', 'publicacoes', 'comunidade', 'acompanhar-corrida', 'compromisso'].includes(first))) {
        const extra = segs.length > 1 ? `/${segs.slice(1).join('/')}` : null
        return { label: ROOT_LABELS[first], detail: extra }
    }
    if (segs.length === 1) return { label: 'Viu um perfil ou loja', detail: `/${first}` }
    if (segs.length >= 2) return { label: 'Viu um produto, serviço ou publicação', detail: clean }
    return { label: clean || 'Abriu a home', detail: null }
}

/** "hoje às 10:22", "ontem às 21:05", "05/10 às 14:00" */
function humanWhen(iso: string): string {
    const d = new Date(iso)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const day = new Date(d); day.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
    const hm = format(d, 'HH:mm')
    if (diff === 0) return `hoje às ${hm}`
    if (diff === 1) return `ontem às ${hm}`
    return `${format(d, 'dd/MM')} às ${hm}`
}

/** De onde a pessoa chegou, em frase: link de convite, Google, Instagram... */
function humanReferrer(referrer: string | null): string | null {
    if (!referrer) return null
    try {
        const u = new URL(referrer)
        const host = u.hostname.replace(/^www\./, '')
        const ref = u.searchParams.get('ref')
        if (host.includes('iuser.com.br') || host === 'localhost') {
            if (ref) return `pelo link de convite de @${ref.replace(/^@/, '')}`
            if (u.pathname === '/' ) return 'de dentro do iUser (home)'
            return `de dentro do iUser (${u.pathname})`
        }
        const known: [string, string][] = [['google.', 'do Google'], ['instagram.', 'do Instagram'], ['facebook.', 'do Facebook'], ['wa.me', 'do WhatsApp'], ['whatsapp.', 'do WhatsApp'], ['t.co', 'do X'], ['x.com', 'do X'], ['twitter.', 'do X'], ['t.me', 'do Telegram']]
        const hit = known.find(([k]) => host.includes(k))
        return hit ? hit[1] : `de ${host}`
    } catch {
        return referrer
    }
}

// Aba "Atividade" do admin geral: todo mundo que passa pelo iUser, logado
// ou não, começando pela home — alimentada por site_visits (ver
// PageViewTracker.tsx, que grava uma linha a cada troca de página).
export default function ActivitySection({ cardStyle, colors }: ActivitySectionProps) {
    const surfaceRgb = hexToRgb(colors.surface)
    const [summary, setSummary] = useState<ActivitySummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

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
                    Visitantes recentes ({summary.visitors.length}{summary.visitorsTotal > summary.visitors.length ? ` de ${summary.visitorsTotal}` : ''})
                </p>
                {summary.visitors.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>Nenhuma visita registrada ainda.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {summary.visitors.map((v) => {
                            const isAnonymous = !v.userId
                            const name = isAnonymous
                                ? `Visitante anônimo #${v.anonymousId.slice(0, 5)}`
                                : v.profile?.name || (v.profile?.profileSlug ? `@${v.profile.profileSlug}` : 'Usuário')
                            const open = expanded.has(v.key)
                            const steps = open ? v.steps : v.steps.slice(0, 4)
                            return (
                                <div key={v.key} style={cardStyle} className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <PlanAvatarRing userId={v.userId}>
                                            {v.profile?.avatarUrl ? (
                                                <img src={v.profile.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                                <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black text-white" style={{ background: isAnonymous ? '#64748b' : GRADIENT }}>
                                                    {isAnonymous ? '?' : name.replace('@', '').charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </PlanAvatarRing>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{name}</span>
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                                                    style={{ background: isAnonymous ? '#ef444420' : '#10b98120', color: isAnonymous ? '#ef4444' : '#10b981' }}
                                                >
                                                    {isAnonymous ? 'Anônimo' : 'Cadastrado'}
                                                </span>
                                                {!isAnonymous && v.profile && (
                                                    v.profile.invitedBy ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: '#f9731620', color: '#f97316' }}>
                                                            Convidado por @{v.profile.invitedBy.profileSlug || v.profile.invitedBy.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: `${colors.border}40`, color: colors.textSecondary }}>
                                                            Sem convite
                                                        </span>
                                                    )
                                                )}
                                                {v.online && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 flex-shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                                {v.visits} {v.visits === 1 ? 'visita' : 'visitas'} · última {formatDistanceToNow(new Date(v.lastSeen), { addSuffix: true, locale: ptBRLocale })}
                                            </p>
                                        </div>
                                    </div>

                                    {(() => {
                                        // Linha do tempo: o que fez + "criou a conta" no lugar certo (se já aparece no histórico mostrado)
                                        type Item = { at: string; kind: 'step' | 'created'; path?: string; count?: number }
                                        const created = v.profile?.createdAt || null
                                        const oldestShown = v.steps.length ? v.steps[v.steps.length - 1].at : null
                                        const createdInline = !!created && (v.steps.length < 8 || (!!oldestShown && created >= oldestShown))
                                        const items: Item[] = v.steps.map((st) => ({ at: st.at, kind: 'step' as const, path: st.path, count: st.count }))
                                        if (created && createdInline) items.push({ at: created, kind: 'created' })
                                        items.sort((x, y) => y.at.localeCompare(x.at))
                                        const shown = open ? items : items.slice(0, 4)
                                        const inviter = v.profile?.invitedBy
                                        return (
                                            <div className="space-y-1.5 pl-1" style={{ borderLeft: `2px solid ${colors.border}`, marginLeft: 6 }}>
                                                {shown.map((it, i) => {
                                                    if (it.kind === 'created') {
                                                        return (
                                                            <div key={`c-${i}`} className="pl-3">
                                                                <div className="flex items-baseline justify-between gap-2">
                                                                    <span className="text-xs font-black" style={{ color: '#10b981' }}>Criou a conta</span>
                                                                    <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>{humanWhen(it.at)}</span>
                                                                </div>
                                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                                                    {inviter
                                                                        ? <>Entrou pelo convite de <b>{inviter.name || `@${inviter.profileSlug}`}</b>{inviter.profileSlug ? ` (@${inviter.profileSlug})` : ''} e já ficou ligado a essa pessoa.</>
                                                                        : 'Entrou sem convite de ninguém.'}
                                                                </p>
                                                            </div>
                                                        )
                                                    }
                                                    const d = describePath(it.path || '')
                                                    return (
                                                        <div key={`${it.at}-${i}`} className="flex items-baseline justify-between gap-2 pl-3">
                                                            <div className="min-w-0">
                                                                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{d.label}</span>
                                                                {(it.count || 1) > 1 && <span className="text-[10px] font-black ml-1" style={{ color: '#f97316' }}>{it.count} vezes</span>}
                                                                {d.detail && <span className="text-[10px] font-mono ml-1.5 truncate" style={{ color: colors.textSecondary }}>{d.detail}</span>}
                                                            </div>
                                                            <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>{humanWhen(it.at)}</span>
                                                        </div>
                                                    )
                                                })}
                                                {items.length > 4 && (
                                                    <button
                                                        onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(v.key)) n.delete(v.key); else n.add(v.key); return n })}
                                                        className="pl-3 text-[11px] font-bold"
                                                        style={{ color: colors.accent }}
                                                    >
                                                        {open ? 'Mostrar menos' : `+ ${items.length - 4} ações anteriores`}
                                                    </button>
                                                )}
                                                {created && !createdInline && (
                                                    <p className="pl-3 text-[11px]" style={{ color: colors.textSecondary }}>
                                                        Criou a conta {humanWhen(created)}{inviter ? ` · convidado por @${inviter.profileSlug || inviter.name}` : ' · sem convite'}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    <p className="text-[10px] opacity-70" style={{ color: colors.textSecondary }}>
                                        {(() => {
                                            const from = humanReferrer(v.referrer)
                                            return `${from ? `Chegou ${from} · ` : ''}primeira visita ${humanWhen(v.firstSeen)}`
                                        })()}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
