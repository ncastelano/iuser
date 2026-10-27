// components/AtalhoCompromissosDaLoja.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, X, Earth, Lock, User, Store, Check, Eye, EyeOff, Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { useProfilesById } from '@/hooks/useProfilesById'
import ShareAppointmentButton from '@/components/ShareAppointmentButton'
import { supabase } from '@/lib/supabase/client'
import { notifyAppointmentUpdate } from '@/lib/notifyRideStatus'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { hexToRgb } from '@/lib/color'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { useInsideShell } from '@/components/InsideShell'
import V3Section, { V3_GRADIENT } from '@/components/StoreDashboard/V3Section'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
}

/* ─── Helpers ─── */

function formatTime(time: string) {
    return time.slice(0, 5)
}

/* ─── Badge de visibilidade ─── */
function VisibilityBadge({ isPublic, textColor }: { isPublic: boolean; textColor: string }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 9999,
                backgroundColor: isPublic ? 'rgba(16,185,129,0.15)' : `${textColor}20`,
                color: isPublic ? '#10b981' : textColor,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                whiteSpace: 'nowrap',
            }}
        >
            {isPublic ? <Earth size={10} /> : <Lock size={10} />}
            {isPublic ? 'Público' : 'Privado'}
        </span>
    )
}

/* ─── Badge de status ─── */
function StatusBadge({ status }: { status: string }) {
    const config = {
        confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
        pending: { bg: 'rgba(234,179,8,0.2)', text: '#fbbf24', label: 'Pendente' },
        cancelled: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', label: 'Cancelado' },
        completed: { bg: 'rgba(60, 60, 61, 0.2)', text: '#60a5fa', label: 'Concluído' },
    }
    const style = config[status as keyof typeof config] || config.pending

    return (
        <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: style.bg, color: style.text }}
        >
            {style.label}
        </span>
    )
}

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    /** Qual loja é esta agenda: sem isso, misturaria os agendamentos de todas as lojas da pessoa */
    storeId?: string | null
    storeSlug?: string | null
    onHasItemsChange?: (hasItems: boolean) => void
}

export default function AtalhoCompromissosDaLoja({
    dragHandle,
    profileSlug,
    storeId,
    storeSlug,
    onHasItemsChange,
}: AtalhoCompromissosDaLojaProps) {
    const { colors } = useTheme()
    const v3 = useInsideShell()
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()
    const { userId } = useProfile()

    const [showPending, setShowPending] = useState(true)
    const [isExpanded, setIsExpanded] = usePersistedExpanded('atalhoCompromissosLoja', false)

    // Filtra apenas compromissos da loja (com store_id)
    const storeAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(
            (a) =>
                (a.owner_id === userId || a.provider_profile_id === userId) &&
                (storeId ? a.store_id === storeId : !!a.store_id) &&
                // O PEDIDO de serviço fica em "Pedidos na loja" (aba Serviços): só o que a loja ACEITOU entra na agenda
                a.status !== 'pending'
        )
    }, [appointments, userId, storeId])

    // Foto/nome ATUAIS dos clientes (a cópia salva no agendamento fica velha)
    const people = useProfilesById(storeAppointments.map((a) => a.customer_id))
    const agendaHref = storeSlug ? `/compromissos/${storeSlug}` : '/compromissos'

    useEffect(() => {
        onHasItemsChange?.(storeAppointments.length > 0)
    }, [storeAppointments, onHasItemsChange])

    // Filtro por pendentes
    const filtered = useMemo(() => {
        if (!showPending) return storeAppointments.filter((a) => a.status !== 'pending')
        return storeAppointments
    }, [storeAppointments, showPending])

    // Ordenar: pendentes primeiro, depois por data mais recente
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            // Pendentes primeiro
            if (a.status === 'pending' && b.status !== 'pending') return -1
            if (b.status === 'pending' && a.status !== 'pending') return 1

            // Depois por data (mais recente primeiro)
            const da = new Date(`${a.date}T${a.time}`)
            const db = new Date(`${b.date}T${b.time}`)
            return db.getTime() - da.getTime()
        })
    }, [filtered])

    const pendingCount = 0 // pendentes não entram na agenda (são pedidos de serviço, aceitos em "Pedidos na loja")
    const completedCount = storeAppointments.filter(a => a.status === 'completed').length
    const confirmedCount = storeAppointments.filter(a => a.status === 'confirmed').length
    const hasHiddenPending = !showPending && pendingCount > 0

    // Ações
    const handleAccept = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase
            .from('appointments')
            .update({ status: 'confirmed' })
            .eq('id', id)
        if (!error) { notifyAppointmentUpdate(id); refetch() }
        else alert(error.message.includes('pós-pago') ? error.message : 'Erro ao aceitar.')
    }, [refetch])

    const handleDecline = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
        if (!error) { notifyAppointmentUpdate(id); refetch() }
    }, [refetch])

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (!confirm('Excluir este compromisso?')) return
        const success = await deleteAppointment(id)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const surfaceRgb = hexToRgb(colors.surface)
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    // Skeleton
    if (loading) {
        return (
            <div className="mt-6 mb-6">
                <div
                    className="rounded-2xl p-6 pt-7 w-full"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        {dragHandle}
                        <h2 className="text-xl font-black" style={{ color: textPrimary }}>Agenda da Loja</h2>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    const body = (
                    <>
                        {/* Resumo em números */}
                        <div className="grid grid-cols-3 gap-2.5">
                            {[
                                { label: 'Feitos', value: completedCount, color: '#2563eb' },
                                { label: 'Confirmados', value: confirmedCount, color: '#10b981' },
                                { label: 'Total', value: storeAppointments.length, color: textPrimary },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-2xl py-3 px-2 text-center"
                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`, border: `1px solid ${borderColor}` }}
                                >
                                    <p className="text-2xl font-black leading-none" style={{ color: stat.color }}>{stat.value}</p>
                                    <p className="text-[11px] font-bold mt-1.5" style={{ color: textSecondary }}>{stat.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-2.5">
                            <Link
                                href="/compromissos/agendar"
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                                style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640', textDecoration: 'none' }}
                            >
                                <Plus size={16} />
                                Novo compromisso
                            </Link>

                            {sorted.length > 0 && (
                                <Link
                                    href={agendaHref}
                                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                                    style={{ border: `2px solid ${colors.accent}`, color: colors.accent, background: 'transparent', textDecoration: 'none' }}
                                >
                                    {!v3 && <Calendar size={16} />}
                                    Ver agenda
                                </Link>
                            )}
                        </div>

                        {/* Lista de compromissos */}
                        {sorted.length === 0 && !hasHiddenPending ? (
                            /* Estado vazio */
                            <div
                                className="rounded-3xl p-5 flex items-center gap-4"
                                style={{ background: 'linear-gradient(135deg, #f9731614, #dc262610)', border: '1px dashed #f9731666' }}
                            >
                                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }}>
                                    <Store size={26} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-black" style={{ color: textPrimary }}>Sem compromissos na sua loja</h3>
                                    <p className="text-sm mt-0.5" style={{ color: textSecondary }}>Divulgue sua loja para as pessoas agendarem um horário.</p>
                                </div>
                            </div>
                        ) : sorted.length === 0 && hasHiddenPending ? (
                            /* Pendentes ocultos */
                            <div
                                className="rounded-2xl p-6 text-center flex flex-col items-center gap-3"
                                style={{
                                    background: `rgba(#f9731610, 0.3)`,
                                    border: `1px dashed #f9731640`,
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                    }}
                                >
                                    <EyeOff size={32} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                        Sua loja tem agendamentos pendentes
                                    </h3>
                                    <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                        Ative a exibição de pendentes para aceitar ou recusar novos pedidos.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowPending(true)}
                                    style={{
                                        ...pillButtonFullStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Eye size={16} />
                                    Mostrar pendentes
                                </button>
                            </div>
                        ) : (
                            /* Lista horizontal com scroll */
                            <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-1 pb-2 pl-2 pr-2 snap-x snap-mandatory scroll-container">
                                {sorted.map((appointment) => {
                                    const status = appointment.status as string
                                    const isPending = status === 'pending'
                                    const isPast = new Date(`${appointment.date}T${appointment.time}`).getTime() < Date.now()
                                    const isToday = new Date(appointment.date).toDateString() === new Date().toDateString()

                                    const dateStr = new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                                        day: '2-digit', month: 'short'
                                    })

                                    const person = people.get(appointment.customer_id)
                                    const avatarUrl = person?.avatarUrl || null
                                    const customerName = (appointment.customer_slug ? `@${appointment.customer_slug}` : person?.name || 'Cliente')
                                    const serviceName = appointment.service_name
                                    const customerSlug = appointment.customer_slug || null
                                    const duration = appointment.duration_minutes

                                    const statusConfig = {
                                        confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
                                        pending: { bg: 'rgba(234,179,8,0.2)', text: '#fbbf24', label: 'Pendente' },
                                        cancelled: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', label: 'Cancelado' },
                                        completed: { bg: 'rgba(60, 60, 61, 0.2)', text: '#60a5fa', label: 'Concluído' },
                                    }
                                    const statusInfo = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

                                    return (
                                        <div
                                            key={appointment.id}
                                            className="flex-shrink-0 w-[280px] snap-start flex items-center gap-3 p-3 rounded-2xl border shadow-sm hover:shadow-md transition-all relative"
                                            style={{
                                                background: colors.surface,
                                                borderColor: isPending ? `#f9731660` : borderColor,
                                                boxShadow: isPending ? `0 0 0 2px #f9731640` : 'none',
                                            }}
                                        >
                                            {isPending && (
                                                <span
                                                    className="absolute -top-2 -right-2 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide shadow-md"
                                                    style={{
                                                        background: GRADIENT,
                                                        color: '#ffffff',
                                                        boxShadow: `0 2px 6px #f9731640`,
                                                    }}
                                                >
                                                    Novo
                                                </span>
                                            )}

                                            {/* Avatar do cliente - arredondado */}
                                            {customerSlug ? (
                                                <Link href={`/${customerSlug}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                                    <PlanAvatarRing userId={appointment.customer_id}>
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                                                    ) : (
                                                        <div
                                                            className="w-11 h-11 rounded-full flex items-center justify-center"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                            }}
                                                        >
                                                            <User size={22} />
                                                        </div>
                                                    )}
                                                    </PlanAvatarRing>
                                                </Link>
                                            ) : (
                                                <div className="flex-shrink-0">
                                                    <PlanAvatarRing userId={appointment.customer_id}>
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                                                    ) : (
                                                        <div
                                                            className="w-11 h-11 rounded-full flex items-center justify-center"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                            }}
                                                        >
                                                            <User size={22} />
                                                        </div>
                                                    )}
                                                    </PlanAvatarRing>
                                                </div>
                                            )}

                                            <Link
                                                href={agendaHref}
                                                className="flex-1 min-w-0 flex flex-col"
                                                style={{ textDecoration: 'none', color: 'inherit' }}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-medium" style={{ color: textSecondary }}>
                                                        {isToday ? 'Hoje' : dateStr}
                                                    </span>
                                                    <span
                                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                                        style={{ background: statusInfo.bg, color: statusInfo.text }}
                                                    >
                                                        {statusInfo.label}
                                                    </span>
                                                    {isPast && status !== 'cancelled' && (
                                                        <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded-full">
                                                            Passado
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 mb-1">
                                                    <h4 className="font-bold text-sm truncate" style={{ color: textPrimary }}>
                                                        {serviceName}
                                                    </h4>
                                                    {duration && (
                                                        <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: textSecondary }}>
                                                            · {duration} min
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                        <User size={10} /> {customerName}
                                                    </p>
                                                    {appointment.is_public !== undefined && (
                                                        <VisibilityBadge isPublic={appointment.is_public} textColor={textSecondary} />
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: `${borderColor}15` }}>
                                                    <span className="text-sm font-black tabular-nums flex items-center gap-1" style={{ color: '#f97316' }}>
                                                        <Clock size={14} />
                                                        {formatTime(appointment.time)}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <ShareAppointmentButton
                                                            appointmentId={appointment.id}
                                                            isPublic={appointment.is_public}
                                                            title={appointment.service_name}
                                                            dateLabel={`${appointment.date.split('-').reverse().join('/')} às ${formatTime(appointment.time)}`}
                                                            size={22}
                                                        />
                                                        {isPending ? (
                                                            <>
                                                                <button
                                                                    onClick={(e) => handleAccept(appointment.id, e)}
                                                                    className="p-1 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                                                >
                                                                    <Check size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDecline(appointment.id, e)}
                                                                    className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleDelete(appointment.id, e)}
                                                                className="p-1 rounded-full transition-colors hover:bg-red-50 hover:text-red-500"
                                                                style={{ color: textSecondary }}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Rodapé com toggle e contagem - ÚNICO toggle de mostrar pendentes */}
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t"
                            style={{ borderColor: borderColor }}
                        >
                            <span className="text-xs font-medium" style={{ color: textSecondary }}>
                                Só entram aqui os serviços que você aceitou
                            </span>

                            {sorted.length > 0 && (
                                <Link
                                    href={agendaHref}
                                    style={{
                                        ...pillButtonStyle,
                                        border: `1px solid ${borderColor}`,
                                        color: textSecondary,
                                        background: 'transparent',
                                    }}
                                    className="hover:bg-white/5 transition-colors"
                                >
                                    <Calendar size={14} />
                                    Ver agenda
                                </Link>
                            )}
                        </div>
                    </>
    )

    // 3.0: o mesmo desenho do cartão "Pedidos na loja" — números coloridos, botões em pílula e linhas com a cor do estado na lateral
    const todayStr = new Date().toDateString()
    const todayCount = storeAppointments.filter((a) => a.status === 'confirmed' && new Date(`${a.date}T12:00:00`).toDateString() === todayStr).length
    const upcoming = storeAppointments
        .filter((a) => a.status === 'confirmed' && new Date(`${a.date}T${a.time}`).getTime() >= Date.now() - 60 * 60 * 1000)
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
        .slice(0, 6)
    const bodyV3 = (
        <>
            <div className="grid grid-cols-3 gap-2">
                {([
                    { label: 'Hoje', n: todayCount, color: '#d97706' },
                    { label: 'Na agenda', n: confirmedCount, color: '#7c3aed' },
                    { label: 'Feitos', n: completedCount, color: '#2563eb' },
                ]).map((t) => (
                    <div key={t.label} className="rounded-2xl py-2.5 px-1 flex flex-col items-center gap-0.5" style={{ background: `${t.color}${t.n > 0 ? '1f' : '10'}`, border: `1px solid ${t.color}${t.n > 0 ? '40' : '20'}` }}>
                        <span className="text-xl font-black leading-none" style={{ color: t.n > 0 ? t.color : textSecondary }}>{t.n}</span>
                        <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: t.n > 0 ? t.color : textSecondary }}>{t.label}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Link href={agendaHref} className="h-10 rounded-full text-[13px] font-black flex items-center justify-center transition active:scale-95" style={{ background: '#f97316', color: '#fff', textDecoration: 'none' }}>Ver agenda</Link>
                <Link href="/compromissos/agendar" className="h-10 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: `${borderColor}40`, color: textPrimary, textDecoration: 'none' }}><Plus size={14} /> Novo compromisso</Link>
            </div>

            {upcoming.length === 0 ? (
                <div className="rounded-xl p-5 text-center" style={{ background: `${borderColor}20`, border: `1px dashed ${borderColor}` }}>
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>Nenhum serviço na agenda pela frente</p>
                    <p className="text-xs mt-1" style={{ color: textSecondary }}>Os serviços que você aceitar em Pedidos na loja aparecem aqui.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {upcoming.map((a) => {
                        const person = people.get(a.customer_id)
                        const isToday = new Date(`${a.date}T12:00:00`).toDateString() === todayStr
                        const dateStr = new Date(`${a.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
                        return (
                            <Link
                                key={a.id}
                                href={agendaHref}
                                className="w-full rounded-2xl flex items-center gap-3 px-3.5 py-3 transition active:scale-[0.99]"
                                style={{ background: colors.surface, border: `1px solid ${borderColor}`, borderLeft: '4px solid #7c3aed', textDecoration: 'none' }}
                            >
                                <span className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-sm font-black" style={{ background: `${borderColor}60`, color: textPrimary }}>
                                    {person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" /> : (a.customer_slug || '?').charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-black truncate" style={{ color: textPrimary }}>@{a.customer_slug}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide flex-shrink-0" style={{ background: '#7c3aed1f', color: '#7c3aed' }}>{isToday ? 'Hoje' : dateStr}</span>
                                    </span>
                                    <span className="text-xs truncate" style={{ color: textSecondary }}>{a.service_name}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}</span>
                                </span>
                                <span className="text-sm font-black tabular-nums flex-shrink-0" style={{ color: textPrimary }}>{formatTime(a.time)}</span>
                            </Link>
                        )
                    })}
                </div>
            )}
        </>
    )

    // 3.0: o mesmo cartão de seção das outras partes do painel
    if (v3) {
        return (
            <>
            <V3Section
                title="Agenda da loja"
                subtitle={<><span style={{ color: '#7c3aed', fontWeight: 800 }}>{confirmedCount}</span> na agenda · <span style={{ color: '#2563eb', fontWeight: 800 }}>{completedCount}</span> feito{completedCount !== 1 ? 's' : ''}</>}
                expanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                className="mb-6"
            >
                {bodyV3}
            </V3Section>

            {/* Estilos do scroll */}
            <style jsx>{`
                .scroll-container::-webkit-scrollbar {
                    height: 6px;
                }
                .scroll-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scroll-container::-webkit-scrollbar-thumb {
                    background-color: #f9731640;
                    border-radius: 9999px;
                }
                .scroll-container::-webkit-scrollbar-thumb:hover {
                    background-color: #f97316;
                }
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: #f9731640 transparent;
                }
            `}</style>
            </>
        )
    }

    return (
        <div className="mt-6 mb-6">
            <div
                className={`rounded-3xl w-full flex flex-col ${isExpanded ? 'p-4 gap-4' : 'p-4'}`}
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${borderColor}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho com toggle - PILL */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{
                        padding: isExpanded ? '0.5rem 0.75rem' : 0,
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        {dragHandle}
                        <div>
                            <h2 className={`${isExpanded ? 'text-lg' : 'text-sm'} font-black`} style={{ color: textPrimary }}>
                                Agenda da Loja
                            </h2>
                            {!isExpanded && (
                            <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: textSecondary }}>
                                <span>
                                    <span className="font-bold" style={{ color: '#7c3aed' }}>{confirmedCount}</span> na agenda
                                </span>
                                <span>•</span>
                                <span>
                                    <span className="font-bold" style={{ color: '#2563eb' }}>{completedCount}</span> feito{completedCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {storeAppointments.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {storeAppointments.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={isExpanded ? 22 : 18} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={isExpanded ? 22 : 18} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    body
                )}
            </div>

            {/* Estilos do scroll */}
            <style jsx>{`
                .scroll-container::-webkit-scrollbar {
                    height: 6px;
                }
                .scroll-container::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scroll-container::-webkit-scrollbar-thumb {
                    background-color: #f9731640;
                    border-radius: 9999px;
                }
                .scroll-container::-webkit-scrollbar-thumb:hover {
                    background-color: #f97316;
                }
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: #f9731640 transparent;
                }
            `}</style>
        </div>
    )
}