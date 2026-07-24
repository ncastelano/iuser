// src/components/AtalhoCompromissosPessoal.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Check, X, Calendar, User, Lock, Earth, Eye, EyeOff, Clock } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

/* ─── Auxiliar para converter hex em RGB ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

/* ─── Badge de visibilidade ─── */
function VisibilityBadge({ isPublic, textColor }: { isPublic: boolean; textColor: string }) {
    return (
        <span
            style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 8,
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

interface AtalhoCompromissosPessoalProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    userAvatarUrl?: string | null
    onHasItemsChange?: (hasItems: boolean) => void
}

function parseDateTime(date: string, time: string) {
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return new Date(y, m - 1, d, h, min).getTime()
}

function formatTime(time: string) {
    return time.slice(0, 5)
}

export default function AtalhoCompromissosPessoal({
    dragHandle,
    profileSlug,
    userAvatarUrl,
    onHasItemsChange,
}: AtalhoCompromissosPessoalProps) {
    const { colors } = useTheme()
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()

    const [userId, setUserId] = useState<string | null>(null)
    const [showPending, setShowPending] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUserId(session.user.id)
        })
    }, [])

    // Filtra apenas compromissos pessoais (sem store_id)
    const personalAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(a => a.customer_id === userId && !a.store_id)
    }, [appointments, userId])

    useEffect(() => {
        onHasItemsChange?.(personalAppointments.length > 0)
    }, [personalAppointments, onHasItemsChange])

    // Filtro por pendentes
    const filtered = useMemo(() => {
        if (!showPending) return personalAppointments.filter(a => a.status !== 'pending')
        return personalAppointments
    }, [personalAppointments, showPending])

    // Ordenar: pendentes primeiro, depois por data mais recente
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            // Pendentes primeiro
            if (a.status === 'pending' && b.status !== 'pending') return -1
            if (b.status === 'pending' && a.status !== 'pending') return 1

            // Depois por data (mais recente primeiro)
            return parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time)
        })
    }, [filtered])

    const pendingCount = personalAppointments.filter(a => a.status === 'pending').length
    const confirmedCount = personalAppointments.filter(a => a.status === 'confirmed').length
    const hasHiddenPending = !showPending && pendingCount > 0

    // Ações
    const handleAccept = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase.rpc('confirm_appointment', { incoming_id: id })
        if (!error) refetch()
        else alert('Erro ao aceitar convite.')
    }, [refetch])

    const handleDecline = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
        if (!error) refetch()
    }, [refetch])

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (!confirm('Excluir este compromisso?')) return
        const success = await deleteAppointment(id)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const getAvatarUrl = (appointment: any) => {
        if (appointment.direction === 'incoming') {
            return appointment.customer_avatar_url || null
        } else if (appointment.direction === 'outgoing') {
            return appointment.customer_avatar_url || null
        } else {
            return userAvatarUrl || null
        }
    }

    const getProfileSlugFromAppointment = (appointment: any): string | null => {
        if (appointment.direction === 'incoming') {
            return appointment.owner_slug || null
        } else if (appointment.direction === 'outgoing') {
            return appointment.customer_slug || null
        }
        return null
    }

    const title = profileSlug ? `Agenda de @${profileSlug}` : 'Agenda Pessoal'

    const surfaceRgb = hexToRgb(colors.surface)
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    // Skeleton
    if (loading) {
        return (
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
                    <Calendar className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)` }}
                        />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div
            className="rounded-2xl p-6 pt-7 w-full flex flex-col gap-5"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${borderColor}`,
                boxShadow: colors.shadow,
            }}
        >
            {/* Cabeçalho: título + contagens + botões */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                    {dragHandle}
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                            color: colors.accentText,
                        }}
                    >
                        <Calendar size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black" style={{ color: textPrimary }}>
                            {title}
                        </h2>
                        <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: textSecondary }}>
                            <span>
                                <span className="font-bold" style={{ color: accentColor }}>{pendingCount}</span> pendente{pendingCount !== 1 ? 's' : ''}
                            </span>
                            <span>•</span>
                            <span>
                                <span className="font-bold" style={{ color: '#10b981' }}>{confirmedCount}</span> confirmado{confirmedCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Botões de ação */}
                <div className="flex items-center gap-2">
                    <Link
                        href="/compromissos/agendar"
                        className="text-xs font-bold px-4 py-2 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 shadow-md"
                        style={{
                            background: accentColor,
                            color: colors.accentText,
                            boxShadow: `0 4px 12px ${accentColor}40`,
                        }}
                    >
                        <Plus size={14} />
                        Criar
                    </Link>

                    {sorted.length > 0 && (
                        <Link
                            href="/compromissos"
                            className="text-xs font-bold px-4 py-2 rounded-full transition-all hover:bg-white/10 flex items-center gap-1.5"
                            style={{
                                border: `1px solid ${borderColor}`,
                                color: textSecondary,
                            }}
                        >
                            <Calendar size={14} />
                            Ver agenda
                        </Link>
                    )}
                </div>
            </div>

            {/* Toggle "Mostrar pendentes" */}
            <div
                className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                    border: `1px solid ${borderColor}`,
                }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{ color: textPrimary }}>
                        Mostrar pendentes
                    </span>
                    <label className="relative inline-flex cursor-pointer" style={{ width: 48, height: 26 }}>
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={showPending}
                            onChange={() => setShowPending(prev => !prev)}
                        />
                        <span
                            className="absolute inset-0 rounded-full transition-colors duration-200"
                            style={{ background: showPending ? accentColor : borderColor }}
                        />
                        <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-[22px]' : 'translate-x-0'}`}
                        />
                    </label>
                    {!showPending && pendingCount > 0 && (
                        <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse"
                            style={{ background: '#ef444420', color: '#ef4444' }}
                        >
                            {pendingCount} oculto{pendingCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {!showPending && pendingCount > 0 && (
                    <button
                        onClick={() => setShowPending(true)}
                        className="text-xs font-bold px-4 py-2 rounded-full transition-all hover:scale-105 flex items-center gap-1.5"
                        style={{
                            background: accentColor,
                            color: colors.accentText,
                        }}
                    >
                        <Eye size={14} />
                        Mostrar pendentes
                    </button>
                )}
            </div>

            {/* Lista de compromissos */}
            {sorted.length === 0 && !hasHiddenPending ? (
                /* Estado vazio */
                <div
                    className="rounded-xl p-6 text-center flex flex-col items-center gap-3"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        border: `1px dashed ${borderColor}`,
                    }}
                >
                    <div
                        className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                            color: colors.accentText,
                        }}
                    >
                        <Calendar size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                            Sua agenda está livre
                        </h3>
                        <p className="text-sm mt-1" style={{ color: textSecondary }}>
                            Que tal agendar um serviço ou compromisso?
                        </p>
                    </div>
                    <Link
                        href="/compromissos/agendar"
                        className="text-xs font-bold px-6 py-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 shadow-lg"
                        style={{
                            background: accentColor,
                            color: colors.accentText,
                            boxShadow: `0 4px 14px ${accentColor}60`,
                        }}
                    >
                        <Plus size={16} />
                        Novo compromisso
                    </Link>
                </div>
            ) : sorted.length === 0 && hasHiddenPending ? (
                /* Pendentes ocultos */
                <div
                    className="rounded-xl p-6 text-center flex flex-col items-center gap-3"
                    style={{
                        background: `rgba(${accentColor}10, 0.3)`,
                        border: `1px dashed ${accentColor}40`,
                    }}
                >
                    <div
                        className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                            color: colors.accentText,
                        }}
                    >
                        <EyeOff size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                            Compromissos pendentes ocultos
                        </h3>
                        <p className="text-sm mt-1" style={{ color: textSecondary }}>
                            Ative a exibição de pendentes para gerenciar convites.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowPending(true)}
                        className="text-xs font-bold px-6 py-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 shadow-lg"
                        style={{
                            background: accentColor,
                            color: colors.accentText,
                            boxShadow: `0 4px 14px ${accentColor}60`,
                        }}
                    >
                        <Eye size={16} />
                        Mostrar pendentes
                    </button>
                </div>
            ) : (
                /* Lista horizontal com scroll */
                <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-1 pb-2 pl-2 pr-2 snap-x snap-mandatory scroll-container">
                    {sorted.map((appointment) => {
                        const isIncomingPending = appointment.direction === 'incoming' && appointment.status === 'pending'
                        const avatarUrl = getAvatarUrl(appointment)
                        const profileSlugTarget = getProfileSlugFromAppointment(appointment)
                        const isPast = parseDateTime(appointment.date, appointment.time) < Date.now()
                        const isToday = new Date(appointment.date).toDateString() === new Date().toDateString()
                        const status = appointment.status as 'confirmed' | 'pending' | 'cancelled' | 'completed'

                        const statusConfig = {
                            confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
                            pending: { bg: 'rgba(234,179,8,0.2)', text: '#fbbf24', label: 'Pendente' },
                            cancelled: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', label: 'Cancelado' },
                            completed: { bg: 'rgba(60, 60, 61, 0.2)', text: '#60a5fa', label: 'Concluído' },
                        }
                        const statusInfo = statusConfig[status] || statusConfig.pending
                        const isPending = status === 'pending'

                        const dateStr = new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                            day: '2-digit', month: 'short'
                        })

                        const customerName = appointment.customer_slug || 'Cliente'
                        const serviceName = appointment.service_name
                        const duration = appointment.duration_minutes

                        return (
                            <div
                                key={appointment.id}
                                className="flex-shrink-0 w-[280px] snap-start flex items-center gap-3 p-3 rounded-xl border shadow-sm hover:shadow-md transition-all relative"
                                style={{
                                    background: colors.surface,
                                    borderColor: isPending ? `${accentColor}60` : borderColor,
                                    boxShadow: isPending ? `0 0 0 2px ${accentColor}40` : 'none',
                                }}
                            >
                                {isPending && (
                                    <span
                                        className="absolute -top-2 -right-2 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide shadow-md"
                                        style={{
                                            background: accentColor,
                                            color: '#000000',
                                            boxShadow: `0 2px 6px ${accentColor}40`,
                                        }}
                                    >
                                        Novo
                                    </span>
                                )}

                                {profileSlugTarget ? (
                                    <Link href={`/${profileSlugTarget}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
                                        ) : (
                                            <div
                                                className="w-11 h-11 rounded-xl flex items-center justify-center"
                                                style={{
                                                    background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                                }}
                                            >
                                                <User size={22} style={{ color: colors.accentText }} />
                                            </div>
                                        )}
                                    </Link>
                                ) : (
                                    <div className="flex-shrink-0">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
                                        ) : (
                                            <div
                                                className="w-11 h-11 rounded-xl flex items-center justify-center"
                                                style={{
                                                    background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                                }}
                                            >
                                                <User size={22} style={{ color: colors.accentText }} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Link
                                    href="/compromissos"
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
                                        {appointment.direction === 'incoming' ? (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} /> @{appointment.owner_slug}
                                            </p>
                                        ) : appointment.direction === 'outgoing' ? (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} /> @{appointment.customer_slug}
                                            </p>
                                        ) : (
                                            <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                                <User size={10} /> Pessoal
                                            </p>
                                        )}
                                        {appointment.is_public !== undefined && (
                                            <VisibilityBadge isPublic={appointment.is_public} textColor={textSecondary} />
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: `${borderColor}15` }}>
                                        <span className="text-sm font-black tabular-nums flex items-center gap-1" style={{ color: accentColor }}>
                                            <Clock size={14} />
                                            {formatTime(appointment.time)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {isIncomingPending ? (
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

            {/* Rodapé com toggle e contagem */}
            <div
                className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t"
                style={{ borderColor: borderColor }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-xs font-medium" style={{ color: textSecondary }}>
                        Mostrar pendentes
                    </span>
                    <label className="relative inline-flex cursor-pointer" style={{ width: 40, height: 22 }}>
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={showPending}
                            onChange={() => setShowPending(prev => !prev)}
                        />
                        <span
                            className="absolute inset-0 rounded-full transition-colors duration-200"
                            style={{ background: showPending ? accentColor : borderColor }}
                        />
                        <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-[18px]' : 'translate-x-0'}`}
                        />
                    </label>
                    {!showPending && pendingCount > 0 && (
                        <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse"
                            style={{ background: '#ef444420', color: '#ef4444' }}
                        >
                            {pendingCount} oculto{pendingCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {sorted.length > 0 && (
                    <Link
                        href="/compromissos"
                        className="text-xs font-bold px-4 py-2 rounded-full transition-all hover:bg-white/10 flex items-center gap-1.5"
                        style={{
                            border: `1px solid ${borderColor}`,
                            color: textSecondary,
                        }}
                    >
                        <Calendar size={14} />
                        Ver agenda
                    </Link>
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
                    background-color: ${`${accentColor}40`};
                    border-radius: 9999px;
                }
                .scroll-container::-webkit-scrollbar-thumb:hover {
                    background-color: ${accentColor};
                }
                .scroll-container {
                    scrollbar-width: thin;
                    scrollbar-color: ${`${accentColor}40`} transparent;
                }
            `}</style>
        </div>
    )
}