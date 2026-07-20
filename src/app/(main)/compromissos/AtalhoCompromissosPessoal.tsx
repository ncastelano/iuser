// components/AtalhoCompromissosPessoal.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Check, X, Calendar, User, Lock, Earth, Search, Star, Eye, EyeOff, Clock } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

/* ─── Auxiliar para converter hex em RGB (para usar em rgba) ─── */
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

    const personalAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(a => a.customer_id === userId && !a.store_id)
    }, [appointments, userId])

    useEffect(() => {
        onHasItemsChange?.(personalAppointments.length > 0)
    }, [personalAppointments, onHasItemsChange])

    const filtered = useMemo(() => {
        if (!showPending) return personalAppointments.filter(a => a.status !== 'pending')
        return personalAppointments
    }, [personalAppointments, showPending])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time))
    }, [filtered])

    const hasHiddenPending = !showPending && personalAppointments.some(a => a.status === 'pending')

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

    // Fundo totalmente transparente - igual à última parte do gradiente do header
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0)`
    const borderColor = colors.border
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    // Skeleton
    if (loading) {
        return (
            <div
                className="rounded-2xl p-6 w-full"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: `1px solid ${borderColor}`,
                }}
            >
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <Calendar className="w-5 h-5" style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="h-28 rounded-xl animate-pulse"
                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.1)` }}
                        />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div
            className="rounded-2xl p-6 w-full"
            style={{
                background: cardBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: `1px solid ${borderColor}`,
            }}
        >
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h2>
                </div>

                <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
                    <Link
                        href="/compromissos/agendar"
                        className="text-xs font-bold px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                        style={{ background: colors.accentLight, color: accentColor }}
                    >
                        <Plus size={14} />
                        Criar
                    </Link>

                    {sorted.length > 0 && (
                        <Link
                            href="/compromissos"
                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95"
                            style={{ background: colors.accentLight, color: accentColor }}
                        >
                            Ver todos
                        </Link>
                    )}

                    <div className="flex items-center gap-2">
                        <span
                            className="text-xs font-medium select-none cursor-pointer"
                            style={{ color: textSecondary }}
                            onClick={() => setShowPending(prev => !prev)}
                        >
                            Pendentes
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer" style={{ width: 40, height: 22 }}>
                            <input type="checkbox" className="sr-only peer" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
                            <span
                                className="absolute inset-0 rounded-full transition-colors duration-200"
                                style={{ background: showPending ? accentColor : colors.border }}
                            />
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${showPending ? 'translate-x-[18px]' : 'translate-x-0'}`}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            {sorted.length === 0 && !hasHiddenPending ? (
                /* Estado vazio */
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl" style={{ background: `${borderColor}10`, backdropFilter: 'blur(8px)' }}>
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <Calendar size={28} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Sua agenda está livre
                            </h3>
                            <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                Que tal agendar um serviço ou compromisso?
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/compromissos/agendar"
                        className="px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg flex-shrink-0"
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl" style={{ background: `${accentColor}10`, backdropFilter: 'blur(8px)' }}>
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <EyeOff size={28} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Compromissos pendentes ocultos
                            </h3>
                            <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                Ative a exibição de pendentes para gerenciar convites.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowPending(true)}
                        className="px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg flex-shrink-0"
                        style={{
                            background: accentColor,
                            color: colors.accentText,
                            boxShadow: `0 4px 14px ${accentColor}60`,
                        }}
                    >
                        <Eye size={16} />
                        Ativar pendentes
                    </button>
                </div>
            ) : (
                /* Grid de compromissos */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sorted.map(appointment => {
                        const isIncomingPending = appointment.direction === 'incoming' && appointment.status === 'pending'
                        const avatarUrl = getAvatarUrl(appointment)
                        const profileSlugTarget = getProfileSlugFromAppointment(appointment)

                        const isPast = parseDateTime(appointment.date, appointment.time) < Date.now()
                        const isToday = new Date(appointment.date).toDateString() === new Date().toDateString()

                        return (
                            <div
                                key={appointment.id}
                                className="rounded-xl p-4 border transition-all hover:shadow-lg hover:-translate-y-0.5"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.1)`,
                                    backdropFilter: 'blur(8px)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                    borderColor: isIncomingPending ? `${accentColor}60` : `${borderColor}20`,
                                    boxShadow: isIncomingPending ? `0 0 0 2px ${accentColor}40` : 'none',
                                }}
                            >
                                <Link
                                    href={profileSlugTarget ? `/${profileSlugTarget}` : '/compromissos'}
                                    className="flex items-start gap-3"
                                >
                                    {/* Avatar */}
                                    <div className="flex-shrink-0">
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt=""
                                                className="w-12 h-12 rounded-xl object-cover border-2"
                                                style={{ borderColor: colors.border }}
                                            />
                                        ) : (
                                            <div
                                                className="w-12 h-12 rounded-xl flex items-center justify-center"
                                                style={{
                                                    background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                                    color: colors.accentText,
                                                }}
                                            >
                                                <Calendar size={20} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-xs font-medium" style={{ color: textSecondary }}>
                                                {isToday ? 'Hoje' : new Date(appointment.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                            </span>
                                            <StatusBadge status={appointment.status} />
                                            {isIncomingPending && (
                                                <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full">
                                                    Convite
                                                </span>
                                            )}
                                            {isPast && appointment.status !== 'cancelled' && (
                                                <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                                                    Passado
                                                </span>
                                            )}
                                        </div>

                                        <h4 className="font-bold text-sm truncate" style={{ color: textPrimary }}>
                                            {appointment.service_name}
                                        </h4>

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
                                            <span className="text-sm font-black flex items-center gap-1" style={{ color: accentColor }}>
                                                <Clock size={14} />
                                                {formatTime(appointment.time)}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {isIncomingPending ? (
                                                    <>
                                                        <button
                                                            onClick={e => handleAccept(appointment.id, e)}
                                                            className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95"
                                                            style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={e => handleDecline(appointment.id, e)}
                                                            className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95"
                                                            style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={e => handleDelete(appointment.id, e)}
                                                        className="p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 opacity-40 hover:opacity-100"
                                                        style={{ color: textSecondary }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}