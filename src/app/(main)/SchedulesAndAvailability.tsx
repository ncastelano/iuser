'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, Earth, Lock, User, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppointments, useDeleteAppointment } from '@/app/(main)/compromissos/dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function formatTime(time: string) {
    return time.slice(0, 5)
}

interface SchedulesAndAvailabilityProps {
    storeId: string
}

const DEFAULT_SCHEDULE = {
    is_active: true,
    slot_interval: 60,
    weekly: {
        '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '6': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
        '0': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
    },
    blocked_dates: [] as string[],
}

const WEEKDAYS = [
    { id: '1', name: 'Segunda-feira' },
    { id: '2', name: 'Terça-feira' },
    { id: '3', name: 'Quarta-feira' },
    { id: '4', name: 'Quinta-feira' },
    { id: '5', name: 'Sexta-feira' },
    { id: '6', name: 'Sábado' },
    { id: '0', name: 'Domingo' },
]

export default function SchedulesAndAvailability({ storeId }: SchedulesAndAvailabilityProps) {
    const { colors } = useTheme()
    const { appointments, loading, refetch } = useAppointments()
    const { deleteAppointment } = useDeleteAppointment()

    // ---------- Expansão da configuração ----------
    const [isConfigExpanded, setIsConfigExpanded] = useState(false)
    const [configLoaded, setConfigLoaded] = useState(false)

    // ---------- Configuração de horários ----------
    const [availability, setAvailability] = useState(true)   // reflete allow_scheduling
    const [slotInterval, setSlotInterval] = useState(60)
    const [weekly, setWeekly] = useState<any>(DEFAULT_SCHEDULE.weekly)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [savingConfig, setSavingConfig] = useState(false)

    const loadAvailabilityConfig = useCallback(async () => {
        if (!storeId) return
        const { data } = await supabase
            .from('stores')
            .select('business_hours, allow_scheduling')   // ← CORRIGIDO: business_hours
            .eq('id', storeId)
            .single()
        if (data) {
            // Prioridade para allow_scheduling (master switch)
            const masterSwitch = data.allow_scheduling ?? true
            setAvailability(masterSwitch)

            const oh = data.business_hours as any   // ← CORRIGIDO
            if (oh) {
                setSlotInterval(oh.slot_interval ?? 60)
                setWeekly(oh.weekly ?? DEFAULT_SCHEDULE.weekly)
                setBlockedDates(oh.blocked_dates ?? [])
            } else {
                setSlotInterval(60)
                setWeekly(DEFAULT_SCHEDULE.weekly)
                setBlockedDates([])
            }
        } else {
            // fallback
            setAvailability(true)
            setSlotInterval(60)
            setWeekly(DEFAULT_SCHEDULE.weekly)
            setBlockedDates([])
        }
        setConfigLoaded(true)
    }, [storeId])

    useEffect(() => {
        if (isConfigExpanded && !configLoaded) {
            loadAvailabilityConfig()
        }
    }, [isConfigExpanded, configLoaded, loadAvailabilityConfig])

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

    const saveAvailability = async () => {
        if (!storeId) return
        setSavingConfig(true)

        // 1. Salvar configuração detalhada (business_hours)
        const config = {
            is_active: availability,
            slot_interval: Number(slotInterval),
            weekly,
            blocked_dates: blockedDates,
        }
        const update1 = supabase
            .from('stores')
            .update({ business_hours: config })   // ← CORRIGIDO
            .eq('id', storeId)

        // 2. Atualizar o master switch allow_scheduling para manter sincronia
        const update2 = supabase
            .from('stores')
            .update({ allow_scheduling: availability })
            .eq('id', storeId)

        const [res1, res2] = await Promise.all([update1, update2])

        if (res1.error || res2.error) {
            alert('Erro ao salvar configurações.')
        } else {
            alert('Horários salvos!')
        }
        setSavingConfig(false)
    }

    const cancelEditing = () => {
        loadAvailabilityConfig()
    }

    // ---------- Compromissos ----------
    const [userId, setUserId] = useState<string | null>(null)
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUserId(session.user.id)
        })
    }, [])

    const storeAppointments = useMemo(() => {
        if (!storeId) return []
        return appointments.filter((a) => a.store_id === storeId)
    }, [appointments, storeId])

    const sorted = useMemo(() => {
        return [...storeAppointments].sort((a, b) => {
            const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, cancelled: 2 }
            const orderA = statusOrder[a.status] ?? 3
            const orderB = statusOrder[b.status] ?? 3
            if (orderA !== orderB) return orderA - orderB

            const da = new Date(`${a.date}T${a.time}`)
            const db = new Date(`${b.date}T${b.time}`)
            return db.getTime() - da.getTime()
        })
    }, [storeAppointments])

    const handleAccept = useCallback(
        async (id: string, e: React.MouseEvent) => {
            e.stopPropagation(); e.preventDefault()
            const { error } = await supabase
                .from('appointments')
                .update({ status: 'confirmed' })
                .eq('id', id)
            if (!error) refetch()
            else alert('Erro ao aceitar.')
        },
        [refetch],
    )

    const handleDecline = useCallback(
        async (id: string, e: React.MouseEvent) => {
            e.stopPropagation(); e.preventDefault()
            const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
            if (!error) refetch()
        },
        [refetch],
    )

    const handleDelete = useCallback(
        async (id: string, e: React.MouseEvent) => {
            e.stopPropagation(); e.preventDefault()
            if (!confirm('Excluir este compromisso?')) return
            const success = await deleteAppointment(id)
            if (success) refetch()
        },
        [deleteAppointment, refetch],
    )

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const surfaceRgb = hexToRgb(colors.surface)

    const statusConfig = {
        confirmed: { bg: '#10b98133', text: '#6ee7b7', label: 'Confirmado' },
        pending: { bg: '#eab30833', text: '#fde047', label: 'Pendente' },
        cancelled: { bg: '#ef444433', text: '#fca5a5', label: 'Cancelado' },
    }

    const scrollbarThumbColor = `${accentColor}40`

    return (
        <div className="mb-6">
            {/* Cabeçalho da agenda */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-black flex items-center gap-2" style={{ color: textPrimary }}>
                    Agenda
                </h3>
            </div>

            {/* Lista de compromissos (horizontal scroll) */}
            {loading ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[280px] h-24 rounded-xl animate-pulse"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                            }}
                        />
                    ))}
                </div>
            ) : sorted.length === 0 ? (
                <div
                    className="rounded-2xl p-5 text-center"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`,
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <p className="text-sm" style={{ color: textSecondary }}>
                        Nenhum agendamento na loja.
                    </p>
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-3 pb-2 pl-2 pr-2 snap-x snap-mandatory scroll-container">
                    {sorted.map((appointment) => {
                        const status = appointment.status as 'confirmed' | 'pending' | 'cancelled'
                        const statusInfo = statusConfig[status] || statusConfig.pending
                        const isPending = status === 'pending'

                        const dateStr = new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                        })

                        const avatarUrl = appointment.customer_avatar_url || null
                        const customerName = appointment.customer_slug || 'Cliente'
                        const serviceName = appointment.service_name
                        const customerSlug = appointment.customer_slug || null
                        const duration = appointment.duration_minutes

                        return (
                            <div
                                key={appointment.id}
                                className="flex-shrink-0 w-[280px] snap-start flex items-center gap-3 p-3 rounded-xl border shadow-sm hover:shadow-md transition-all relative"
                                style={{
                                    background: colors.surface,
                                    borderColor: isPending ? '#fbbf2466' : colors.border,
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

                                {customerSlug ? (
                                    <Link href={`/${customerSlug}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
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
                                            {dateStr}
                                        </span>
                                        <span
                                            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                            style={{ background: statusInfo.bg, color: statusInfo.text }}
                                        >
                                            {statusInfo.label}
                                        </span>
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
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-xs flex items-center gap-1" style={{ color: textSecondary }}>
                                            <User size={10} />@{customerName}
                                        </p>
                                        {appointment.is_public !== undefined && (
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
                                                style={{
                                                    background: appointment.is_public ? 'rgba(16,185,129,0.2)' : `${textSecondary}20`,
                                                    color: appointment.is_public ? '#10b981' : textSecondary,
                                                }}
                                            >
                                                {appointment.is_public ? <Earth size={10} /> : <Lock size={10} />}
                                                {appointment.is_public ? 'Público' : 'Privado'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-sm font-black tabular-nums" style={{ color: accentColor }}>
                                            {formatTime(appointment.time)}
                                        </span>
                                        <div className="flex items-center gap-1">
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

            <style jsx>{`
        .scroll-container::-webkit-scrollbar {
          height: 6px;
        }
        .scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .scroll-container::-webkit-scrollbar-thumb {
          background-color: ${scrollbarThumbColor};
          border-radius: 9999px;
        }
        .scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: ${accentColor};
        }
        .scroll-container {
          scrollbar-width: thin;
          scrollbar-color: ${scrollbarThumbColor} transparent;
        }
      `}</style>

            {/* Card único: Horários e Disponibilidade */}
            <div
                className="mt-8 rounded-2xl border"
                style={{
                    background: colors.surface,
                    borderColor: colors.border,
                }}
            >
                <button
                    onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                    className="w-full flex items-center justify-between p-4 text-left"
                >
                    <span className="text-lg font-black" style={{ color: textPrimary }}>
                        Horários e disponibilidade da agenda
                    </span>
                    {isConfigExpanded ? <ChevronUp size={22} color={textPrimary} /> : <ChevronDown size={22} color={textPrimary} />}
                </button>

                {isConfigExpanded && (
                    <div className="px-4 pb-6">
                        {/* Toggle disponibilidade geral */}
                        <div
                            className="flex items-center justify-between p-4 rounded-xl mb-6"
                            style={{
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div>
                                <h4 className="font-bold text-base" style={{ color: textPrimary }}>
                                    Permitir Agendamentos
                                </h4>
                                <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                    Ativar ou desativar esta agenda para reservas
                                </p>
                            </div>
                            <label className="relative inline-flex cursor-pointer" style={{ width: 48, height: 26 }}>
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={availability}
                                    onChange={(e) => setAvailability(e.target.checked)}
                                />
                                <span
                                    className="absolute inset-0 rounded-full transition-colors duration-200"
                                    style={{ background: availability ? accentColor : colors.border }}
                                />
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${availability ? 'translate-x-[22px]' : 'translate-x-0'
                                        }`}
                                />
                            </label>
                        </div>

                        {availability && (
                            <>
                                {/* Dias da semana */}
                                <div className="mb-5 space-y-3">
                                    <label className="font-bold text-sm block" style={{ color: textPrimary }}>
                                        Dias de Funcionamento
                                    </label>
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
                                                className="p-4 rounded-xl border"
                                                style={{
                                                    borderColor: colors.border,
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
                                                            style={{ background: dayConfig.isOpen ? accentColor : colors.border }}
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
                                                                    Entrada
                                                                </span>
                                                                <input
                                                                    type="time"
                                                                    value={dayConfig.start}
                                                                    onChange={(e) => updateDaySetting(day.id, 'start', e.target.value)}
                                                                    className="w-full p-2 rounded-lg border text-sm"
                                                                    style={{
                                                                        borderColor: colors.border,
                                                                        background: colors.surface,
                                                                        color: textPrimary,
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <span className="text-[10px] font-semibold" style={{ color: textSecondary }}>
                                                                    Saída
                                                                </span>
                                                                <input
                                                                    type="time"
                                                                    value={dayConfig.end}
                                                                    onChange={(e) => updateDaySetting(day.id, 'end', e.target.value)}
                                                                    className="w-full p-2 rounded-lg border text-sm"
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
                                                                className="rounded"
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
                                                                        className="w-full p-2 rounded-lg border text-sm"
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
                                                                        className="w-full p-2 rounded-lg border text-sm"
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
                                <div className="mb-6">
                                    <label className="font-bold text-sm block mb-2" style={{ color: textPrimary }}>
                                        Datas Fechadas / Bloqueadas
                                    </label>
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="date"
                                            value={blockedDateInput}
                                            onChange={(e) => setBlockedDateInput(e.target.value)}
                                            className="flex-1 p-3 rounded-xl border text-sm"
                                            style={{
                                                borderColor: colors.border,
                                                background: colors.surface,
                                                color: textPrimary,
                                            }}
                                        />
                                        <button
                                            onClick={addBlockedDate}
                                            className="px-4 py-3 rounded-xl font-bold text-sm transition-colors"
                                            style={{ background: accentColor, color: colors.accentText }}
                                        >
                                            Bloquear
                                        </button>
                                    </div>
                                    {blockedDates.length > 0 && (
                                        <div
                                            className="flex flex-wrap gap-2 p-3 rounded-xl max-h-32 overflow-y-auto"
                                            style={{
                                                border: `1px solid ${colors.border}`,
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
                            </>
                        )}

                        {/* Botões de ação */}
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={cancelEditing}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors"
                                style={{
                                    background: 'transparent',
                                    border: `2px solid ${colors.border}`,
                                    color: textSecondary,
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveAvailability}
                                disabled={savingConfig}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                                style={{
                                    background: accentColor,
                                    color: colors.accentText,
                                    opacity: savingConfig ? 0.7 : 1,
                                }}
                            >
                                {savingConfig ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}