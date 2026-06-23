// app/(main)/compromissos/agendar/CriarCompromissoLoja.tsx
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
    Calendar,
    Clock,
    Check,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
    Store,
    ShoppingBag,
    Edit3,
    Lock,
    Earth,
    User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/app/Header'

/* ============= HELPERS ============= */
function toMinutes(timeStr: string): number { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m }
function fromMinutes(minutes: number): string { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}` }
const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return n.toString().padStart(2, '0') }

interface SearchTarget { id: string; name: string; slug: string; logo_url: string | null; owner_id?: string }
interface Product { id: string; name: string; description?: string; price?: number }

function getPublicUrl(path: string | null | undefined, bucket: 'avatars' | 'store-logos' | 'stores'): string | null {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl || null
}

function getPublicLogoUrl(logoUrl: string | null | undefined): string | null {
    return getPublicUrl(logoUrl, 'stores')
}

interface Props {
    onBack: () => void
    context?: 'pessoal' | 'loja'
    storeId?: string
    activeFlow?: 'none' | 'loja' | 'com-alguem' | 'pessoal' | 'evento-perfil' | 'convite-loja' | 'evento-loja'
    myStores?: any[]
}

export default function CriarCompromissoLoja({ onBack, context, storeId, activeFlow, myStores }: Props) {
    const { colors } = useTheme()
    const { appointments, refetch } = useAppointments()

    // Estados do tema/fundo
    const [bgMode, setBgMode] = useState<'animated' | 'black' | 'custom'>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
    const [userProfileSlug, setUserProfileSlug] = useState<string | null>(null)

    const [step, setStep] = useState<'search' | 'datetime' | 'confirm'>('search')
    const [target, setTarget] = useState<SearchTarget | null>(null)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const [selectedDuration, setSelectedDuration] = useState<number>(60)
    const [scheduleConfig, setScheduleConfig] = useState<any>(null)
    const [userId, setUserId] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [results, setResults] = useState<SearchTarget[]>([])
    const [searching, setSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [brokenImgIds, setBrokenImgIds] = useState<Set<string>>(new Set())
    const [targetImgError, setTargetImgError] = useState(false)

    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const [showProducts, setShowProducts] = useState(false)
    const [storeProducts, setStoreProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [isEditingNote, setIsEditingNote] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Carrega dados do perfil e fundo
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id)
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

    // Carrega configuração de horários da loja
    useEffect(() => {
        if (target) {
            const idToFetch = (activeFlow === 'convite-loja' && storeId) ? storeId : target.id
            supabase.from('stores').select('opening_hours').eq('id', idToFetch).single().then(({ data }) => {
                if (data?.opening_hours) setScheduleConfig(data.opening_hours)
                else setScheduleConfig(null)
            })
        }
    }, [target, activeFlow, storeId])

    // Busca lojas ou perfis
    useEffect(() => {
        if (searchQuery.trim().length < 2) { setResults([]); setShowDropdown(false); return }
        const timer = setTimeout(async () => {
            setSearching(true)
            const query = searchQuery.trim()
            if (activeFlow === 'convite-loja') {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url')
                    .or(`profileSlug.ilike.%${query}%,name.ilike.%${query}%`)
                    .limit(5)
                const merged: SearchTarget[] = (profiles || []).map(p => ({
                    id: p.id,
                    name: p.name || `@${p.profileSlug}`,
                    slug: p.profileSlug,
                    logo_url: p.avatar_url,
                }))
                setResults(merged)
            } else {
                const { data: stores } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, owner_id, logo_url')
                    .or(`storeSlug.ilike.%${query}%,name.ilike.%${query}%`)
                    .neq('name', 'Meus compromissos')
                    .limit(5)
                const merged: SearchTarget[] = (stores || []).map(s => ({
                    id: s.id,
                    name: s.name || `@${s.storeSlug}`,
                    slug: s.storeSlug,
                    logo_url: s.logo_url,
                    owner_id: s.owner_id,
                }))
                setResults(merged)
            }
            setShowDropdown(true)
            setBrokenImgIds(new Set())
            setSearching(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery, activeFlow])

    // Carrega produtos da loja
    useEffect(() => {
        if (target) {
            const currentStoreId = (activeFlow === 'convite-loja' && storeId) ? storeId : target.id
            loadStoreProducts(currentStoreId)
            setTargetImgError(false)
        }
    }, [target, activeFlow, storeId])

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

    // Horários livres
    const slotsLivres = useMemo(() => {
        if (!selectedDate || !target) return []
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
        const currentStoreId = (activeFlow === 'convite-loja' && storeId) ? storeId : target.id
        let relevantAppointments = appointments.filter(a =>
            a.date === dateStr && a.status !== 'cancelled' && a.store_id === currentStoreId
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
    }, [selectedDate, appointments, target, scheduleConfig, selectedDuration, activeFlow, storeId])

    const eventsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        if (target) {
            const currentStoreId = (activeFlow === 'convite-loja' && storeId) ? storeId : target.id
            appointments.filter(a => a.store_id === currentStoreId).forEach(a => {
                map[a.date] = (map[a.date] || 0) + 1
            })
        }
        return map
    }, [appointments, target, activeFlow, storeId])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const selectTarget = (item: SearchTarget) => {
        setTarget(item)
        setSearchQuery('')
        setShowDropdown(false)
        setAppointmentNote('')
        setSelectedProduct(null)
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
        else if (step === 'datetime') { setTarget(null); setStep('search') }
        else onBack()
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime || !target) return
        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) { alert('Você precisa estar logado.'); setSubmitting(false); return }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Agendamento'

        if (activeFlow === 'convite-loja' && storeId) {
            const { data: store } = await supabase
                .from('stores')
                .select('owner_id, storeSlug, name, logo_url')
                .eq('id', storeId)
                .single()
            if (!store) { alert('Loja não encontrada.'); setSubmitting(false); return }
            const { data: targetProfile } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url')
                .eq('id', target.id)
                .single()
            const slug = targetProfile?.profileSlug || ''
            const targetAvatar = targetProfile?.avatar_url || ''
            const storeAppointment = {
                store_id: storeId,
                store_slug: store.storeSlug,
                store_name: store.name,
                store_logo_url: store.logo_url || '',
                provider_profile_id: store.owner_id,
                date: dateStr,
                time: selectedTime,
                duration_minutes: selectedDuration,
                service_name: note,
                service_type: 'service',
                people_count: 1,
                customer_id: target.id,
                customer_slug: slug,
                customer_avatar_url: targetAvatar,
                owner_id: store.owner_id,
                owner_slug: store.storeSlug,
                status: 'pending',
                direction: 'incoming',
                is_public: isPublic,
            }
            const { error } = await supabase.from('appointments').insert(storeAppointment)
            if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
            await refetch()
            onBack()
            return
        }

        const { data: store } = await supabase
            .from('stores')
            .select('owner_id, storeSlug, name, logo_url')
            .eq('id', target.id)
            .single()
        if (!store) { alert('Loja não encontrada.'); setSubmitting(false); return }
        const { data: myProfile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url')
            .eq('id', uid)
            .single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''
        const clientAppointment = {
            store_id: target.id,
            store_slug: target.slug,
            store_name: target.name,
            store_logo_url: store.logo_url || '',
            provider_profile_id: store.owner_id,
            date: dateStr,
            time: selectedTime,
            duration_minutes: selectedDuration,
            service_name: note,
            service_type: 'service',
            people_count: 1,
            customer_id: uid,
            customer_slug: slug,
            customer_avatar_url: myAvatar,
            owner_id: store.owner_id,
            owner_slug: target.slug,
            status: 'pending',
            direction: 'outgoing',
            is_public: isPublic,
        }
        const { error } = await supabase.from('appointments').insert(clientAppointment)
        if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
        await refetch()
        onBack()
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

    // Abas do Header
    const tabs = useMemo(() => {
        const personalTab = {
            id: 'pessoal',
            label: userProfileSlug ? `@${userProfileSlug}` : 'Perfil',
            icon: User as any,
            imageUrl: getPublicUrl(userAvatarUrl, 'avatars'),
            onClick: () => { },
            isActive: activeFlow !== 'convite-loja',
        }

        const storeTabs = (myStores || []).map((store) => ({
            id: store.id,
            label: store.name,
            icon: Store as any,
            imageUrl: getPublicUrl(store.logo_url, 'store-logos'),
            onClick: () => { },
            isActive: activeFlow === 'convite-loja' && store.id === storeId,
        }))

        return [personalTab, ...storeTabs]
    }, [userProfileSlug, userAvatarUrl, myStores, activeFlow, storeId])

    const getDateStatus = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0]
        if (dateStr < todayStr) return 'past'

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

        const currentStoreId = (activeFlow === 'convite-loja' && storeId) ? storeId : (target ? target.id : null)
        if (!currentStoreId) return 'closed'

        let relevantAppointments = appointments.filter(a =>
            a.date === dateStr && a.status !== 'cancelled' && a.store_id === currentStoreId
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
                    title={step === 'search' ? (activeFlow === 'convite-loja' ? 'Convidar perfis' : 'Agendar em loja') : step === 'datetime' ? 'Data e horário' : 'Confirmar'}
                    showBack={true}
                    onBack={goBack}
                    greeting={step === 'search' ? (activeFlow === 'convite-loja' ? 'Busque os perfis...' : 'Busque a loja') : step === 'datetime' ? target?.name || '' : 'Revise os detalhes'}
                    avatarUrl={getPublicUrl(userAvatarUrl, 'avatars')}
                    tabs={tabs}
                    showSearch={false}
                    onHomeClick={() => onBack()}
                />

                <div style={{ padding: '20px 20px 0' }}>
                    {/* ETAPA BUSCA */}
                    {step === 'search' && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24 }}>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={activeFlow === 'convite-loja' ? "Nome ou @usuario..." : "Nome da loja ou @..."}
                                        style={{
                                            width: '100%', padding: '16px 20px', borderRadius: 18,
                                            border: `1px solid ${colors.border}`, fontSize: 16,
                                            outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            color: colors.textPrimary,
                                        }}
                                        autoFocus
                                    />
                                    {searching && <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />}
                                    {showDropdown && results.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: colors.background,
                                            borderRadius: 16, boxShadow: colors.shadow,
                                            marginTop: 8, zIndex: 10, maxHeight: 260, overflowY: 'auto',
                                            border: `1px solid ${colors.border}`,
                                        }}>
                                            {results.map((item) => {
                                                const logoUrl = getPublicLogoUrl(item.logo_url)
                                                const isBroken = brokenImgIds.has(item.id)
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => selectTarget(item)}
                                                        style={{
                                                            width: '100%', padding: '14px 18px',
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            border: 'none', background: 'transparent',
                                                            cursor: 'pointer', textAlign: 'left',
                                                            color: colors.textPrimary,
                                                        }}
                                                    >
                                                        {logoUrl && !isBroken ? (
                                                            <img
                                                                src={logoUrl}
                                                                alt={item.name}
                                                                style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${colors.border}` }}
                                                                onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: 42, height: 42, borderRadius: '50%',
                                                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: colors.accentText, fontWeight: 800,
                                                            }}>
                                                                {activeFlow === 'convite-loja' ? <User size={20} /> : <Store size={20} />}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p style={{ fontWeight: 700, color: colors.textPrimary, margin: 0 }}>{item.name}</p>
                                                            <p style={{ color: colors.textSecondary, fontSize: 13, margin: 0 }}>@{item.slug}</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ETAPA DATA/HORA */}
                    {step === 'datetime' && target && (
                        <>
                            <div style={{ ...cardStyle, borderRadius: 28, padding: 24, marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                        <div style={{
                                            width: 52, height: 52, borderRadius: 16,
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: colors.accentText,
                                        }}>
                                            {activeFlow === 'convite-loja' ? <User size={24} /> : <Store size={24} />}
                                        </div>
                                    ) : (
                                        <img
                                            src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                            alt={target.name}
                                            style={{ width: 52, height: 52, borderRadius: 16, objectFit: 'cover', border: `2px solid ${colors.border}` }}
                                            onError={() => setTargetImgError(true)}
                                        />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontWeight: 800, fontSize: 18, color: colors.textPrimary }}>{target.name}</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>
                                            {activeFlow === 'convite-loja' ? 'Convidar perfil' : 'Agendamento na loja'}
                                        </p>
                                    </div>
                                    <button onClick={() => { setTarget(null); setStep('search') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textSecondary }}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        value={appointmentNote}
                                        onChange={(e) => {
                                            setAppointmentNote(e.target.value)
                                            if (selectedProduct && e.target.value !== selectedProduct.name) setSelectedProduct(null)
                                        }}
                                        placeholder="Descrição do serviço (opcional)"
                                        style={{
                                            width: '100%', padding: '14px 18px', paddingRight: selectedProduct ? 40 : 18,
                                            borderRadius: 16, border: `1px solid ${colors.border}`, fontSize: 15,
                                            outline: 'none', background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                    {selectedProduct && (
                                        <button onClick={() => setIsEditingNote(!isEditingNote)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: colors.accent }}>
                                            <Edit3 size={16} />
                                        </button>
                                    )}
                                </div>
                                {!selectedProduct && (
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
                                )}
                                {selectedProduct && (
                                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: colors.accent, fontWeight: 700 }}>
                                        <span>⏱️ {selectedDuration} min</span>
                                    </div>
                                )}
                                <div style={{ marginTop: 16 }}>
                                    <button
                                        onClick={() => setShowProducts(!showProducts)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                                            borderRadius: 14, border: `1px solid ${colors.border}`,
                                            background: showProducts ? `${colors.accent}30` : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            color: showProducts ? colors.accent : colors.textSecondary,
                                            fontWeight: 600, fontSize: 14, cursor: 'pointer',
                                        }}
                                    >
                                        <ShoppingBag size={18} /> {showProducts ? 'Ocultar produtos' : 'Escolher produto/serviço'}
                                    </button>
                                    {showProducts && (
                                        <div style={{ marginTop: 12, background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`, borderRadius: 16, border: `1px solid ${colors.border}`, maxHeight: 200, overflowY: 'auto' }}>
                                            {loadingProducts ? (
                                                <div style={{ padding: 20, textAlign: 'center', color: colors.textSecondary }}>Carregando...</div>
                                            ) : storeProducts.length === 0 ? (
                                                <div style={{ padding: 20, textAlign: 'center', color: colors.textSecondary }}>Nenhum produto.</div>
                                            ) : (
                                                storeProducts.map(product => (
                                                    <button
                                                        key={product.id}
                                                        onClick={() => selectProduct(product)}
                                                        style={{
                                                            width: '100%', padding: '12px 16px', display: 'flex',
                                                            justifyContent: 'space-between', alignItems: 'center',
                                                            border: 'none', borderBottom: `1px solid ${colors.border}`,
                                                            background: selectedProduct?.id === product.id ? `${colors.accent}30` : 'transparent',
                                                            cursor: 'pointer', textAlign: 'left', color: colors.textPrimary,
                                                        }}
                                                    >
                                                        <div>
                                                            <p style={{ fontWeight: 600, margin: 0 }}>{product.name}</p>
                                                            {product.description && <p style={{ fontSize: 13, color: colors.textSecondary, margin: '2px 0 0' }}>{product.description}</p>}
                                                        </div>
                                                        {product.price !== undefined && product.price > 0 && (
                                                            <span style={{ fontWeight: 700, color: colors.accent, fontSize: 14 }}>R$ {product.price.toFixed(2)}</span>
                                                        )}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
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
                                            bgStyle = 'rgba(59, 130, 246, 0.25)' // Azul translúcido premium
                                            textColorStyle = '#3b82f6'
                                        } else if (status === 'full') {
                                            bgStyle = 'rgba(239, 68, 68, 0.25)' // Vermelho translúcido premium
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
                                            Nenhum horário livre.
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
                    {step === 'confirm' && selectedDate && selectedTime && target && (
                        <div style={{ ...cardStyle, borderRadius: 28, padding: 28 }}>
                            {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                <div style={{
                                    width: 72, height: 72, borderRadius: 20,
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 24px', boxShadow: `0 10px 30px ${colors.accent}40`,
                                }}>
                                    {activeFlow === 'convite-loja' ? <User size={34} color={colors.accentText} /> : <Store size={34} color={colors.accentText} />}
                                </div>
                            ) : (
                                <img
                                    src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                    alt={target.name}
                                    style={{
                                        width: 72, height: 72, borderRadius: 20, objectFit: 'cover',
                                        margin: '0 auto 24px', display: 'block',
                                        boxShadow: `0 10px 30px ${colors.accent}40`,
                                    }}
                                    onError={() => setTargetImgError(true)}
                                />
                            )}
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, color: colors.textPrimary, marginBottom: 12 }}>
                                {appointmentNote || 'Agendamento'}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
                                <span style={{ fontWeight: 600, color: colors.textSecondary }}>
                                    {activeFlow === 'convite-loja' ? 'Convidando' : 'Em'}
                                </span>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: `${colors.accent}20`, borderRadius: 20, padding: '8px 16px',
                                }}>
                                    {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: colors.accentText, fontWeight: 700,
                                        }}>
                                            {activeFlow === 'convite-loja' ? <User size={16} /> : <Store size={16} />}
                                        </div>
                                    ) : (
                                        <img
                                            src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                            alt={target.name}
                                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                    )}
                                    <span style={{ fontWeight: 700, color: colors.textPrimary }}>{target.name}</span>
                                </div>
                            </div>
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
                                            <button
                                                onClick={() => setIsPublic(false)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                                                    borderRadius: 14, border: 'none',
                                                    background: !isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                    color: !isPublic ? colors.accentText : colors.textSecondary,
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                            >
                                                <Lock size={14} /><span>Privado</span>
                                            </button>
                                            <button
                                                onClick={() => setIsPublic(true)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                                                    borderRadius: 14, border: 'none',
                                                    background: isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                    color: isPublic ? colors.accentText : colors.textSecondary,
                                                    fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                            >
                                                <Earth size={14} /><span>Público</span>
                                            </button>
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