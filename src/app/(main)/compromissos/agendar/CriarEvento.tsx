// app/(main)/compromissos/agendar/CriarEvento.tsx
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
    Store,
    Megaphone,
    Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { Spinner } from '@/components/Spinner'

/* ============= HELPERS ============= */
const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return n.toString().padStart(2, '0') }

interface Props {
    onBack: () => void
    context?: 'pessoal' | 'loja'
    storeId?: string
    activeFlow: 'evento-perfil' | 'evento-loja'
    myStores?: any[]
}

export default function CriarEvento({ onBack, context, storeId, activeFlow, myStores }: Props) {
    const { colors } = useTheme()
    const { refetch } = useAppointments()
    const { userId } = useProfile()

    // Estados do tema/fundo
    const [bgMode, setBgMode] = useState<'animated' | 'black' | 'custom'>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
    const [userProfileSlug, setUserProfileSlug] = useState<string | null>(null)

    const [step, setStep] = useState<'details' | 'confirm'>('details')
    const [eventTitle, setEventTitle] = useState('')
    const [eventDescription, setEventDescription] = useState('')
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string>('19:00')
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const [selectedDuration, setSelectedDuration] = useState<number>(120) // Default 2 hours
    const [capacity, setCapacity] = useState<number>(50) // Default capacity 50
    const [isPublic, setIsPublic] = useState(true) // Events usually default to public

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Carrega dados do perfil e fundo
    useEffect(() => {
        if (!userId) return
        supabase
            .from('profiles')
            .select('avatar_url, profileSlug, background_mode, background_image_url')
            .eq('id', userId)
            .single()
            .then(({ data }) => {
                if (data) {
                    if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
                    if (data.profileSlug) setUserProfileSlug(data.profileSlug)
                    if (data.background_mode) setBgMode(data.background_mode)
                    if (data.background_image_url) setCustomBgUrl(data.background_image_url)
                }
            })
    }, [userId])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const goBack = () => {
        if (step === 'confirm') setStep('details')
        else onBack()
    }

    async function handleConfirm() {
        if (!eventTitle.trim()) { alert('Por favor, digite o título do evento.'); return }
        if (!selectedDate) { alert('Por favor, selecione uma data.'); return }
        if (!selectedTime) { alert('Por favor, selecione um horário.'); return }

        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) { alert('Você precisa estar logado.'); setSubmitting(false); return }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const title = eventTitle.trim()

        const { data: myProfile } = await supabase.from('profiles').select('profileSlug, avatar_url').eq('id', uid).single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''

        if (activeFlow === 'evento-loja' && storeId) {
            // Evento de loja
            const { data: store } = await supabase
                .from('stores')
                .select('owner_id, storeSlug, name, logo_url')
                .eq('id', storeId)
                .single()
            if (!store) { alert('Loja não encontrada.'); setSubmitting(false); return }

            const storeEvent = {
                store_id: storeId,
                store_slug: store.storeSlug,
                store_name: store.name,
                store_logo_url: store.logo_url || '',
                provider_profile_id: store.owner_id,
                date: dateStr,
                time: selectedTime,
                duration_minutes: selectedDuration,
                service_name: `[EVENTO] ${title}`,
                service_type: 'service',
                people_count: capacity,
                customer_id: uid,
                customer_slug: slug,
                customer_avatar_url: myAvatar,
                owner_id: store.owner_id,
                owner_slug: store.storeSlug,
                status: 'confirmed',
                direction: 'outgoing',
                is_public: isPublic,
            }
            const { error } = await supabase.from('appointments').insert(storeEvent)
            if (error) { alert(`Erro ao criar evento: ${error.message}`); setSubmitting(false); return }
        } else {
            // Evento de perfil
            const personalEvent = {
                provider_profile_id: uid,
                date: dateStr,
                time: selectedTime,
                duration_minutes: selectedDuration,
                service_name: `[EVENTO] ${title}`,
                service_type: 'service',
                people_count: capacity,
                customer_id: uid,
                customer_slug: slug,
                customer_avatar_url: myAvatar,
                owner_id: uid,
                owner_slug: slug,
                status: 'confirmed',
                direction: 'outgoing',
                is_public: isPublic,
            }
            const { error } = await supabase.from('appointments').insert(personalEvent)
            if (error) { alert(`Erro ao criar evento: ${error.message}`); setSubmitting(false); return }
        }

        await refetch()
        onBack()
    }

    const getPublicUrl = (path: string | null | undefined, bucket: 'avatars' | 'store-logos' | 'stores'): string | null => {
        if (!path) return null
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    const cardStyle = {
        background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    // Abas do Header
    const tabs = useMemo(() => {
        const personalTab = {
            id: 'pessoal',
            label: userProfileSlug ? `@${userProfileSlug}` : 'Perfil',
            icon: User as any,
            imageUrl: getPublicUrl(userAvatarUrl, 'avatars'),
            onClick: () => { },
            isActive: activeFlow !== 'evento-loja',
        }

        const storeTabs = (myStores || []).map((store) => ({
            id: store.id,
            label: store.name,
            icon: Store as any,
            imageUrl: getPublicUrl(store.logo_url, 'store-logos'),
            onClick: () => { },
            isActive: activeFlow === 'evento-loja' && store.id === storeId,
        }))

        return [personalTab, ...storeTabs]
    }, [userProfileSlug, userAvatarUrl, myStores, activeFlow, storeId])

    return (
        <main style={{ minHeight: '100vh', background: colors.background, paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />

            <div className="relative z-10">
                <Header
                    title="Promover evento"
                    showBack={true}
                    onBack={goBack}
                    greeting={activeFlow === 'evento-loja' ? 'Divulgue um evento da loja' : 'Crie um evento público ou privado'}
                    avatarUrl={getPublicUrl(userAvatarUrl, 'avatars')}
                    tabs={tabs}
                    showSearch={false}
                    onHomeClick={() => onBack()}
                />

                <div className="px-5 pt-0">
                    {step === 'details' && (
                        <div className="flex flex-col gap-6">
                            {/* FORMULÁRIO DE DETALHES */}
                            <div className="rounded-2xl p-6" style={cardStyle}>
                                <div className="flex items-center gap-4 mb-6">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                            color: colors.accentText,
                                        }}
                                    >
                                        <Megaphone size={18} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black" style={{ color: colors.textPrimary }}>Novo Evento</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                                            {activeFlow === 'evento-loja' ? 'Evento hospedado pela sua loja' : 'Evento no seu perfil'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Nome do Evento</label>
                                        <input
                                            type="text"
                                            value={eventTitle}
                                            onChange={(e) => setEventTitle(e.target.value)}
                                            placeholder="Ex: Inauguração, Workshop, Show..."
                                            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                            style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Descrição / Informações</label>
                                        <textarea
                                            value={eventDescription}
                                            onChange={(e) => setEventDescription(e.target.value)}
                                            placeholder="Detalhes sobre o evento, atrações, requisitos..."
                                            rows={3}
                                            className="w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none"
                                            style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary, fontFamily: 'inherit' }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Horário de Início</label>
                                            <input
                                                type="time"
                                                value={selectedTime}
                                                onChange={(e) => setSelectedTime(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Duração</label>
                                            <select
                                                value={selectedDuration}
                                                onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                            >
                                                <option value={30}>30 min</option>
                                                <option value={60}>1 hora</option>
                                                <option value={90}>1h30 min</option>
                                                <option value={120}>2 horas</option>
                                                <option value={180}>3 horas</option>
                                                <option value={240}>4 horas</option>
                                                <option value={360}>6 horas</option>
                                                <option value={480}>8 horas</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold uppercase block mb-2" style={{ color: colors.textSecondary }}>Capacidade Máxima (Pessoas)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={capacity}
                                                onChange={(e) => setCapacity(Number(e.target.value))}
                                                placeholder="Sem limite"
                                                className="w-full py-2 pl-9 pr-3 rounded-lg border text-sm focus:outline-none"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                            />
                                            <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CALENDÁRIO */}
                            <div className="rounded-2xl p-6" style={cardStyle}>
                                <h4 className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: colors.textPrimary }}>Selecione a Data</h4>
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
                                        const isPast = dateStr < todayStr
                                        const isSelected = selectedDate?.toDateString() === date.toDateString()
                                        return (
                                            <button
                                                key={dia}
                                                disabled={isPast}
                                                onClick={() => setSelectedDate(date)}
                                                className="h-[42px] rounded-xl font-semibold text-sm"
                                                style={{
                                                    border: isSelected ? `2px solid ${colors.accent}` : 'none',
                                                    background: isSelected ? colors.accent : isPast ? 'transparent' : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                    color: isSelected ? colors.accentText : isPast ? colors.textSecondary : colors.textPrimary,
                                                    cursor: isPast ? 'default' : 'pointer',
                                                }}
                                            >
                                                {dia}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* BOTAO AVANÇAR */}
                            <button
                                onClick={() => {
                                    if (!eventTitle.trim()) { alert('Por favor, digite o título do evento.'); return }
                                    if (!selectedDate) { alert('Por favor, selecione uma data.'); return }
                                    setStep('confirm')
                                }}
                                className="w-full rounded-full font-black uppercase text-sm tracking-wider py-4 flex items-center justify-center gap-2 cursor-pointer transition hover:scale-105 active:scale-95 border-none"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    color: colors.accentText,
                                    boxShadow: `0 4px 14px ${colors.accent}60`,
                                }}
                            >
                                Avançar <ChevronRight size={20} />
                            </button>
                        </div>
                    )}

                    {/* CONFIRMAÇÃO */}
                    {step === 'confirm' && selectedDate && (
                        <div className="rounded-2xl p-7" style={cardStyle}>
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    boxShadow: `0 10px 30px ${colors.accent}40`,
                                }}
                            >
                                <Megaphone size={28} color={colors.accentText} />
                            </div>
                            <h2 className="text-center text-xl font-black tracking-tight mb-3" style={{ color: colors.textPrimary }}>
                                {eventTitle}
                            </h2>
                            {eventDescription && (
                                <p className="text-center text-sm mb-6" style={{ color: colors.textSecondary }}>
                                    {eventDescription}
                                </p>
                            )}

                            <div className="flex flex-col gap-3 mb-7">
                                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <Calendar size={22} color={colors.accent} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Data</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                                            {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <Clock size={22} color={colors.accent} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Horário & Duração</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>{selectedTime} • {selectedDuration} min ({selectedDuration / 60}h)</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <Users size={22} color={colors.accent} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Capacidade Máxima</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>{capacity} pessoas</p>
                                    </div>
                                </div>

                                {/* Toggle público/privado */}
                                <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                                            {isPublic ? 'Evento público' : 'Evento privado'}
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
                                {submitting ? 'Divulgando evento...' : 'Confirmar Evento'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}
