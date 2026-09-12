// app/(main)/compromissos/agendar/CriarCompromissoPessoal.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { hexToRgb } from '@/lib/color'
import {
    Calendar,
    Clock,
    Check,
    ChevronLeft,
    ChevronRight,
    Lock,
    Earth,
    User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { Spinner } from '@/components/Spinner'

/* ============= HELPERS ============= */
function toMinutes(timeStr: string): number { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m }
function fromMinutes(minutes: number): string { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}` }
const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return n.toString().padStart(2, '0') }

interface Props {
    onBack: () => void
    context?: 'pessoal' | 'loja'
    storeId?: string
}

export default function CriarCompromissoPessoal({ onBack }: Props) {
    const { colors } = useTheme()
    const { appointments, refetch } = useAppointments()
    const { userId } = useProfile()

    // Estados do tema/fundo
    const [bgMode, setBgMode] = useState<'animated' | 'black' | 'custom'>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
    const [userProfileSlug, setUserProfileSlug] = useState<string | null>(null)

    const [step, setStep] = useState<'datetime' | 'confirm'>('datetime')
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const [selectedDuration, setSelectedDuration] = useState<number>(60)
    const [scheduleConfig, setScheduleConfig] = useState<any>(null)

    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Carrega dados do perfil e fundo
    useEffect(() => {
        if (!userId) return
        supabase
            .from('profiles')
            .select('avatar_url, profileSlug, background_mode, background_image_url, working_hours')
            .eq('id', userId)
            .single()
            .then(({ data }) => {
                if (data) {
                    if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
                    if (data.profileSlug) setUserProfileSlug(data.profileSlug)
                    if (data.background_mode) setBgMode(data.background_mode)
                    if (data.background_image_url) setCustomBgUrl(data.background_image_url)
                    if (data.working_hours) setScheduleConfig(data.working_hours)
                }
            })
    }, [userId])

    // Horários livres
    const slotsLivres = useMemo(() => {
        if (!selectedDate) return []
        const dateStr = selectedDate.toISOString().split('T')[0]
        const config = scheduleConfig || {
            is_active: true, slot_interval: 60,
            weekly: {
                "1": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "2": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "3": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "4": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "5": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "6": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
                "0": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
            },
            blocked_dates: [],
        }
        if (!config.is_active || (config.blocked_dates && config.blocked_dates.includes(dateStr))) return []
        const dayOfWeek = selectedDate.getDay().toString()
        const dayConfig = config.weekly?.[dayOfWeek]
        if (!dayConfig || !dayConfig.isOpen) return []
        const slotInterval = config.slot_interval || 30
        const startMinutes = toMinutes(dayConfig.start || "08:00")
        const endMinutes = toMinutes(dayConfig.end || "18:00")
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
        const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null
        let relevantAppointments = appointments.filter(a =>
            a.date === dateStr && a.status !== 'cancelled' && !a.store_id &&
            (a.customer_id === userId || a.provider_profile_id === userId)
        )
        const list: string[] = []
        const now = new Date()
        const isToday = selectedDate.toDateString() === now.toDateString()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
            if (lunchStart !== null && lunchEnd !== null) {
                const slotEnd = m + selectedDuration
                if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue
            }
            if (isToday && m <= currentMinutes) continue
            const timeStr = fromMinutes(m)
            const overlaps = relevantAppointments.some(a => {
                const aStart = toMinutes(a.time)
                const aDuration = a.duration_minutes || 60
                const aEnd = aStart + aDuration
                const slotStart = m
                const slotEnd = m + selectedDuration
                return slotStart < aEnd && aStart < slotEnd
            })
            if (!overlaps) list.push(timeStr)
        }
        return list
    }, [selectedDate, appointments, scheduleConfig, selectedDuration, userId])

    const eventsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        appointments.filter(a => !a.store_id && (a.customer_id === userId || a.provider_profile_id === userId))
            .forEach(a => { map[a.date] = (map[a.date] || 0) + 1 })
        return map
    }, [appointments, userId])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else onBack()
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime) return
        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) { alert('Você precisa estar logado.'); setSubmitting(false); return }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Compromisso pessoal'
        const { data: myProfile } = await supabase.from('profiles').select('profileSlug, avatar_url').eq('id', uid).single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''
        const appointment = {
            provider_profile_id: uid,
            date: dateStr,
            time: selectedTime,
            duration_minutes: selectedDuration,
            service_name: note,
            service_type: 'service',
            people_count: 1,
            customer_id: uid,
            customer_slug: slug,
            customer_avatar_url: myAvatar,
            owner_id: uid,
            owner_slug: slug,
            status: 'confirmed',
            direction: 'outgoing',
            is_public: isPublic,
        }
        const { error } = await supabase.from('appointments').insert(appointment)
        if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
        await refetch()
        onBack()
    }

    const getPublicUrl = (path: string | null | undefined, bucket: 'avatars' | 'store-logos' | 'stores'): string | null => {
        if (!path) return null
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    // Helper para cores do tema

    const cardStyle = {
        background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    // Aba única para o Header
    const tabs = useMemo(() => {
        if (!userProfileSlug && !userAvatarUrl) return []
        return [{
            id: 'pessoal',
            label: userProfileSlug ? `@${userProfileSlug}` : 'Pessoal',
            icon: User as any,
            imageUrl: getPublicUrl(userAvatarUrl, 'avatars'),
            onClick: () => { },
            isActive: true,
        }]
    }, [userProfileSlug, userAvatarUrl])

    const getDateStatus = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0]
        if (dateStr < todayStr) return 'past'

        const config = scheduleConfig || {
            is_active: true, slot_interval: 60,
            weekly: {
                "1": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "2": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "3": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "4": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "5": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "6": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
                "0": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
            },
            blocked_dates: [],
        }
        if (!config.is_active || (config.blocked_dates && config.blocked_dates.includes(dateStr))) return 'closed'
        const dayOfWeek = date.getDay().toString()
        const dayConfig = config.weekly?.[dayOfWeek]
        if (!dayConfig || !dayConfig.isOpen) return 'closed'

        const slotInterval = config.slot_interval || 30
        const startMinutes = toMinutes(dayConfig.start || "08:00")
        const endMinutes = toMinutes(dayConfig.end || "18:00")
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
        const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

        let relevantAppointments = appointments.filter(a =>
            a.date === dateStr && a.status !== 'cancelled' && !a.store_id &&
            (a.customer_id === userId || a.provider_profile_id === userId)
        )

        let totalSlots = 0
        let freeSlots = 0
        const now = new Date()
        const isToday = date.toDateString() === now.toDateString()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()

        for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
            if (lunchStart !== null && lunchEnd !== null) {
                const slotEnd = m + selectedDuration
                if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue
            }
            if (isToday && m <= currentMinutes) continue
            totalSlots++

            const timeStr = fromMinutes(m)
            const overlaps = relevantAppointments.some(a => {
                const aStart = toMinutes(a.time)
                const aDuration = a.duration_minutes || 60
                const aEnd = aStart + aDuration
                const slotStart = m
                const slotEnd = m + selectedDuration
                return slotStart < aEnd && aStart < slotEnd
            })
            if (!overlaps) freeSlots++
        }

        if (totalSlots === 0) return 'closed'
        if (freeSlots === 0) return 'full'
        return 'available'
    }

    return (
        <main style={{ minHeight: '100vh', background: colors.background, paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />

            <div className="relative z-10">
                <Header
                    title={step === 'datetime' ? 'Novo compromisso pessoal' : 'Confirmar'}
                    showBack={true}
                    onBack={goBack}
                    greeting={step === 'datetime' ? 'Compromisso privado' : 'Revise os detalhes'}
                    avatarUrl={getPublicUrl(userAvatarUrl, 'avatars')}
                    tabs={tabs}
                    showSearch={false}
                    onHomeClick={() => onBack()}
                />

                <div className="px-5 pt-0">
                    {step === 'datetime' && (
                        <>
                            <div className="rounded-2xl p-6 mb-6" style={cardStyle}>
                                <div className="flex items-center gap-4 mb-5">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                            color: colors.accentText,
                                        }}
                                    >
                                        <Lock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black" style={{ color: colors.textPrimary }}>Compromisso pessoal</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>Visível apenas para você</p>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={appointmentNote}
                                    onChange={(e) => setAppointmentNote(e.target.value)}
                                    placeholder="Descrição do compromisso (opcional)"
                                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                    style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                />
                                <div className="mt-4">
                                    <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Duração</label>
                                    <select
                                        value={selectedDuration}
                                        onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                    >
                                        <option value={15}>15 min</option>
                                        <option value={30}>30 min</option>
                                        <option value={45}>45 min</option>
                                        <option value={60}>1h</option>
                                        <option value={90}>1h30</option>
                                        <option value={120}>2h</option>
                                        <option value={180}>3h</option>
                                        <option value={240}>4h</option>
                                    </select>
                                </div>
                            </div>

                            {/* CALENDÁRIO */}
                            <div className="rounded-2xl p-6 mb-6" style={cardStyle}>
                                <div className="flex justify-between items-center mb-5">
                                    <button
                                        onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) } else setCalendarMonth(m => m - 1) }}
                                        className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
                                        style={{ border: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)` }}
                                    >
                                        <ChevronLeft size={20} color={colors.textPrimary} />
                                    </button>
                                    <strong className="text-lg font-black" style={{ color: colors.textPrimary }}>{meses[calendarMonth]} {calendarYear}</strong>
                                    <button
                                        onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) } else setCalendarMonth(m => m + 1) }}
                                        className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
                                        style={{ border: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)` }}
                                    >
                                        <ChevronRight size={20} color={colors.textPrimary} />
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 10 }}>
                                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: colors.textSecondary }}>{d}</div>)}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                                    {Array.from({ length: primeiroDia }).map((_, i) => (<div key={i} />))}
                                    {Array.from({ length: diasDoMes }).map((_, i) => {
                                        const dia = i + 1
                                        const date = new Date(calendarYear, calendarMonth, dia)
                                        const dateStr = date.toISOString().split('T')[0]
                                        const count = eventsByDate[dateStr] || 0
                                        const isPast = dateStr < todayStr
                                        const isSelected = selectedDate?.toDateString() === date.toDateString()
                                        const status = getDateStatus(date)

                                        let bgStyle = `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`
                                        let textColorStyle = colors.textPrimary

                                        if (isSelected) {
                                            bgStyle = colors.accent
                                            textColorStyle = colors.accentText
                                        } else if (isPast) {
                                            bgStyle = 'transparent'
                                            textColorStyle = colors.textSecondary
                                        } else if (status === 'available') {
                                            bgStyle = 'rgba(59, 130, 246, 0.25)'
                                            textColorStyle = '#3b82f6'
                                        } else if (status === 'full') {
                                            bgStyle = 'rgba(239, 68, 68, 0.25)'
                                            textColorStyle = '#ef4444'
                                        }

                                        return (
                                            <button
                                                key={dia}
                                                disabled={isPast}
                                                onClick={() => { setSelectedDate(date); setSelectedTime(null) }}
                                                className="h-[42px] rounded-xl relative font-semibold text-sm"
                                                style={{
                                                    border: isSelected ? `2px solid ${colors.accent}` : 'none',
                                                    background: bgStyle,
                                                    color: textColorStyle,
                                                    cursor: isPast ? 'default' : 'pointer',
                                                }}
                                            >
                                                {dia}
                                                {count > 0 && (
                                                    <div style={{ position: 'absolute', top: -5, right: -5, background: colors.accent, color: colors.accentText, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                                                        {count}
                                                    </div>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {selectedDate && (
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: colors.textPrimary }}>Horários disponíveis</h3>
                                    {slotsLivres.length === 0 ? (
                                        <div className="rounded-xl p-7 text-center" style={{ ...cardStyle, color: colors.textSecondary, border: `1px dashed ${colors.border}` }}>
                                            Nenhum horário livre neste dia.
                                        </div>
                                    ) : (
                                        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                                            {slotsLivres.map((time) => (
                                                <button
                                                    key={time}
                                                    onClick={() => { setSelectedTime(time); setStep('confirm') }}
                                                    className="py-3 px-3 rounded-full font-bold cursor-pointer text-sm"
                                                    style={{
                                                        border: selectedTime === time ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                                                        background: selectedTime === time ? colors.accent : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                        color: selectedTime === time ? colors.accentText : colors.textPrimary,
                                                    }}
                                                >
                                                    {time}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* CONFIRMAÇÃO */}
                    {step === 'confirm' && selectedDate && selectedTime && (
                        <div className="rounded-2xl p-7" style={cardStyle}>
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    boxShadow: `0 10px 30px ${colors.accent}40`,
                                }}
                            >
                                <Lock size={28} color={colors.accentText} />
                            </div>
                            <h2 className="text-center text-xl font-black tracking-tight mb-3" style={{ color: colors.textPrimary }}>{appointmentNote || 'Compromisso pessoal'}</h2>
                            <div className="flex flex-col gap-3 mb-7">
                                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <Calendar size={22} color={colors.accent} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Data</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <Clock size={22} color={colors.accent} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Horário</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>{selectedTime}</p>
                                    </div>
                                </div>

                                {/* Toggle público/privado */}
                                <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                                            {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                        </span>
                                        <div className="flex gap-1 rounded-full p-1" style={{ background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)` }}>
                                            <button
                                                onClick={() => setIsPublic(false)}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-none text-xs font-bold uppercase tracking-wide cursor-pointer transition"
                                                style={{
                                                    background: !isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                    color: !isPublic ? colors.accentText : colors.textSecondary,
                                                    boxShadow: !isPublic ? `0 4px 14px ${colors.accent}60` : 'none',
                                                    transform: !isPublic ? 'scale(1.02)' : 'scale(1)',
                                                }}
                                            ><Lock size={14} /><span>Privado</span></button>
                                            <button
                                                onClick={() => setIsPublic(true)}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-none text-xs font-bold uppercase tracking-wide cursor-pointer transition"
                                                style={{
                                                    background: isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                    color: isPublic ? colors.accentText : colors.textSecondary,
                                                    boxShadow: isPublic ? `0 4px 14px ${colors.accent}60` : 'none',
                                                    transform: isPublic ? 'scale(1.02)' : 'scale(1)',
                                                }}
                                            ><Earth size={14} /><span>Público</span></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleConfirm}
                                disabled={submitting}
                                className="w-full rounded-full font-black uppercase text-sm tracking-wider py-4 flex items-center justify-center gap-2.5 cursor-pointer transition hover:scale-105 active:scale-95 disabled:opacity-50 border-none"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    color: colors.accentText,
                                    boxShadow: `0 4px 14px ${colors.accent}60`,
                                }}
                            >
                                {submitting ? <Spinner size={18} color={colors.accentText} /> : <Check size={20} />}
                                {submitting ? 'Salvando...' : 'Confirmar'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}