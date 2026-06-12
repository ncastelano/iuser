// app/(main)/compromissos/AgendarPage.tsx
'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Calendar,
    Clock,
    Check,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
    User,
    Store,
    Lock,
    Earth,
    Edit3,
    ShoppingBag,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'

function toMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
}

function fromMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function pad(n: number) {
    return n.toString().padStart(2, '0')
}

interface SearchTarget {
    type: 'store' | 'profile'
    id: string
    name: string
    slug: string
    avatar_url: string | null
    logo_url?: string | null   // para lojas
    owner_id?: string
}

interface Product {
    id: string
    name: string
    description?: string
    price?: number
}

// Helper para construir URL pública do Supabase Storage caso o campo não seja absoluto
function getPublicLogoUrl(logoUrl: string | null | undefined): string | null {
    if (!logoUrl) return null
    if (logoUrl.startsWith('http')) return logoUrl
    const { data } = supabase.storage.from('stores').getPublicUrl(logoUrl)
    return data?.publicUrl || null
}

// Helper para construir URL pública de avatar
function getPublicAvatarUrl(avatarUrl: string | null | undefined): string | null {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('http')) return avatarUrl
    const { data } = supabase.storage.from('avatars').getPublicUrl(avatarUrl)
    return data?.publicUrl || null
}

export default function AgendarPage() {
    const router = useRouter()
    const { appointments, refetch } = useAppointments()

    const [step, setStep] = useState<'type' | 'datetime' | 'confirm'>('type')
    const [targetType, setTargetType] = useState<'store' | 'profile' | 'self'>('self')
    const [target, setTarget] = useState<SearchTarget | null>(null)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const [selectedDuration, setSelectedDuration] = useState<number>(60)
    const [scheduleConfig, setScheduleConfig] = useState<any>(null)
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id)
            }
        })
    }, [])

    useEffect(() => {
        const loadScheduleConfig = async () => {
            if (targetType === 'self') {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.user) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('working_hours')
                        .eq('id', session.user.id)
                        .single()
                    if (data?.working_hours) {
                        setScheduleConfig(data.working_hours)
                        return
                    }
                }
            } else if (targetType === 'store' && target) {
                const { data } = await supabase
                    .from('stores')
                    .select('opening_hours')
                    .eq('id', target.id)
                    .single()
                if (data?.opening_hours) {
                    setScheduleConfig(data.opening_hours)
                    return
                }
            } else if (targetType === 'profile' && target) {
                const { data } = await supabase
                    .from('profiles')
                    .select('working_hours')
                    .eq('id', target.id)
                    .single()
                if (data?.working_hours) {
                    setScheduleConfig(data.working_hours)
                    return
                }
            }
            setScheduleConfig(null)
        }
        loadScheduleConfig()
    }, [target, targetType])

    const [searchQuery, setSearchQuery] = useState('')
    const [results, setResults] = useState<SearchTarget[]>([])
    const [searching, setSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const [showProducts, setShowProducts] = useState(false)
    const [storeProducts, setStoreProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [isEditingNote, setIsEditingNote] = useState(false)

    // Controle de imagens quebradas nos resultados da busca
    const [brokenImgIds, setBrokenImgIds] = useState<Set<string>>(new Set())
    const [targetImgError, setTargetImgError] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    const slotsLivres = useMemo(() => {
        if (!selectedDate) return []
        const dateStr = selectedDate.toISOString().split('T')[0]

        const config = scheduleConfig || {
            is_active: true,
            slot_interval: 60,
            weekly: {
                "1": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "2": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "3": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "4": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "5": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
                "6": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
                "0": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" }
            },
            blocked_dates: []
        }

        if (!config.is_active || (config.blocked_dates && config.blocked_dates.includes(dateStr))) {
            return []
        }

        const dayOfWeek = selectedDate.getDay().toString()
        const dayConfig = config.weekly?.[dayOfWeek]
        if (!dayConfig || !dayConfig.isOpen) {
            return []
        }

        const slotInterval = config.slot_interval || 30
        const startMinutes = toMinutes(dayConfig.start || "08:00")
        const endMinutes = toMinutes(dayConfig.end || "18:00")
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
        const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

        let relevantAppointments = appointments.filter(a => a.date === dateStr && a.status !== 'cancelled')
        if (targetType === 'store' && target) {
            relevantAppointments = relevantAppointments.filter(a => a.store_id === target.id)
        } else if (targetType === 'self') {
            relevantAppointments = relevantAppointments.filter(a => !a.store_id && (a.customer_id === userId || a.provider_profile_id === userId))
        } else if (targetType === 'profile' && target) {
            relevantAppointments = relevantAppointments.filter(a =>
                (a.customer_id === userId || a.provider_profile_id === userId) ||
                (a.customer_id === target.id || a.provider_profile_id === target.id)
            )
        }

        const list: string[] = []
        const now = new Date()
        const isToday = selectedDate.toDateString() === now.toDateString()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()

        for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
            if (lunchStart !== null && lunchEnd !== null) {
                const slotEnd = m + selectedDuration
                if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) {
                    continue
                }
            }

            if (isToday && m <= currentMinutes) {
                continue
            }

            const timeStr = fromMinutes(m)

            const overlaps = relevantAppointments.some(a => {
                const aStart = toMinutes(a.time)
                const aDuration = a.duration_minutes || 60
                const aEnd = aStart + aDuration
                const slotStart = m
                const slotEnd = m + selectedDuration

                return slotStart < aEnd && aStart < slotEnd
            })

            if (!overlaps) {
                list.push(timeStr)
            }
        }

        return list
    }, [selectedDate, appointments, targetType, target, scheduleConfig, selectedDuration, userId])

    const eventsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        let relevant = appointments
        if (targetType === 'store' && target) {
            relevant = appointments.filter(a => a.store_id === target.id)
        }
        relevant.forEach((a) => {
            map[a.date] = (map[a.date] || 0) + 1
        })
        return map
    }, [appointments, targetType, target])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    useEffect(() => {
        if (searchQuery.trim().length < 2 || targetType === 'self') {
            setResults([])
            setShowDropdown(false)
            return
        }
        const timer = setTimeout(async () => {
            setSearching(true)
            const query = searchQuery.trim()
            try {
                if (targetType === 'store') {
                    const { data: stores } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, owner_id, logo_url')
                        .or(`storeSlug.ilike.%${query}%,name.ilike.%${query}%`)
                        .neq('name', 'Meus compromissos')
                        .limit(5)

                    const merged: SearchTarget[] = (stores || []).map((s) => ({
                        type: 'store' as const,
                        id: s.id,
                        name: s.name || `@${s.storeSlug}`,
                        slug: s.storeSlug,
                        avatar_url: s.logo_url || null,
                        logo_url: s.logo_url,
                        owner_id: s.owner_id,
                    }))
                    setResults(merged)
                } else if (targetType === 'profile') {
                    const { data: session } = await supabase.auth.getSession()
                    const currentUserId = session?.session?.user?.id

                    let queryBuilder = supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .or(`profileSlug.ilike.%${query}%,name.ilike.%${query}%`)

                    if (currentUserId) {
                        queryBuilder = queryBuilder.neq('id', currentUserId)
                    }

                    const { data: profiles } = await queryBuilder.limit(5)

                    const merged: SearchTarget[] = (profiles || []).map((p) => ({
                        type: 'profile' as const,
                        id: p.id,
                        name: p.name || `@${p.profileSlug}`,
                        slug: p.profileSlug,
                        avatar_url: p.avatar_url,
                    }))
                    setResults(merged)
                }
                setShowDropdown(true)
                setBrokenImgIds(new Set())
            } catch (error) {
                console.error('Search error:', error)
            } finally {
                setSearching(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery, targetType])

    useEffect(() => {
        if (targetType === 'store' && target) {
            loadStoreProducts(target.id)
            setTargetImgError(false)
        } else {
            setStoreProducts([])
            setShowProducts(false)
            setSelectedProduct(null)
            setTargetImgError(false)
        }
    }, [target, targetType])

    async function loadStoreProducts(storeId: string) {
        setLoadingProducts(true)
        const { data } = await supabase
            .from('products')
            .select('id, name, description, price, duration_minutes')
            .eq('store_id', storeId)
            .eq('type', 'service')
            .limit(20)
        setStoreProducts(data || [])
        setLoadingProducts(false)
    }

    const selectTarget = (item: SearchTarget) => {
        setTarget(item)
        setSearchQuery('')
        setShowDropdown(false)
        setAppointmentNote('')
        setSelectedProduct(null)
        setShowProducts(false)
    }

    const selectSelf = () => {
        setTargetType('self')
        setTarget(null)
        setSearchQuery('')
        setShowDropdown(false)
        setAppointmentNote('')
        setSelectedProduct(null)
        setShowProducts(false)
        setStep('datetime')
    }

    const selectProduct = (product: Product) => {
        setSelectedProduct(product)
        setAppointmentNote(product.name)
        setIsEditingNote(false)
        setSelectedDuration((product as any).duration_minutes || 60)
    }

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else if (step === 'datetime') {
            if (target) {
                setTarget(null)
                setSearchQuery('')
            } else {
                setStep('type')
            }
        } else router.back()
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime) return
        setSubmitting(true)

        const { data: session } = await supabase.auth.getSession()
        const userId = session.session?.user?.id
        if (!userId) {
            alert('Você precisa estar logado.')
            setSubmitting(false)
            return
        }

        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Compromisso'

        const { data: myProfile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url')
            .eq('id', userId)
            .single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''

        try {
            if (targetType === 'self') {
                const appointment = {
                    provider_profile_id: userId,
                    date: dateStr,
                    time: selectedTime,
                    duration_minutes: selectedDuration,
                    service_name: note,
                    service_type: 'service',
                    people_count: 1,
                    customer_id: userId,
                    customer_slug: slug,
                    customer_avatar_url: myAvatar,
                    owner_id: userId,
                    owner_slug: slug,
                    status: 'confirmed',
                    direction: 'outgoing',
                    is_public: isPublic,
                }
                const { error } = await supabase.from('appointments').insert(appointment)
                if (error) throw error
                alert('Compromisso pessoal criado!')
            }
            else if (targetType === 'store' && target) {
                const { data: store } = await supabase
                    .from('stores')
                    .select('owner_id, storeSlug, name, logo_url')
                    .eq('id', target.id)
                    .single()

                if (!store) throw new Error('Loja não encontrada.')

                const storeOwnerId = store.owner_id
                const storeLogo = store.logo_url || ''

                const clientAppointment = {
                    store_id: target.id,
                    store_slug: target.slug,
                    store_name: target.name,
                    store_logo_url: storeLogo,
                    provider_profile_id: storeOwnerId,
                    date: dateStr,
                    time: selectedTime,
                    duration_minutes: selectedDuration,
                    service_name: note,
                    service_type: 'service',
                    people_count: 1,
                    customer_id: userId,
                    customer_slug: slug,
                    customer_avatar_url: myAvatar,
                    owner_id: storeOwnerId,
                    owner_slug: target.slug,
                    status: 'pending',
                    direction: 'outgoing',
                    is_public: isPublic,
                }
                const { error } = await supabase.from('appointments').insert(clientAppointment)
                if (error) throw error
                alert('Agendamento enviado para a loja!')
            }
            else if (targetType === 'profile' && target) {
                // Registro para mim (convidante, outgoing) – exibe o avatar do convidado
                const myAppointment = {
                    provider_profile_id: userId,
                    date: dateStr,
                    time: selectedTime,
                    duration_minutes: selectedDuration,
                    service_name: note,
                    service_type: 'service',
                    people_count: 1,
                    customer_id: userId,
                    customer_slug: slug,
                    customer_avatar_url: target.avatar_url || '',
                    owner_id: userId,
                    owner_slug: slug,
                    status: 'pending',
                    direction: 'outgoing',
                    is_public: isPublic,
                }

                // Registro para o convidado (incoming) - exibe o avatar do anfitrião
                const inviteAppointment = {
                    provider_profile_id: userId,
                    date: dateStr,
                    time: selectedTime,
                    duration_minutes: selectedDuration,
                    service_name: note,
                    service_type: 'service',
                    people_count: 1,
                    customer_id: target.id,
                    customer_slug: target.slug,
                    customer_avatar_url: myAvatar,
                    owner_id: userId,
                    owner_slug: slug,
                    status: 'pending',
                    direction: 'incoming',
                    is_public: isPublic,
                }

                const { error } = await supabase.from('appointments').insert([myAppointment, inviteAppointment])
                if (error) throw error
                alert(`Convite enviado para ${target.name}!`)
            }

            await refetch()
            router.push('/compromissos')
        } catch (err: any) {
            alert(`Erro: ${err.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    // ================= RENDER =================
    return (
        <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', paddingBottom: 40 }}>
            {/* HEADER */}
            <div style={{
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                padding: '28px 24px',
                color: '#fff',
                borderBottomLeftRadius: 36,
                borderBottomRightRadius: 36,
                boxShadow: '0 10px 40px rgba(124,58,237,0.25)',
            }}>
                <button onClick={goBack} style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    borderRadius: 14,
                    width: 42,
                    height: 42,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', backdropFilter: 'blur(10px)',
                }}>
                    <ArrowLeft size={22} color="#fff" />
                </button>
                <h1 style={{ fontSize: 34, fontWeight: 800, marginTop: 16, letterSpacing: '-0.5px' }}>
                    {step === 'type' && 'Novo compromisso'}
                    {step === 'datetime' && 'Data e horário'}
                    {step === 'confirm' && 'Confirmar'}
                </h1>
                <p style={{ opacity: 0.8, marginTop: 6, fontSize: 15, fontWeight: 500 }}>
                    {step === 'type' && 'Como será o compromisso?'}
                    {step === 'datetime' && (targetType === 'self' ? 'Compromisso pessoal' : target?.name || '')}
                    {step === 'confirm' && 'Revise os detalhes'}
                </p>
            </div>

            <div style={{ padding: '20px 20px 0' }}>
                {/* ETAPA 1: TIPO DE COMPROMISSO */}
                {step === 'type' && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{
                            background: '#fff',
                            borderRadius: 28,
                            padding: 28,
                            boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                            border: '1px solid rgba(0,0,0,0.04)',
                        }}>
                            <h3 style={{ fontWeight: 800, fontSize: 22, color: '#1e293b', marginBottom: 24, textAlign: 'center' }}>
                                Escolha o tipo
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <button onClick={() => { setTargetType('store'); setStep('datetime'); setSearchQuery(''); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: 18, borderRadius: 20,
                                    border: '2px solid #e2e8f0', background: '#fff',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#f97316'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                                >
                                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Store size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>Agendar em loja</p>
                                        <p style={{ color: '#64748b', fontSize: 14 }}>Barbearia, clínica, restaurante...</p>
                                    </div>
                                </button>

                                <button onClick={() => { setTargetType('profile'); setStep('datetime'); setSearchQuery(''); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: 18, borderRadius: 20,
                                    border: '2px solid #e2e8f0', background: '#fff',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                                >
                                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <User size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>Convidar pessoa</p>
                                        <p style={{ color: '#64748b', fontSize: 14 }}>Amigo, colega, profissional...</p>
                                    </div>
                                </button>

                                <button onClick={selectSelf} style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: 18, borderRadius: 20,
                                    border: '2px solid #e2e8f0', background: '#fff',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#10b981'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                                >
                                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Lock size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>Somente eu</p>
                                        <p style={{ color: '#64748b', fontSize: 14 }}>Compromisso pessoal e privado</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ETAPA 2: DATA E HORÁRIO + BUSCA */}
                {step === 'datetime' && (
                    <div style={{ marginTop: 24 }}>
                        {(targetType === 'store' || targetType === 'profile') && !target && (
                            <div style={{
                                background: '#fff', borderRadius: 28, padding: 24,
                                boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)', marginBottom: 24,
                            }}>
                                <h3 style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 16 }}>
                                    {targetType === 'store' ? 'Buscar loja' : 'Buscar pessoa'}
                                </h3>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={targetType === 'store' ? 'Nome da loja ou @...' : 'Nome ou @usuario...'}
                                        style={{
                                            width: '100%', padding: '16px 20px', borderRadius: 18,
                                            border: '2px solid #e2e8f0', fontSize: 16, outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box',
                                        }}
                                        autoFocus
                                    />
                                    {searching && (
                                        <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                                            <Search size={18} />
                                        </div>
                                    )}
                                    {showDropdown && results.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                                            marginTop: 8, zIndex: 10, maxHeight: 260, overflowY: 'auto',
                                            border: '1px solid #e2e8f0',
                                        }}>
                                            {results.map((item) => {
                                                const storeLogoUrl = item.logo_url ? getPublicLogoUrl(item.logo_url) : null
                                                const profileAvatarUrl = item.avatar_url ? getPublicAvatarUrl(item.avatar_url) : null
                                                const imageUrl = item.type === 'store' ? storeLogoUrl : profileAvatarUrl
                                                const isBroken = brokenImgIds.has(item.id)

                                                return (
                                                    <button key={`${item.type}-${item.id}`} onClick={() => selectTarget(item)}
                                                        style={{
                                                            width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
                                                            border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                                        }}>
                                                        {imageUrl && !isBroken ? (
                                                            <img
                                                                src={imageUrl}
                                                                alt={item.name}
                                                                style={{
                                                                    width: 42, height: 42, borderRadius: '50%',
                                                                    objectFit: 'cover', border: '2px solid #e2e8f0',
                                                                }}
                                                                onError={() => {
                                                                    setBrokenImgIds(prev => new Set(prev).add(item.id))
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: 42, height: 42, borderRadius: '50%',
                                                                background: item.type === 'store' ? 'linear-gradient(135deg, #f97316, #fbbf24)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800,
                                                            }}>
                                                                {item.type === 'store' ? <Store size={20} /> : <User size={20} />}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>{item.name}</p>
                                                            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>@{item.slug}</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {(target || targetType === 'self') && (
                            <>
                                <div style={{
                                    background: '#fff', borderRadius: 28, padding: 24,
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)', marginBottom: 24,
                                }}>
                                    {targetType === 'self' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                            <div style={{
                                                width: 52, height: 52, borderRadius: 16,
                                                background: 'linear-gradient(135deg, #10b981, #34d399)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                            }}>
                                                <Lock size={24} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>Compromisso pessoal</p>
                                                <p style={{ color: '#64748b', fontSize: 14 }}>Visível apenas para você</p>
                                            </div>
                                            <button onClick={() => { setTargetType('self'); setStep('type'); }} style={{
                                                background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                            }}>
                                                <X size={20} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                            {/* Mostra o avatar/logo da loja ou pessoa selecionada */}
                                            {(targetType === 'store' || targetType === 'profile') && target && (
                                                <>
                                                    {targetType === 'store' && target.logo_url && !targetImgError ? (
                                                        <img
                                                            src={getPublicLogoUrl(target.logo_url)!}
                                                            alt={target.name}
                                                            style={{
                                                                width: 52, height: 52, borderRadius: 16,
                                                                objectFit: 'cover', border: '2px solid #e2e8f0',
                                                            }}
                                                            onError={() => setTargetImgError(true)}
                                                        />
                                                    ) : targetType === 'profile' && target.avatar_url && !targetImgError ? (
                                                        <img
                                                            src={getPublicAvatarUrl(target.avatar_url)!}
                                                            alt={target.name}
                                                            style={{
                                                                width: 52, height: 52, borderRadius: 16,
                                                                objectFit: 'cover', border: '2px solid #e2e8f0',
                                                            }}
                                                            onError={() => setTargetImgError(true)}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: 52, height: 52, borderRadius: 16,
                                                            background: targetType === 'store' ? 'linear-gradient(135deg, #f97316, #fbbf24)' : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                                        }}>
                                                            {targetType === 'store' ? <Store size={24} /> : <User size={24} />}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>{target?.name}</p>
                                                <p style={{ color: '#64748b', fontSize: 14 }}>
                                                    {targetType === 'store' ? 'Agendamento na loja' : 'Convite pessoal'}
                                                </p>
                                            </div>
                                            <button onClick={() => { setTarget(null); setStep('type'); }} style={{
                                                background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                            }}>
                                                <X size={20} />
                                            </button>
                                        </div>
                                    )}

                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={appointmentNote}
                                            onChange={(e) => {
                                                setAppointmentNote(e.target.value)
                                                if (selectedProduct && e.target.value !== selectedProduct.name) {
                                                    setSelectedProduct(null)
                                                }
                                            }}
                                            placeholder="Descrição do compromisso (opcional)"
                                            style={{
                                                width: '100%', padding: '14px 18px', paddingRight: selectedProduct ? 40 : 18,
                                                borderRadius: 16,
                                                border: '2px solid #e2e8f0', fontSize: 15, outline: 'none',
                                                background: '#f8fafc', boxSizing: 'border-box',
                                            }}
                                        />
                                        {selectedProduct && (
                                            <button
                                                onClick={() => setIsEditingNote(!isEditingNote)}
                                                style={{
                                                    position: 'absolute',
                                                    right: 12,
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#7c3aed',
                                                }}
                                                title="Editar descrição"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Duração do compromisso */}
                                    {!selectedProduct && (
                                        <div style={{ marginTop: 16 }}>
                                            <label style={{ fontWeight: 700, fontSize: 14, color: '#475569', display: 'block', marginBottom: 8 }}>
                                                Duração do compromisso
                                            </label>
                                            <select
                                                value={selectedDuration}
                                                onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                                style={{
                                                    width: '100%', padding: '12px 16px', borderRadius: 14,
                                                    border: '2px solid #e2e8f0', fontSize: 15, outline: 'none',
                                                    background: '#fff'
                                                }}
                                            >
                                                <option value={15}>15 minutos</option>
                                                <option value={30}>30 minutos</option>
                                                <option value={45}>45 minutos</option>
                                                <option value={60}>1 hora (60 min)</option>
                                                <option value={90}>1 hora e 30 minutos (90 min)</option>
                                                <option value={120}>2 horas (120 min)</option>
                                                <option value={180}>3 horas (180 min)</option>
                                                <option value={240}>4 horas (240 min)</option>
                                            </select>
                                        </div>
                                    )}

                                    {selectedProduct && (
                                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#7c3aed', fontWeight: 700 }}>
                                            <span>⏱️ Duração estimada: {selectedDuration} minutos</span>
                                        </div>
                                    )}

                                    {targetType === 'store' && target && (
                                        <div style={{ marginTop: 16 }}>
                                            <button
                                                onClick={() => setShowProducts(!showProducts)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '10px 16px',
                                                    borderRadius: 14,
                                                    border: '2px solid #e2e8f0',
                                                    background: showProducts ? '#f5f3ff' : '#fff',
                                                    color: showProducts ? '#7c3aed' : '#64748b',
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <ShoppingBag size={18} />
                                                {showProducts ? 'Ocultar produtos' : 'Você vai comprar ou utilizar algo da loja?'}
                                            </button>

                                            {showProducts && (
                                                <div style={{
                                                    marginTop: 12,
                                                    background: '#f8fafc',
                                                    borderRadius: 16,
                                                    border: '1px solid #e2e8f0',
                                                    maxHeight: 200,
                                                    overflowY: 'auto',
                                                }}>
                                                    {loadingProducts ? (
                                                        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                                                            Carregando produtos...
                                                        </div>
                                                    ) : storeProducts.length === 0 ? (
                                                        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                                                            Nenhum produto disponível.
                                                        </div>
                                                    ) : (
                                                        storeProducts.map((product) => (
                                                            <button
                                                                key={product.id}
                                                                onClick={() => selectProduct(product)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '12px 16px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    border: 'none',
                                                                    borderBottom: '1px solid #e2e8f0',
                                                                    background: selectedProduct?.id === product.id ? '#f5f3ff' : 'transparent',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    transition: 'background 0.15s',
                                                                }}
                                                            >
                                                                <div>
                                                                    <p style={{ fontWeight: 600, color: '#1e293b', margin: 0 }}>
                                                                        {product.name}
                                                                    </p>
                                                                    {product.description && (
                                                                        <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
                                                                            {product.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {product.price !== undefined && product.price > 0 && (
                                                                    <span style={{
                                                                        fontWeight: 700,
                                                                        color: '#7c3aed',
                                                                        fontSize: 14,
                                                                    }}>
                                                                        R$ {product.price.toFixed(2)}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* CALENDÁRIO */}
                                <div style={{
                                    background: '#fff', borderRadius: 28, padding: 24,
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)', marginBottom: 24,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <button onClick={() => {
                                            if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1) }
                                            else setCalendarMonth((m) => m - 1)
                                        }} style={{ border: 'none', background: '#f1f5f9', borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <ChevronLeft size={20} color="#475569" />
                                        </button>
                                        <strong style={{ fontSize: 19, color: '#1e293b', fontWeight: 800 }}>
                                            {meses[calendarMonth]} {calendarYear}
                                        </strong>
                                        <button onClick={() => {
                                            if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1) }
                                            else setCalendarMonth((m) => m + 1)
                                        }} style={{ border: 'none', background: '#f1f5f9', borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <ChevronRight size={20} color="#475569" />
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 10 }}>
                                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => (
                                            <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase' }}>{d}</div>
                                        ))}
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
                                            return (
                                                <button key={dia} disabled={isPast} onClick={() => { setSelectedDate(date); setSelectedTime(null) }}
                                                    style={{
                                                        height: 42, border: isSelected ? '2px solid #7c3aed' : 'none', borderRadius: 14,
                                                        background: isSelected ? '#f5f3ff' : isPast ? '#f8fafc' : '#fff',
                                                        color: isSelected ? '#7c3aed' : isPast ? '#cbd5e1' : '#334155',
                                                        cursor: isPast ? 'default' : 'pointer', position: 'relative', fontWeight: 600, fontSize: 15,
                                                        boxShadow: isSelected ? '0 4px 12px rgba(124,58,237,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                    }}>
                                                    {dia}
                                                    {count > 0 && (
                                                        <div style={{ position: 'absolute', top: -5, right: -5, background: '#a855f7', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 6px rgba(168,85,247,0.4)' }}>{count}</div>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* HORÁRIOS */}
                                {selectedDate && (
                                    <div>
                                        <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 16, color: '#1e293b' }}>
                                            Horários disponíveis
                                        </h3>
                                        {slotsLivres.length === 0 ? (
                                            <div style={{ background: '#fff', borderRadius: 20, padding: 28, textAlign: 'center', color: '#94a3b8', border: '1px dashed #e2e8f0', fontSize: 15 }}>
                                                Nenhum horário livre neste dia.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                                                {slotsLivres.map((time) => (
                                                    <button key={time} onClick={() => { setSelectedTime(time); setStep('confirm') }}
                                                        style={{
                                                            padding: '16px 12px', borderRadius: 18,
                                                            border: selectedTime === time ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                                                            background: selectedTime === time ? '#f5f3ff' : '#fff',
                                                            fontWeight: 700, cursor: 'pointer',
                                                            color: selectedTime === time ? '#7c3aed' : '#334155', fontSize: 15,
                                                            boxShadow: selectedTime === time ? '0 4px 12px rgba(124,58,237,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                        }}>
                                                        {time}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ETAPA 3: CONFIRMAÇÃO */}
                {step === 'confirm' && selectedDate && selectedTime && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{
                            background: '#fff', borderRadius: 28, padding: 28,
                            boxShadow: '0 12px 40px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)', marginBottom: 24,
                        }}>
                            {/* Ícone grande da confirmação – mostra avatar/logo quando disponível */}
                            {targetType === 'store' && target?.logo_url && !targetImgError ? (
                                <img
                                    src={getPublicLogoUrl(target.logo_url)!}
                                    alt={target.name}
                                    style={{
                                        width: 72, height: 72, borderRadius: 20,
                                        objectFit: 'cover', boxShadow: '0 10px 30px rgba(124,58,237,0.25)',
                                        margin: '0 auto 24px', display: 'block',
                                    }}
                                    onError={() => setTargetImgError(true)}
                                />
                            ) : targetType === 'profile' && target?.avatar_url && !targetImgError ? (
                                <img
                                    src={getPublicAvatarUrl(target.avatar_url)!}
                                    alt={target.name}
                                    style={{
                                        width: 72, height: 72, borderRadius: 20,
                                        objectFit: 'cover', boxShadow: '0 10px 30px rgba(124,58,237,0.25)',
                                        margin: '0 auto 24px', display: 'block',
                                    }}
                                    onError={() => setTargetImgError(true)}
                                />
                            ) : (
                                <div style={{
                                    width: 72, height: 72, borderRadius: 20,
                                    background: targetType === 'self' ? 'linear-gradient(135deg, #10b981, #34d399)'
                                        : targetType === 'store' ? 'linear-gradient(135deg, #f97316, #fbbf24)'
                                            : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 24px', boxShadow: '0 10px 30px rgba(124,58,237,0.25)',
                                }}>
                                    {targetType === 'self' ? <Lock size={34} color="#fff" />
                                        : targetType === 'store' ? <Store size={34} color="#fff" />
                                            : <User size={34} color="#fff" />}
                                </div>
                            )}
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, color: '#1e293b', marginBottom: 12 }}>
                                {appointmentNote || 'Compromisso'}
                            </h2>
                            {target && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
                                    <span style={{ fontWeight: 600, color: '#64748b' }}>Com</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f3ff', borderRadius: 20, padding: '8px 16px' }}>
                                        {/* Miniatura no "Com" */}
                                        {targetType === 'store' && target?.logo_url && !targetImgError ? (
                                            <img
                                                src={getPublicLogoUrl(target.logo_url)!}
                                                alt={target.name}
                                                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                                onError={() => setTargetImgError(true)}
                                            />
                                        ) : targetType === 'profile' && target?.avatar_url && !targetImgError ? (
                                            <img
                                                src={getPublicAvatarUrl(target.avatar_url)!}
                                                alt={target.name}
                                                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                                onError={() => setTargetImgError(true)}
                                            />
                                        ) : (
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                                                {target.type === 'store' ? <Store size={16} /> : <User size={16} />}
                                            </div>
                                        )}
                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{target.name}</span>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8fafc', borderRadius: 18, padding: 18, border: '1px solid #e2e8f0' }}>
                                    <Calendar size={22} color="#7c3aed" />
                                    <div>
                                        <p style={{ fontWeight: 700, color: '#334155', fontSize: 15 }}>Data</p>
                                        <p style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>
                                            {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8fafc', borderRadius: 18, padding: 18, border: '1px solid #e2e8f0' }}>
                                    <Clock size={22} color="#7c3aed" />
                                    <div>
                                        <p style={{ fontWeight: 700, color: '#334155', fontSize: 15 }}>Horário</p>
                                        <p style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>{selectedTime}</p>
                                    </div>
                                </div>

                                {/* Toggle público/privado repaginado */}
                                <div style={{ background: '#f8fafc', borderRadius: 18, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: '#334155', fontSize: 15 }}>
                                            {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 4, background: '#e2e8f0', borderRadius: 16, padding: 3 }}>
                                            <button
                                                onClick={() => setIsPublic(false)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 14px', borderRadius: 14,
                                                    border: 'none',
                                                    background: !isPublic ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'transparent',
                                                    color: !isPublic ? '#fff' : '#475569',
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <Lock size={14} />
                                                <span>Privado</span>
                                            </button>
                                            <button
                                                onClick={() => setIsPublic(true)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 14px', borderRadius: 14,
                                                    border: 'none',
                                                    background: isPublic ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'transparent',
                                                    color: isPublic ? '#fff' : '#475569',
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <Earth size={14} />
                                                <span>Público</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleConfirm} disabled={submitting}
                                style={{
                                    width: '100%', background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    color: '#fff', border: 'none', borderRadius: 20, padding: '18px 20px',
                                    fontWeight: 800, fontSize: 17, cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', gap: 10,
                                    opacity: submitting ? 0.7 : 1, boxShadow: '0 12px 35px rgba(124,58,237,0.3)',
                                }}>
                                <Check size={22} />
                                {submitting ? 'Salvando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}