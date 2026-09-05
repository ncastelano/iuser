// src/components/AtalhoCompromissosPessoal.tsx
'use client'

import { ReactNode, useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Check, X, Calendar, User, Lock, Earth, Eye, EyeOff, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== HORÁRIOS PERMITIDOS PARA AGENDAMENTOS =====
const WEEKDAYS = [
    { id: '1', name: 'Segunda-feira' },
    { id: '2', name: 'Terça-feira' },
    { id: '3', name: 'Quarta-feira' },
    { id: '4', name: 'Quinta-feira' },
    { id: '5', name: 'Sexta-feira' },
    { id: '6', name: 'Sábado' },
    { id: '0', name: 'Domingo' },
]

const DEFAULT_WEEKLY = {
    '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '6': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
    '0': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
}

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

interface AtalhoCompromissosPessoalProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
    profileId?: string | null
    userAvatarUrl?: string | null
    onHasItemsChange?: (hasItems: boolean) => void
    onLatestUpdate?: (iso: string) => void
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
    profileId,
    userAvatarUrl,
    onHasItemsChange,
    onLatestUpdate,
}: AtalhoCompromissosPessoalProps) {
    const { colors } = useTheme()
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()

    const [userId, setUserId] = useState<string | null>(null)
    const [showPending, setShowPending] = useState(true)
    const [isExpanded, setIsExpanded] = useState(true)

    // ===== HORÁRIOS PERMITIDOS PARA AGENDAMENTOS =====
    const [hoursExpanded, setHoursExpanded] = useState(false)
    const [weekly, setWeekly] = useState<any>(DEFAULT_WEEKLY)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [hoursLoading, setHoursLoading] = useState(true)
    const [hoursSaving, setHoursSaving] = useState(false)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUserId(session.user.id)
        })
    }, [])

    const loadHoursConfig = useCallback(async () => {
        if (!profileId) return
        const { data } = await supabase
            .from('profiles')
            .select('business_hours')
            .eq('id', profileId)
            .single()

        if (data?.business_hours) {
            setWeekly(data.business_hours.weekly ?? DEFAULT_WEEKLY)
            setBlockedDates(data.business_hours.blocked_dates ?? [])
        } else {
            setWeekly(DEFAULT_WEEKLY)
            setBlockedDates([])
        }
        setHoursLoading(false)
    }, [profileId])

    useEffect(() => {
        loadHoursConfig()
    }, [loadHoursConfig])

    const updateDaySetting = (dayId: string, field: string, value: any) => {
        setWeekly((prev: any) => ({
            ...prev,
            [dayId]: { ...prev[dayId], [field]: value },
        }))
    }

    const addBlockedDate = () => {
        if (!blockedDateInput) return
        if (blockedDates.includes(blockedDateInput)) return
        setBlockedDates((prev) => [...prev, blockedDateInput].sort())
        setBlockedDateInput('')
    }

    const removeBlockedDate = (dateStr: string) => {
        setBlockedDates((prev) => prev.filter((d) => d !== dateStr))
    }

    const saveHoursConfig = async () => {
        if (!profileId) return
        setHoursSaving(true)

        const { error } = await supabase
            .from('profiles')
            .update({ business_hours: { weekly, blocked_dates: blockedDates }, updated_at: new Date().toISOString() })
            .eq('id', profileId)

        if (error) {
            alert('Erro ao salvar horários.')
        } else {
            alert('Horários salvos!')
        }
        setHoursSaving(false)
    }

    const cancelHoursEditing = () => {
        loadHoursConfig()
    }

    const openDaysCount = Object.values(weekly).filter((day: any) => day.isOpen).length

    // Filtra apenas compromissos pessoais (sem store_id)
    const personalAppointments = useMemo(() => {
        if (!userId) return []
        return appointments.filter(a => a.customer_id === userId && !a.store_id)
    }, [appointments, userId])

    useEffect(() => {
        onHasItemsChange?.(personalAppointments.length > 0)
    }, [personalAppointments, onHasItemsChange])

    useEffect(() => {
        if (!onLatestUpdate || personalAppointments.length === 0) return
        const latest = personalAppointments.reduce((max, a) => {
            const stamp = a.updated_at || a.created_at
            return stamp > max ? stamp : max
        }, personalAppointments[0].updated_at || personalAppointments[0].created_at)
        onLatestUpdate(latest)
    }, [personalAppointments, onLatestUpdate])

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
            </div>
        )
    }

    return (
        <div className="mt-6 mb-6">
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
                {/* Cabeçalho com toggle - PILL */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        {dragHandle}
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
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
                                    <span className="font-bold" style={{ color: '#f97316' }}>{pendingCount}</span> pendente{pendingCount !== 1 ? 's' : ''}
                                </span>
                                <span>•</span>
                                <span>
                                    <span className="font-bold" style={{ color: '#10b981' }}>{confirmedCount}</span> confirmado{confirmedCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {personalAppointments.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {personalAppointments.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <>
                        {/* Botões de ação - PILL */}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Link
                                href="/compromissos/agendar"
                                style={{
                                    ...pillButtonStyle,
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: `0 4px 12px #f9731640`,
                                }}
                                className="hover:scale-105 transition-transform"
                            >
                                <Plus size={14} />
                                Criar
                            </Link>

                            {sorted.length > 0 && (
                                <Link
                                    href="/compromissos"
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

                        {/* Toggle "Mostrar pendentes" - PILL */}
                        <div
                            className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                                        style={{ background: showPending ? '#f97316' : borderColor }}
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
                                    style={{
                                        ...pillButtonStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                    }}
                                    className="hover:scale-105 transition-transform"
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
                                className="rounded-2xl p-6 text-center flex flex-col items-center gap-3"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${borderColor}`,
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
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
                                    style={{
                                        ...pillButtonFullStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Plus size={16} />
                                    Novo compromisso
                                </Link>
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
                                        Compromissos pendentes ocultos
                                    </h3>
                                    <p className="text-sm mt-1" style={{ color: textSecondary }}>
                                        Ative a exibição de pendentes para gerenciar convites.
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
                                    const isIncomingPending = appointment.direction === 'incoming' && appointment.status === 'pending'
                                    const avatarUrl = getAvatarUrl(appointment)
                                    const profileSlugTarget = getProfileSlugFromAppointment(appointment)
                                    const isPast = parseDateTime(appointment.date, appointment.time) < Date.now()
                                    const isToday = new Date(appointment.date).toDateString() === new Date().toDateString()
                                    const status = appointment.status as 'confirmed' | 'pending' | 'cancelled' | 'completed'

                                    const statusConfig = {
                                        confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
                                        pending: { bg: 'rgba(34,197,94,0.2)', text: '#22c55e', label: 'Pendente' },
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

                                            {profileSlugTarget ? (
                                                <Link href={`/${profileSlugTarget}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
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
                                                </Link>
                                            ) : (
                                                <div className="flex-shrink-0">
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
                                                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isPending ? 'animate-pulse' : ''}`}
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
                                                    <span className="text-sm font-black tabular-nums flex items-center gap-1" style={{ color: '#f97316' }}>
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

                        {/* ===== HORÁRIOS PERMITIDOS PARA AGENDAMENTOS ===== */}
                        <div
                            className="rounded-2xl border overflow-hidden"
                            style={{
                                borderColor,
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                            }}
                        >
                            <button
                                onClick={() => setHoursExpanded(!hoursExpanded)}
                                className="w-full flex items-center justify-between p-4 text-left"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                    >
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black" style={{ color: textPrimary }}>
                                            Horários permitidos de agendamentos
                                        </h3>
                                        {!hoursLoading && (
                                            <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: textSecondary }}>
                                                <span>{openDaysCount} dia{openDaysCount !== 1 ? 's' : ''} com agenda aberta</span>
                                                {blockedDates.length > 0 && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{blockedDates.length} bloqueada{blockedDates.length !== 1 ? 's' : ''}</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {hoursExpanded ? (
                                    <ChevronUp size={20} style={{ color: textSecondary }} />
                                ) : (
                                    <ChevronDown size={20} style={{ color: textSecondary }} />
                                )}
                            </button>

                            {hoursExpanded && (
                                <div className="p-4 pt-0 flex flex-col gap-4">
                                    {hoursLoading ? (
                                        <div className="space-y-3">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)` }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-xs" style={{ color: textSecondary }}>
                                                Defina os horários em que as pessoas podem agendar compromissos com você
                                            </p>

                                            {/* Dias da semana */}
                                            <div className="space-y-3">
                                                {WEEKDAYS.map((day) => {
                                                    const dayConfig = weekly[day.id] || {
                                                        isOpen: false,
                                                        start: '08:00',
                                                        end: '18:00',
                                                        lunchStart: '',
                                                        lunchEnd: '',
                                                    }
                                                    const hasLunch = !!(dayConfig.lunchStart && dayConfig.lunchEnd)

                                                    return (
                                                        <div
                                                            key={day.id}
                                                            className="p-4 rounded-2xl border"
                                                            style={{
                                                                borderColor: colors.border,
                                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-between mb-3">
                                                                <span
                                                                    className="font-bold text-sm"
                                                                    style={{ color: dayConfig.isOpen ? textPrimary : textSecondary }}
                                                                >
                                                                    {day.name}
                                                                </span>
                                                                <label className="relative inline-flex cursor-pointer" style={{ width: 40, height: 22 }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="sr-only peer"
                                                                        checked={dayConfig.isOpen}
                                                                        onChange={(e) => updateDaySetting(day.id, 'isOpen', e.target.checked)}
                                                                    />
                                                                    <span
                                                                        className="absolute inset-0 rounded-full transition-colors duration-200"
                                                                        style={{ background: dayConfig.isOpen ? '#f97316' : colors.border }}
                                                                    />
                                                                    <span
                                                                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${dayConfig.isOpen ? 'translate-x-[18px]' : 'translate-x-0'
                                                                            }`}
                                                                    />
                                                                </label>
                                                            </div>

                                                            {dayConfig.isOpen && (
                                                                <div className="space-y-3">
                                                                    <div className="flex gap-3">
                                                                        <div className="flex-1">
                                                                            <span className="text-[10px] font-semibold" style={{ color: textSecondary }}>
                                                                                Início
                                                                            </span>
                                                                            <input
                                                                                type="time"
                                                                                value={dayConfig.start}
                                                                                onChange={(e) => updateDaySetting(day.id, 'start', e.target.value)}
                                                                                className="w-full p-2 rounded-full border text-sm"
                                                                                style={{
                                                                                    borderColor: colors.border,
                                                                                    background: colors.surface,
                                                                                    color: textPrimary,
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <span className="text-[10px] font-semibold" style={{ color: textSecondary }}>
                                                                                Fim
                                                                            </span>
                                                                            <input
                                                                                type="time"
                                                                                value={dayConfig.end}
                                                                                onChange={(e) => updateDaySetting(day.id, 'end', e.target.value)}
                                                                                className="w-full p-2 rounded-full border text-sm"
                                                                                style={{
                                                                                    borderColor: colors.border,
                                                                                    background: colors.surface,
                                                                                    color: textPrimary,
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Toggle almoço */}
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            id={`lunch-config-${day.id}`}
                                                                            checked={hasLunch}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    updateDaySetting(day.id, 'lunchStart', '12:00')
                                                                                    updateDaySetting(day.id, 'lunchEnd', '13:00')
                                                                                } else {
                                                                                    updateDaySetting(day.id, 'lunchStart', '')
                                                                                    updateDaySetting(day.id, 'lunchEnd', '')
                                                                                }
                                                                            }}
                                                                            className="rounded-full"
                                                                            style={{ accentColor: '#f97316' }}
                                                                        />
                                                                        <label
                                                                            htmlFor={`lunch-config-${day.id}`}
                                                                            className="text-xs font-semibold cursor-pointer"
                                                                            style={{ color: textSecondary }}
                                                                        >
                                                                            Intervalo de Almoço
                                                                        </label>
                                                                    </div>

                                                                    {hasLunch && (
                                                                        <div className="flex gap-3">
                                                                            <div className="flex-1">
                                                                                <span className="text-[10px] font-semibold" style={{ color: textSecondary }}>
                                                                                    Início Almoço
                                                                                </span>
                                                                                <input
                                                                                    type="time"
                                                                                    value={dayConfig.lunchStart}
                                                                                    onChange={(e) => updateDaySetting(day.id, 'lunchStart', e.target.value)}
                                                                                    className="w-full p-2 rounded-full border text-sm"
                                                                                    style={{
                                                                                        borderColor: colors.border,
                                                                                        background: colors.surface,
                                                                                        color: textPrimary,
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1">
                                                                                <span className="text-[10px] font-semibold" style={{ color: textSecondary }}>
                                                                                    Fim Almoço
                                                                                </span>
                                                                                <input
                                                                                    type="time"
                                                                                    value={dayConfig.lunchEnd}
                                                                                    onChange={(e) => updateDaySetting(day.id, 'lunchEnd', e.target.value)}
                                                                                    className="w-full p-2 rounded-full border text-sm"
                                                                                    style={{
                                                                                        borderColor: colors.border,
                                                                                        background: colors.surface,
                                                                                        color: textPrimary,
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {/* Datas bloqueadas */}
                                            <div>
                                                <label className="font-bold text-sm block mb-2" style={{ color: textPrimary }}>
                                                    Datas Bloqueadas / Indisponíveis
                                                </label>
                                                <div className="flex gap-2 mb-3">
                                                    <input
                                                        type="date"
                                                        value={blockedDateInput}
                                                        onChange={(e) => setBlockedDateInput(e.target.value)}
                                                        className="flex-1 p-3 rounded-full border text-sm"
                                                        style={{
                                                            borderColor: colors.border,
                                                            background: colors.surface,
                                                            color: textPrimary,
                                                        }}
                                                    />
                                                    <button
                                                        onClick={addBlockedDate}
                                                        style={{
                                                            ...pillButtonStyle,
                                                            background: GRADIENT,
                                                            color: '#ffffff',
                                                        }}
                                                        className="hover:opacity-80 transition-opacity"
                                                    >
                                                        Bloquear
                                                    </button>
                                                </div>
                                                {blockedDates.length > 0 && (
                                                    <div
                                                        className="flex flex-wrap gap-2 p-3 rounded-2xl max-h-32 overflow-y-auto"
                                                        style={{
                                                            border: `1px solid ${colors.border}`,
                                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        }}
                                                    >
                                                        {blockedDates.map((d) => {
                                                            const [year, month, day] = d.split('-')
                                                            const formatted = `${day}/${month}/${year}`
                                                            return (
                                                                <span
                                                                    key={d}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                                                                    style={{
                                                                        background: '#ef444420',
                                                                        color: '#ef4444',
                                                                    }}
                                                                >
                                                                    {formatted}
                                                                    <button
                                                                        onClick={() => removeBlockedDate(d)}
                                                                        className="hover:text-red-700 transition-colors"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Botões de ação - PILL */}
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={cancelHoursEditing}
                                                    style={{
                                                        ...pillButtonFullStyle,
                                                        background: 'transparent',
                                                        border: `2px solid ${colors.border}`,
                                                        color: textSecondary,
                                                    }}
                                                    className="hover:opacity-70 transition-opacity"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={saveHoursConfig}
                                                    disabled={hoursSaving}
                                                    style={{
                                                        ...pillButtonFullStyle,
                                                        background: GRADIENT,
                                                        color: '#ffffff',
                                                        opacity: hoursSaving ? 0.7 : 1,
                                                    }}
                                                    className="hover:opacity-80 transition-opacity"
                                                >
                                                    {hoursSaving ? 'Salvando...' : 'Salvar'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
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
