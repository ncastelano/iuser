// app/(main)/StoreOperatingDays.tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import { X, Clock, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react'
import { isStoreOpenNow, getStoreStatusWithLunch, getNextOpeningInfo } from '@/lib/storeHours'

interface StoreOperatingDaysProps {
    storeId: string
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

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
}

// ===== DIAS DA SEMANA PARA EXIBIÇÃO =====
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function StoreOperatingDays({ storeId }: StoreOperatingDaysProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [weekly, setWeekly] = useState<any>(DEFAULT_WEEKLY)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // ===== ESTADO PARA STATUS ATUAL =====
    const [isOpen, setIsOpen] = useState(false)
    const [statusText, setStatusText] = useState('')
    const [nextOpening, setNextOpening] = useState<{ day: string; time: string } | null>(null)
    const [todaySchedule, setTodaySchedule] = useState<{ start: string; end: string; hasLunch: boolean; lunchStart: string; lunchEnd: string } | null>(null)

    // ===== CORES BASEADAS NO STATUS =====
    const statusColor = useMemo(() => {
        if (isOpen) {
            return {
                primary: '#22c55e',
                glow: '0 0 20px rgba(34, 197, 94, 0.3), 0 0 40px rgba(34, 197, 94, 0.15)',
                border: '2px solid #22c55e',
                bg: 'rgba(34, 197, 94, 0.05)',
                text: '#22c55e'
            }
        } else {
            return {
                primary: '#ef4444',
                glow: '0 0 20px rgba(239, 68, 68, 0.3), 0 0 40px rgba(239, 68, 68, 0.15)',
                border: '2px solid #ef4444',
                bg: 'rgba(239, 68, 68, 0.05)',
                text: '#ef4444'
            }
        }
    }, [isOpen])

    const loadConfig = useCallback(async () => {
        if (!storeId) return
        const { data } = await supabase
            .from('stores')
            .select('business_hours')
            .eq('id', storeId)
            .single()

        if (data?.business_hours) {
            const oh = data.business_hours
            setWeekly(oh.weekly ?? DEFAULT_WEEKLY)
            setBlockedDates(oh.blocked_dates ?? [])

            // Atualiza status atual
            updateCurrentStatus(oh.weekly ?? DEFAULT_WEEKLY, oh.blocked_dates ?? [])
        } else {
            setWeekly(DEFAULT_WEEKLY)
            setBlockedDates([])
            updateCurrentStatus(DEFAULT_WEEKLY, [])
        }
        setLoading(false)
    }, [storeId])

    // ===== FUNÇÃO PARA ATUALIZAR STATUS ATUAL =====
    const updateCurrentStatus = (weeklyData: any, blocked: string[]) => {
        const now = new Date()
        const todayKey = String(now.getDay())
        const todayStr = now.toISOString().split('T')[0]

        // Verifica se hoje está bloqueado
        const isBlocked = blocked.includes(todayStr)

        // Pega a configuração de hoje
        const todayConfig = weeklyData[todayKey]
        const isOpenToday = todayConfig?.isOpen && !isBlocked

        // Verifica se está aberto agora
        const isOpenNow = isStoreOpenNow({ weekly: weeklyData, blocked_dates: blocked })

        // Pega o status com almoço
        const status = getStoreStatusWithLunch({ weekly: weeklyData, blocked_dates: blocked })

        // Pega a próxima abertura
        const next = getNextOpeningInfo({ weekly: weeklyData, blocked_dates: blocked })

        setIsOpen(isOpenNow)
        setStatusText(status.text)
        setNextOpening(next ? { day: next.dayLabel, time: next.time } : null)

        // Pega o horário de hoje
        if (todayConfig?.isOpen && !isBlocked) {
            setTodaySchedule({
                start: todayConfig.start || '08:00',
                end: todayConfig.end || '18:00',
                hasLunch: !!(todayConfig.lunchStart && todayConfig.lunchEnd),
                lunchStart: todayConfig.lunchStart || '',
                lunchEnd: todayConfig.lunchEnd || '',
            })
        } else {
            setTodaySchedule(null)
        }
    }

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

    // ===== REFRESH MANUAL =====
    const handleRefresh = () => {
        setIsRefreshing(true)
        loadConfig().finally(() => {
            setTimeout(() => setIsRefreshing(false), 500)
        })
    }

    const updateDaySetting = (dayId: string, field: string, value: any) => {
        setWeekly((prev: any) => {
            const newWeekly = {
                ...prev,
                [dayId]: { ...prev[dayId], [field]: value },
            }
            // Atualiza o status em tempo real
            updateCurrentStatus(newWeekly, blockedDates)
            return newWeekly
        })
    }

    const addBlockedDate = () => {
        if (!blockedDateInput) return
        if (blockedDates.includes(blockedDateInput)) return
        const newBlocked = [...blockedDates, blockedDateInput].sort()
        setBlockedDates(newBlocked)
        updateCurrentStatus(weekly, newBlocked)
        setBlockedDateInput('')
    }

    const removeBlockedDate = (dateStr: string) => {
        const newBlocked = blockedDates.filter((d) => d !== dateStr)
        setBlockedDates(newBlocked)
        updateCurrentStatus(weekly, newBlocked)
    }

    const saveConfig = async () => {
        if (!storeId) return
        setSaving(true)

        const config = {
            weekly,
            blocked_dates: blockedDates,
        }

        const { error } = await supabase
            .from('stores')
            .update({ business_hours: config })
            .eq('id', storeId)

        if (error) {
            toast.error('Erro ao salvar configurações: ' + error.message)
        } else {
            toast.success('Horários salvos!')
            // Atualiza o status após salvar
            updateCurrentStatus(weekly, blockedDates)
        }
        setSaving(false)
    }

    const cancelEditing = () => {
        loadConfig()
    }

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    // Contar dias abertos
    const openDaysCount = Object.values(weekly).filter((day: any) => day.isOpen).length

    // ===== OBTEM O DIA ATUAL =====
    const today = new Date()
    const todayName = DAY_NAMES[today.getDay()]

    if (loading) {
        return (
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
                    <div className="w-12 h-12 rounded-full bg-gray-200" />
                    <div className="h-6 w-32 bg-gray-200 rounded" />
                </div>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="h-20 bg-gray-200 rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div
            className="rounded-2xl p-6 flex flex-col gap-5 relative"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: statusColor.border || `1px solid ${colors.border}`,
                boxShadow: statusColor.glow || colors.shadow,
                animation: statusColor.primary !== 'transparent' ? 'borderPulse 2s ease-in-out infinite' : 'none',
                transition: 'all 0.5s ease',
            }}
        >
            {statusColor.primary !== 'transparent' && (
                <>
                    <style>{`
                        @keyframes borderPulse {
                            0%, 100% { 
                                box-shadow: ${statusColor.glow};
                                border-color: ${statusColor.primary};
                            }
                            50% { 
                                box-shadow: 0 0 30px ${statusColor.primary}60, 0 0 60px ${statusColor.primary}30;
                                border-color: ${statusColor.primary}dd;
                            }
                        }
                        @keyframes shimmer {
                            0% { transform: translateX(-100%) rotate(0deg); }
                            100% { transform: translateX(100%) rotate(0deg); }
                        }
                        .shimmer-border {
                            position: absolute;
                            top: -2px;
                            left: -2px;
                            right: -2px;
                            bottom: -2px;
                            border-radius: 1rem;
                            overflow: hidden;
                            pointer-events: none;
                        }
                        .shimmer-border::before {
                            content: '';
                            position: absolute;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: linear-gradient(
                                90deg,
                                transparent 0%,
                                ${statusColor.primary}33 25%,
                                ${statusColor.primary}66 50%,
                                ${statusColor.primary}33 75%,
                                transparent 100%
                            );
                            animation: shimmer 3s ease-in-out infinite;
                            transform: translateX(-100%);
                        }
                        @keyframes spin-smooth {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        .animate-spin-smooth {
                            animation: spin-smooth 0.8s linear infinite;
                        }
                    `}</style>
                    <div className="shimmer-border" />
                </>
            )}

            {/* Cabeçalho com toggle */}
            <div
                className="w-full flex items-center justify-between text-left relative z-10"
                style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '9999px',
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex-1 flex items-center justify-between text-left"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <Clock size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Dias de Funcionamento
                            </h3>
                            {/* ===== INFORMAÇÕES EM COLUNA (UM EMBAIXO DO OUTRO) ===== */}
                            <div className="flex flex-col gap-0.5 text-xs mt-1" style={{ color: textSecondary }}>
                                <span>
                                    <span className="font-bold" style={{ color: statusColor.text }}>
                                        {isOpen ? '🟢 Aberto' : '🔴 Fechado'}
                                    </span>
                                    {' • '}{statusText}
                                </span>
                                <span>
                                    {openDaysCount} dias abertos • {blockedDates.length} datas bloqueadas
                                </span>
                            </div>
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

                {/* Botão de refresh */}
                <button
                    onClick={handleRefresh}
                    className="ml-2 p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                    title="Atualizar"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <RefreshCw
                        size={16}
                        className={isRefreshing ? 'animate-spin-smooth' : ''}
                        style={{
                            color: isRefreshing ? statusColor.text : textSecondary,
                            transition: 'color 0.3s ease'
                        }}
                    />
                </button>
            </div>

            {isExpanded && (
                <>
                    {/* Horário de hoje */}
                    {todaySchedule && (
                        <div
                            className="p-3 rounded-2xl flex items-center gap-3 relative z-10"
                            style={{
                                background: `${statusColor.text}15`,
                                border: `1px solid ${statusColor.text}30`,
                            }}
                        >
                            <Clock size={16} style={{ color: statusColor.text }} />
                            <div className="flex flex-col">
                                <span className="text-xs font-bold" style={{ color: statusColor.text }}>
                                    {todayName} • {todaySchedule.start.slice(0, 5)} - {todaySchedule.end.slice(0, 5)}
                                </span>
                                {todaySchedule.hasLunch && (
                                    <span className="text-[10px]" style={{ color: textSecondary }}>
                                        Almoço {todaySchedule.lunchStart.slice(0, 5)} - {todaySchedule.lunchEnd.slice(0, 5)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {!todaySchedule && nextOpening && (
                        <div
                            className="p-3 rounded-2xl flex items-center gap-3 relative z-10"
                            style={{
                                background: '#ef444415',
                                border: '1px solid #ef444430',
                            }}
                        >
                            <AlertCircle size={16} style={{ color: '#ef4444' }} />
                            <div className="flex flex-col">
                                <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
                                    Fechado hoje
                                </span>
                                <span className="text-[10px] font-bold" style={{ color: '#f97316' }}>
                                    Abre {nextOpening.day} às {nextOpening.time}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Dias da semana */}
                    <div className="space-y-3 relative z-10">
                        {WEEKDAYS.map((day) => {
                            const dayConfig = weekly[day.id] || {
                                isOpen: false,
                                start: '08:00',
                                end: '18:00',
                                lunchStart: '',
                                lunchEnd: '',
                            }
                            const hasLunch = !!(dayConfig.lunchStart && dayConfig.lunchEnd)
                            const isToday = day.id === String(new Date().getDay())

                            return (
                                <div
                                    key={day.id}
                                    className="p-4 rounded-2xl border"
                                    style={{
                                        borderColor: isToday ? statusColor.text : colors.border,
                                        background: isToday
                                            ? `${statusColor.text}15`
                                            : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span
                                            className="font-bold text-sm"
                                            style={{
                                                color: isToday ? statusColor.text : (dayConfig.isOpen ? textPrimary : textSecondary),
                                            }}
                                        >
                                            {day.name} {isToday && <span className="text-[10px] font-normal">(hoje)</span>}
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
                                                        Entrada
                                                    </span>
                                                    <input
                                                        type="time"
                                                        value={dayConfig.start}
                                                        onChange={(e) => updateDaySetting(day.id, 'start', e.target.value)}
                                                        className="w-full p-2 rounded-xl border text-sm"
                                                        style={{
                                                            borderColor: colors.border,
                                                            background: colors.surface,
                                                            color: textPrimary,
                                                            borderRadius: '9999px',
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
                                                        className="w-full p-2 rounded-xl border text-sm"
                                                        style={{
                                                            borderColor: colors.border,
                                                            background: colors.surface,
                                                            color: textPrimary,
                                                            borderRadius: '9999px',
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
                                                            className="w-full p-2 rounded-xl border text-sm"
                                                            style={{
                                                                borderColor: colors.border,
                                                                background: colors.surface,
                                                                color: textPrimary,
                                                                borderRadius: '9999px',
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
                                                            className="w-full p-2 rounded-xl border text-sm"
                                                            style={{
                                                                borderColor: colors.border,
                                                                background: colors.surface,
                                                                color: textPrimary,
                                                                borderRadius: '9999px',
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
                    <div className="relative z-10">
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
                                    borderRadius: '9999px',
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
                                    const isBlockedToday = d === new Date().toISOString().split('T')[0]
                                    return (
                                        <span
                                            key={d}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                                            style={{
                                                background: isBlockedToday ? '#ef444440' : '#ef444420',
                                                color: isBlockedToday ? '#ef4444' : '#ef4444',
                                                border: isBlockedToday ? `1px solid #ef4444` : 'none',
                                            }}
                                        >
                                            {isBlockedToday && <AlertCircle size={10} />}
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
                    <div className="flex gap-3 mt-2 relative z-10">
                        <button
                            onClick={cancelEditing}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: 'transparent',
                                border: `2px solid ${colors.border}`,
                                color: textSecondary,
                            }}
                            className="hover:opacity-70 transition-opacity"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: GRADIENT,
                                color: '#ffffff',
                                opacity: saving ? 0.7 : 1,
                            }}
                            className="hover:opacity-80 transition-opacity"
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}