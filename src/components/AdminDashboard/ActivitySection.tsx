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
    profile: { name: string | null; profileSlug: string | null; avatarUrl: string | null } | null
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

// Rota → o que a pessoa estava fazendo, em português (o que não conhece mostra o endereço mesmo)
const ROOT_LABELS: Record<string, string> = {
    '': 'Home', inicio: 'Home', carrinho: 'Carrinho', compromissos: 'Agenda', compromisso: 'Viu um compromisso', planos: 'Planos',
    radar: 'Radar', social: 'Social', publicacoes: 'Publicações', comunidade: 'Comunidade', convite: 'Convite',
    cadastrar: 'Cadastro', login: 'Login', 'criar-loja': 'Criando loja', 'criar-loja-com-cadastro': 'Criando loja e conta',
    'pedir-motorista': 'Pedindo motorista', 'aceitar-corridas': 'Aceitando corridas', 'minhas-corridas': 'Minhas corridas',
    'acompanhar-corrida': 'Acompanhando corrida', 'painel-motorista': 'Painel do motorista', 'painel-prestador': 'Painel do prestador',
    'solicitar-servico': 'Pedindo serviço', 'procurar-servico': 'Procurando serviço', pedidos: 'Pedidos',
    'lojas-em-destaque': 'Lojas em destaque', lojas: 'Lojas', administrador: 'Administração',
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
    return { label: clean || 'Home', detail: null }
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

                                    <div className="space-y-1.5 pl-1" style={{ borderLeft: `2px solid ${colors.border}`, marginLeft: 6 }}>
                                        {steps.map((st, i) => {
                                            const d = describePath(st.path)
                                            return (
                                                <div key={`${st.at}-${i}`} className="flex items-baseline justify-between gap-2 pl-3">
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{d.label}</span>
                                                        {st.count > 1 && <span className="text-[10px] font-black ml-1" style={{ color: '#f97316' }}>×{st.count}</span>}
                                                        {d.detail && <span className="text-[10px] font-mono ml-1.5 truncate" style={{ color: colors.textSecondary }}>{d.detail}</span>}
                                                    </div>
                                                    <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>{format(new Date(st.at), 'dd/MM HH:mm')}</span>
                                                </div>
                                            )
                                        })}
                                        {v.steps.length > 4 && (
                                            <button
                                                onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(v.key)) n.delete(v.key); else n.add(v.key); return n })}
                                                className="pl-3 text-[11px] font-bold"
                                                style={{ color: colors.accent }}
                                            >
                                                {open ? 'Mostrar menos' : `+ ${v.steps.length - 4} ações anteriores`}
                                            </button>
                                        )}
                                    </div>

                                    {(v.referrer || v.visits > 1) && (
                                        <p className="text-[10px] opacity-70 truncate" style={{ color: colors.textSecondary }}>
                                            {v.referrer ? `Origem: ${v.referrer} · ` : ''}Primeira visita em {format(new Date(v.firstSeen), 'dd/MM HH:mm')}
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
