// app/(main)/compromissos/agendar/CriarCompromissoLoja.tsx
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { hexToRgb } from '@/lib/color'
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
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/components/Header'
import { Spinner } from '@/components/Spinner'

/* ============= HELPERS ============= */
function toMinutes(timeStr: string): number { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m }
function fromMinutes(minutes: number): string { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}` }
const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return n.toString().padStart(2, '0') }

interface SearchTarget { id: string; name: string; slug: string; logo_url: string | null; owner_id?: string }
interface Product { id: string; name: string; description?: string; price?: number; duration_minutes?: number }

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
    const { userId } = useProfile()

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

    useEffect(() => {
        if (target) {
            const idToFetch = (activeFlow === 'convite-loja' && storeId) ? storeId : target.id
            supabase.from('stores').select('opening_hours').eq('id', idToFetch).single().then(({ data }) => {
                if (data?.opening_hours) setScheduleConfig(data.opening_hours)
                else setScheduleConfig(null)
            })
        }
    }, [target, activeFlow, storeId])

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
        setSelectedDuration(60)
        setStep('datetime')
    }

    const selectProduct = (product: Product) => {
        setSelectedProduct(product)
        setAppointmentNote(product.name)
        setSelectedDuration(product.duration_minutes || 60)
        setIsEditingNote(false)
        setShowProducts(false)
    }

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else if (step === 'datetime') { setTarget(null); setStep('search') }
        else onBack()
    }

    async function notifyAppointment(appointmentId: string) {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            await fetch('/api/push/send-appointment-invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ appointmentId }),
            })
        } catch { }
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime || !target) return
        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) { alert('Você precisa estar logado.'); setSubmitting(false); return }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Agendamento'

        const payloadBase = {
            date: dateStr,
            time: selectedTime,
            duration_minutes: selectedDuration,
            service_name: note,
            service_type: 'service',
            people_count: 1,
            is_public: isPublic,
        }

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
            const inviteId = crypto.randomUUID()
            const storeAppointment = {
                id: inviteId,
                ...payloadBase,
                store_id: storeId,
                store_slug: store.storeSlug,
                store_name: store.name,
                store_logo_url: store.logo_url || '',
                provider_profile_id: store.owner_id,
                customer_id: target.id,
                customer_slug: slug,
                customer_avatar_url: targetAvatar,
                owner_id: store.owner_id,
                owner_slug: store.storeSlug,
                status: 'pending',
                direction: 'incoming',
            }
            const { error } = await supabase.from('appointments').insert(storeAppointment)
            if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
            notifyAppointment(inviteId)
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
        const bookingId = crypto.randomUUID()
        const clientAppointment = {
            id: bookingId,
            ...payloadBase,
            store_id: target.id,
            store_slug: target.slug,
            store_name: target.name,
            store_logo_url: store.logo_url || '',
            provider_profile_id: store.owner_id,
            customer_id: uid,
            customer_slug: slug,
            customer_avatar_url: myAvatar,
            owner_id: store.owner_id,
            owner_slug: target.slug,
            status: 'pending',
            direction: 'outgoing',
        }
        const { error } = await supabase.from('appointments').insert(clientAppointment)
        if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
        notifyAppointment(bookingId)
        await refetch()
        onBack()
    }

    const cardStyle = {
        background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

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

                <div className="px-5 pt-0">
                    {/* ETAPA BUSCA */}
                    {step === 'search' && (
                        <div className="mb-6">
                            <div className="rounded-2xl p-6" style={cardStyle}>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.textSecondary }} />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={activeFlow === 'convite-loja' ? "Nome ou @usuario..." : "Nome da loja ou @..."}
                                        className="w-full py-2 pl-9 pr-9 rounded-xl border text-sm focus:outline-none focus:ring-2"
                                        style={{
                                            background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            borderColor: colors.border, color: colors.textPrimary,
                                            ['--tw-ring-color' as any]: colors.accent,
                                        }}
                                        autoFocus
                                    />
                                    {searching && <Spinner size={16} color={colors.textSecondary} className="absolute right-3 top-1/2 -translate-y-1/2" />}
                                    {showDropdown && results.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 rounded-xl mt-2 z-10 max-h-[260px] overflow-y-auto" style={{ background: colors.surface, boxShadow: colors.shadow, border: `1px solid ${colors.border}` }}>
                                            {results.map((item) => {
                                                const logoUrl = getPublicLogoUrl(item.logo_url)
                                                const isBroken = brokenImgIds.has(item.id)
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => selectTarget(item)}
                                                        className="w-full py-3.5 px-4 flex items-center gap-3 border-none bg-transparent cursor-pointer text-left"
                                                        style={{ color: colors.textPrimary }}
                                                    >
                                                        {logoUrl && !isBroken ? (
                                                            <img
                                                                src={logoUrl}
                                                                alt={item.name}
                                                                className="w-10 h-10 rounded-full object-cover"
                                                                style={{ border: `2px solid ${colors.border}` }}
                                                                onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                                                style={{
                                                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                                                    color: colors.accentText,
                                                                }}
                                                            >
                                                                {activeFlow === 'convite-loja' ? <User size={18} /> : <Store size={18} />}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-sm font-bold m-0" style={{ color: colors.textPrimary }}>{item.name}</p>
                                                            <p className="text-xs m-0" style={{ color: colors.textSecondary }}>@{item.slug}</p>
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
                            <div className="rounded-2xl p-6 mb-6" style={cardStyle}>
                                <div className="flex items-center gap-4 mb-5">
                                    {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                                color: colors.accentText,
                                            }}
                                        >
                                            {activeFlow === 'convite-loja' ? <User size={20} /> : <Store size={20} />}
                                        </div>
                                    ) : (
                                        <img
                                            src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                            alt={target.name}
                                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                                            style={{ border: `2px solid ${colors.border}` }}
                                            onError={() => setTargetImgError(true)}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="text-lg font-black" style={{ color: colors.textPrimary }}>{target.name}</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                                            {activeFlow === 'convite-loja' ? 'Convidar perfil' : 'Agendamento na loja'}
                                        </p>
                                    </div>
                                    <button onClick={() => { setTarget(null); setStep('search') }} className="bg-transparent border-none cursor-pointer" style={{ color: colors.textSecondary }}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={appointmentNote}
                                        onChange={(e) => {
                                            setAppointmentNote(e.target.value)
                                            if (selectedProduct && e.target.value !== selectedProduct.name) setSelectedProduct(null)
                                        }}
                                        placeholder="Descrição do serviço (opcional)"
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{
                                            paddingRight: selectedProduct ? 40 : undefined,
                                            background: colors.surface, borderColor: colors.border, color: colors.textPrimary,
                                        }}
                                    />
                                    {selectedProduct && (
                                        <button onClick={() => setIsEditingNote(!isEditingNote)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer" style={{ color: colors.accent }}>
                                            <Edit3 size={16} />
                                        </button>
                                    )}
                                </div>
                                {!selectedProduct && (
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
                                )}
                                {selectedProduct && (
                                    <div className="mt-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: colors.accent }}>
                                        <span>⏱️ {selectedDuration} min</span>
                                    </div>
                                )}
                                <div className="mt-4">
                                    <button
                                        onClick={() => setShowProducts(!showProducts)}
                                        className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold cursor-pointer"
                                        style={{
                                            border: `1px solid ${colors.border}`,
                                            background: showProducts ? `${colors.accent}30` : `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`,
                                            color: showProducts ? colors.accent : colors.textSecondary,
                                        }}
                                    >
                                        <ShoppingBag size={18} /> {showProducts ? 'Ocultar produtos' : 'Escolher produto/serviço'}
                                    </button>
                                    {showProducts && (
                                        <div className="mt-3 rounded-xl max-h-[200px] overflow-y-auto" style={{ background: `rgba(${hexToRgb(colors.surface).r}, ${hexToRgb(colors.surface).g}, ${hexToRgb(colors.surface).b}, 0.4)`, border: `1px solid ${colors.border}` }}>
                                            {loadingProducts ? (
                                                <div className="p-5 flex justify-center"><Spinner size={20} color={colors.textSecondary} /></div>
                                            ) : storeProducts.length === 0 ? (
                                                <div className="p-5 text-center text-sm" style={{ color: colors.textSecondary }}>Nenhum produto.</div>
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
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                {product.name}
                                                                {product.duration_minutes && (
                                                                    <span style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, background: `${colors.accent}15`, padding: '2px 6px', borderRadius: 8 }}>
                                                                        {product.duration_minutes} min
                                                                    </span>
                                                                )}
                                                            </p>
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
                                            Nenhum horário livre.
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
                    {step === 'confirm' && selectedDate && selectedTime && target && (
                        <div className="rounded-2xl p-7" style={cardStyle}>
                            {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                                    style={{
                                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                        boxShadow: `0 10px 30px ${colors.accent}40`,
                                    }}
                                >
                                    {activeFlow === 'convite-loja' ? <User size={28} color={colors.accentText} /> : <Store size={28} color={colors.accentText} />}
                                </div>
                            ) : (
                                <img
                                    src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                    alt={target.name}
                                    className="w-16 h-16 rounded-full object-cover mx-auto mb-6 block"
                                    style={{ boxShadow: `0 10px 30px ${colors.accent}40` }}
                                    onError={() => setTargetImgError(true)}
                                />
                            )}
                            <h2 className="text-center text-xl font-black tracking-tight mb-3" style={{ color: colors.textPrimary }}>
                                {appointmentNote || 'Agendamento'}
                            </h2>
                            <div className="flex items-center justify-center gap-2.5 mb-6">
                                <span className="font-semibold" style={{ color: colors.textSecondary }}>
                                    {activeFlow === 'convite-loja' ? 'Convidando' : 'Em'}
                                </span>
                                <div className="flex items-center gap-2 rounded-full py-2 px-4" style={{ background: `${colors.accent}20` }}>
                                    {targetImgError || !(activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url, 'avatars') : getPublicLogoUrl(target.logo_url)) ? (
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center"
                                            style={{
                                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                                color: colors.accentText,
                                            }}
                                        >
                                            {activeFlow === 'convite-loja' ? <User size={16} /> : <Store size={16} />}
                                        </div>
                                    ) : (
                                        <img
                                            src={activeFlow === 'convite-loja' ? getPublicUrl(target.logo_url!, 'avatars')! : getPublicLogoUrl(target.logo_url)!}
                                            alt={target.name}
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                    )}
                                    <span className="font-bold" style={{ color: colors.textPrimary }}>{target.name}</span>
                                </div>
                            </div>
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
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Horário</p>
                                        <p className="text-sm" style={{ color: colors.textSecondary }}>{selectedTime} · {selectedDuration} min</p>
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
                                            >
                                                <Lock size={14} /><span>Privado</span>
                                            </button>
                                            <button
                                                onClick={() => setIsPublic(true)}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-none text-xs font-bold uppercase tracking-wide cursor-pointer transition"
                                                style={{
                                                    background: isPublic ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)` : 'transparent',
                                                    color: isPublic ? colors.accentText : colors.textSecondary,
                                                    boxShadow: isPublic ? `0 4px 14px ${colors.accent}60` : 'none',
                                                    transform: isPublic ? 'scale(1.02)' : 'scale(1)',
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