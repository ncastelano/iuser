// app/(main)/compromissos/agendar/CriarCompromissoPessoal.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'

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
    const [userId, setUserId] = useState<string | null>(null)

    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Carrega dados do perfil e fundo
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const uid = session.user.id
                setUserId(uid)
                supabase
                    .from('profiles')
                    .select('avatar_url, profileSlug, background_mode, background_image_url, working_hours')
                    .eq('id', uid)
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
            }
        })
    }, [])

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
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }

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

                <div style={{ padding: '20px 20px 0' }}>
                    {step === 'datetime' && (
                        <>
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24, marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    <div style={{
                                        width: 52, height: 52, borderRadius: 16,
                                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: colors.accentText,
                                    }}>
                                        <Lock size={24} />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 800, fontSize: 18, color: colors.textPrimary }}>Compromisso pessoal</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>Visível apenas para você</p>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={appointmentNote}
                                    onChange={(e) => setAppointmentNote(e.target.value)}
                                    placeholder="Descrição do compromisso (opcional)"
                                    style={{
                                        width: '100%', padding: '14px 18px', borderRadius: 16,
                                        border: `1px solid ${colors.border}`, fontSize: 15,
                                        outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                        color: colors.textPrimary,
                                    }}
                                />
                                <div style={{ marginTop: 16 }}>
                                    <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Duração</label>
                                    <select
                                        value={selectedDuration}
                                        onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                        style={{
                                            width: '100%', padding: '12px 16px', borderRadius: 14,
                                            border: `1px solid ${colors.border}`, fontSize: 15,
                                            outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            color: colors.textPrimary,
                                        }}
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
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24, marginBottom: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) } else setCalendarMonth(m => m - 1) }} style={{ border: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`, borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                        <ChevronLeft size={20} color={colors.textPrimary} />
                                    </button>
                                    <strong style={{ fontSize: 19, color: colors.textPrimary, fontWeight: 800 }}>{meses[calendarMonth]} {calendarYear}</strong>
                                    <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) } else setCalendarMonth(m => m + 1) }} style={{ border: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`, borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
                                                style={{
                                                    height: 42,
                                                    border: isSelected ? `2px solid ${colors.accent}` : 'none',
                                                    borderRadius: 14,
                                                    background: bgStyle,
                                                    color: textColorStyle,
                                                    cursor: isPast ? 'default' : 'pointer',
                                                    position: 'relative', fontWeight: 600, fontSize: 15,
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
                                    <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 16, color: colors.textPrimary }}>Horários disponíveis</h3>
                                    {slotsLivres.length === 0 ? (
                                        <div style={{ ...cardStyle, borderRadius: 20, padding: 28, textAlign: 'center', color: colors.textSecondary, border: `1px dashed ${colors.border}` }}>
                                            Nenhum horário livre neste dia.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                                            {slotsLivres.map((time) => (
                                                <button
                                                    key={time}
                                                    onClick={() => { setSelectedTime(time); setStep('confirm') }}
                                                    style={{
                                                        padding: '16px 12px', borderRadius: 18,
                                                        border: selectedTime === time ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                                                        background: selectedTime === time ? colors.accent : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                        fontWeight: 700, cursor: 'pointer', color: selectedTime === time ? colors.accentText : colors.textPrimary,
                                                        fontSize: 15,
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
                        <div style={{ ...cardStyle, borderRadius: 28, padding: 28 }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: 20,
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 24px', boxShadow: `0 10px 30px ${colors.accent}40`,
                            }}>
                                <Lock size={34} color={colors.accentText} />
                            </div>
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, color: colors.textPrimary, marginBottom: 12 }}>{appointmentNote || 'Compromisso pessoal'}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: 18, border: `1px solid ${colors.border}`,
                                }}>
                                    <Calendar size={22} color={colors.accent} />
                                    <div>
                                        <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Data</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: 18, border: `1px solid ${colors.border}`,
                                }}>
                                    <Clock size={22} color={colors.accent} />
                                    <div>
                                        <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Horário</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>{selectedTime}</p>
                                    </div>
                                </div>

                                {/* Toggle público/privado */}
                                <div style={{
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: '10px 14px', border: `1px solid ${colors.border}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: 15 }}>
                                            {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 4, background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)`, borderRadius: 16, padding: 3 }}>
                                            <button onClick={() => setIsPublic(false)} style={{
                                                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                                                borderRadius: 14, border: 'none',
                                                background: !isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                color: !isPublic ? colors.accentText : colors.textSecondary,
                                                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                                            }}><Lock size={14} /><span>Privado</span></button>
                                            <button onClick={() => setIsPublic(true)} style={{
                                                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                                                borderRadius: 14, border: 'none',
                                                background: isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                color: isPublic ? colors.accentText : colors.textSecondary,
                                                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                                            }}><Earth size={14} /><span>Público</span></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleConfirm}
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    color: colors.accentText,
                                    border: 'none',
                                    borderRadius: 20,
                                    padding: '18px 20px',
                                    fontWeight: 800,
                                    fontSize: 17,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    opacity: submitting ? 0.7 : 1,
                                    boxShadow: `0 12px 35px ${colors.accent}60`,
                                }}
                            >
                                <Check size={22} />{submitting ? 'Salvando...' : 'Confirmar'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}