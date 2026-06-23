// app/(main)/compromissos/agendar/CriarEvento.tsx
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
    Store,
    Megaphone,
    Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'

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
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                supabase
                    .from('profiles')
                    .select('avatar_url, profileSlug, background_mode, background_image_url')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data }) => {
                        if (data) {
                            if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
                            if (data.profileSlug) setUserProfileSlug(data.profileSlug)
                            if (data.background_mode) setBgMode(data.background_mode)
                            if (data.background_image_url) setCustomBgUrl(data.background_image_url)
                        }
                    })
            }
        })
    }, [])

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

                <div style={{ padding: '20px 20px 0' }}>
                    {step === 'details' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* FORMULÁRIO DE DETALHES */}
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                                    <div style={{
                                        width: 52, height: 52, borderRadius: 16,
                                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: colors.accentText,
                                    }}>
                                        <Megaphone size={24} />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 800, fontSize: 18, color: colors.textPrimary }}>Novo Evento</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>
                                            {activeFlow === 'evento-loja' ? 'Evento hospedado pela sua loja' : 'Evento no seu perfil'}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div>
                                        <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Nome do Evento</label>
                                        <input
                                            type="text"
                                            value={eventTitle}
                                            onChange={(e) => setEventTitle(e.target.value)}
                                            placeholder="Ex: Inauguração, Workshop, Show..."
                                            style={{
                                                width: '100%', padding: '14px 18px', borderRadius: 16,
                                                border: `1px solid ${colors.border}`, fontSize: 15,
                                                outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                color: colors.textPrimary,
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Descrição / Informações</label>
                                        <textarea
                                            value={eventDescription}
                                            onChange={(e) => setEventDescription(e.target.value)}
                                            placeholder="Detalhes sobre o evento, atrações, requisitos..."
                                            rows={3}
                                            style={{
                                                width: '100%', padding: '14px 18px', borderRadius: 16,
                                                border: `1px solid ${colors.border}`, fontSize: 15,
                                                outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                color: colors.textPrimary, resize: 'none', fontFamily: 'inherit'
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Horário de Início</label>
                                            <input
                                                type="time"
                                                value={selectedTime}
                                                onChange={(e) => setSelectedTime(e.target.value)}
                                                style={{
                                                    width: '100%', padding: '12px 16px', borderRadius: 14,
                                                    border: `1px solid ${colors.border}`, fontSize: 15,
                                                    outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                    color: colors.textPrimary,
                                                }}
                                            />
                                        </div>

                                        <div>
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

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Capacidade Máxima (Pessoas)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="number"
                                                    value={capacity}
                                                    onChange={(e) => setCapacity(Number(e.target.value))}
                                                    placeholder="Sem limite"
                                                    style={{
                                                        width: '100%', padding: '12px 16px 12px 42px', borderRadius: 14,
                                                        border: `1px solid ${colors.border}`, fontSize: 15,
                                                        outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                        color: colors.textPrimary,
                                                    }}
                                                />
                                                <Users size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CALENDÁRIO */}
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24 }}>
                                <h4 style={{ fontWeight: 800, fontSize: 17, color: colors.textPrimary, marginBottom: 16 }}>Selecione a Data</h4>
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
                                        const isPast = dateStr < todayStr
                                        const isSelected = selectedDate?.toDateString() === date.toDateString()
                                        return (
                                            <button
                                                key={dia}
                                                disabled={isPast}
                                                onClick={() => setSelectedDate(date)}
                                                style={{
                                                    height: 42,
                                                    border: isSelected ? `2px solid ${colors.accent}` : 'none',
                                                    borderRadius: 14,
                                                    background: isSelected ? colors.accent : isPast ? 'transparent' : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                                    color: isSelected ? colors.accentText : isPast ? colors.textSecondary : colors.textPrimary,
                                                    cursor: isPast ? 'default' : 'pointer',
                                                    fontWeight: 600, fontSize: 15,
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
                                    boxShadow: `0 12px 35px ${colors.accent}40`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                            >
                                Avançar <ChevronRight size={20} />
                            </button>
                        </div>
                    )}

                    {/* CONFIRMAÇÃO */}
                    {step === 'confirm' && selectedDate && (
                        <div style={{ ...cardStyle, borderRadius: 28, padding: 28 }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: 20,
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 24px', boxShadow: `0 10px 30px ${colors.accent}40`,
                            }}>
                                <Megaphone size={34} color={colors.accentText} />
                            </div>
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, color: colors.textPrimary, marginBottom: 12 }}>
                                {eventTitle}
                            </h2>
                            {eventDescription && (
                                <p style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 15, marginBottom: 24 }}>
                                    {eventDescription}
                                </p>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: 18, border: `1px solid ${colors.border}`,
                                }}>
                                    <Calendar size={22} color={colors.accent} />
                                    <div>
                                        <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Data</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>
                                            {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </p>
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: 18, border: `1px solid ${colors.border}`,
                                }}>
                                    <Clock size={22} color={colors.accent} />
                                    <div>
                                        <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Horário & Duração</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>{selectedTime} • {selectedDuration} min ({selectedDuration / 60}h)</p>
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: 18, border: `1px solid ${colors.border}`,
                                }}>
                                    <Users size={22} color={colors.accent} />
                                    <div>
                                        <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Capacidade Máxima</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>{capacity} pessoas</p>
                                    </div>
                                </div>

                                {/* Toggle público/privado */}
                                <div style={{
                                    background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                    borderRadius: 18, padding: '10px 14px', border: `1px solid ${colors.border}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: 15 }}>
                                            {isPublic ? 'Evento público' : 'Evento privado'}
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
                                <Check size={22} />{submitting ? 'Divulgando evento...' : 'Confirmar Evento'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}
