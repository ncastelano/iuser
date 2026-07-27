// components/ProfileOperatingDays.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { X, Clock, ChevronDown, ChevronUp } from 'lucide-react'

interface ProfileOperatingDaysProps {
    profileId: string
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

const DEFAULT_WEEKLY = {
    '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '6': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
    '0': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function ProfileOperatingDays({ profileId }: ProfileOperatingDaysProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [isExpanded, setIsExpanded] = useState(false)
    const [weekly, setWeekly] = useState<any>(DEFAULT_WEEKLY)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const loadConfig = useCallback(async () => {
        if (!profileId) return
        const { data } = await supabase
            .from('profiles')
            .select('business_hours')
            .eq('id', profileId)
            .single()

        if (data?.business_hours) {
            const oh = data.business_hours
            setWeekly(oh.weekly ?? DEFAULT_WEEKLY)
            setBlockedDates(oh.blocked_dates ?? [])
        } else {
            setWeekly(DEFAULT_WEEKLY)
            setBlockedDates([])
        }
        setLoading(false)
    }, [profileId])

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

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

    const saveConfig = async () => {
        if (!profileId) return
        setSaving(true)

        const config = {
            weekly,
            blocked_dates: blockedDates,
        }

        const { error } = await supabase
            .from('profiles')
            .update({ business_hours: config })
            .eq('id', profileId)

        if (error) {
            alert('Erro ao salvar configurações.')
        } else {
            alert('Horários salvos!')
        }
        setSaving(false)
    }

    const cancelEditing = () => {
        loadConfig()
    }

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    // Contar quantos dias estão abertos
    const openDaysCount = Object.values(weekly).filter((day: any) => day.isOpen).length

    if (loading) {
        return (
            <div className="mb-6 mt-4">
                <div
                    className="rounded-2xl p-6 animate-pulse"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gray-200" />
                        <div className="h-6 w-32 bg-gray-200 rounded" />
                    </div>
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                            <div key={i} className="h-20 bg-gray-200 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-6 mt-4">
            <div
                className="rounded-2xl p-6 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho com toggle */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <Clock size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Horários de Atendimento
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {openDaysCount} dia{openDaysCount !== 1 ? 's' : ''} disponível{openDaysCount !== 1 ? 'is' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <>
                        {/* Subtítulo expandido */}
                        <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                            Defina os horários em que você está disponível para atendimento
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
                                        className="p-4 rounded-xl border"
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
                                                            Início
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
                                                            Fim
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
                        <div>
                            <label className="font-bold text-sm block mb-2" style={{ color: textPrimary }}>
                                Datas Bloqueadas / Indisponíveis
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

                        {/* Botões de ação */}
                        <div className="flex gap-3 mt-2">
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
                                onClick={saveConfig}
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                                style={{
                                    background: accentColor,
                                    color: colors.accentText,
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}