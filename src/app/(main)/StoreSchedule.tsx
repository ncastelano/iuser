// src/components/StoreSchedule.tsx
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
    Edit3,
    Lock,
    Earth,
    Plus,
    Minus,
    Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import { useAppointments } from './compromissos/dadosDoCompromisso'

/* ============= HELPERS ============= */
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
function pad(n: number) { return n.toString().padStart(2, '0') }

function getPublicLogoUrl(logoUrl: string | null | undefined): string | null {
    if (!logoUrl) return null
    if (logoUrl.startsWith('http')) return logoUrl
    const { data } = supabase.storage.from('store-logos').getPublicUrl(logoUrl)
    return data?.publicUrl || null
}

interface SearchTarget {
    id: string
    name: string
    slug: string
    logo_url: string | null
    owner_id?: string
}

interface Product {
    id: string
    name: string
    description?: string
    price?: number
    duration_minutes?: number
}

interface SelectedItem {
    product: Product
    quantity: number
}

interface Props {
    storeId?: string
    storeName?: string
    storeSlug?: string
    onClose?: () => void
    onSuccess?: () => void
}

export default function StoreSchedule({
    storeId: initialStoreId,
    storeName: initialStoreName,
    storeSlug: initialStoreSlug,
    onClose,
    onSuccess,
}: Props) {
    const { colors } = useTheme()
    const { appointments, refetch } = useAppointments()

    // ---------- Estados ----------
    const [step, setStep] = useState<'search' | 'datetime' | 'confirm'>(
        initialStoreId ? 'datetime' : 'search'
    )

    const [target, setTarget] = useState<SearchTarget | null>(
        initialStoreId
            ? { id: initialStoreId, name: initialStoreName || '', slug: initialStoreSlug || '', logo_url: null }
            : null
    )
    const [scheduleConfig, setScheduleConfig] = useState<any>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [results, setResults] = useState<SearchTarget[]>([])
    const [searching, setSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [brokenImgIds, setBrokenImgIds] = useState<Set<string>>(new Set())
    const [targetImgError, setTargetImgError] = useState(false)

    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const [storeProducts, setStoreProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
    const [isEditingNote, setIsEditingNote] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Duração total baseada nos itens selecionados
    const selectedDuration = useMemo(() => {
        if (selectedItems.length === 0) return 60
        return selectedItems.reduce(
            (total, item) => total + (item.product.duration_minutes || 60) * item.quantity,
            0
        )
    }, [selectedItems])

    // Gera automaticamente a nota baseada nos itens selecionados
    const autoNote = useMemo(() => {
        if (selectedItems.length === 0) return ''
        return selectedItems
            .map(item => `${item.quantity}x ${item.product.name}`)
            .join(', ')
    }, [selectedItems])

    // Atualiza a nota quando os itens mudam, mas apenas se o usuário não editou manualmente
    useEffect(() => {
        if (!isEditingNote) {
            setAppointmentNote(autoNote)
        }
    }, [autoNote, isEditingNote])

    // ---------- Efeitos ----------

    useEffect(() => {
        if (!target || step !== 'datetime') return
        supabase
            .from('stores')
            .select('opening_hours')
            .eq('id', target.id)
            .single()
            .then(({ data }) => {
                if (data?.opening_hours) setScheduleConfig(data.opening_hours)
                else setScheduleConfig(null)
            })
    }, [target, step])

    useEffect(() => {
        if (step !== 'search' || searchQuery.trim().length < 2) {
            setResults([])
            setShowDropdown(false)
            return
        }
        const timer = setTimeout(async () => {
            setSearching(true)
            const query = searchQuery.trim()
            const { data: stores } = await supabase
                .from('stores')
                .select('id, name, storeSlug, owner_id, logo_url')
                .or(`storeSlug.ilike.%${query}%,name.ilike.%${query}%`)
                .neq('name', 'Meus compromissos')
                .limit(5)
            setResults(
                (stores || []).map(s => ({
                    id: s.id,
                    name: s.name || s.storeSlug,
                    slug: s.storeSlug,
                    logo_url: s.logo_url,
                    owner_id: s.owner_id,
                }))
            )
            setShowDropdown(true)
            setBrokenImgIds(new Set())
            setSearching(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery, step])

    const handleSelectStore = (item: SearchTarget) => {
        supabase
            .from('stores')
            .select('opening_hours')
            .eq('id', item.id)
            .single()
            .then(({ data }) => {
                setScheduleConfig(data?.opening_hours || null)
            })
        setTarget(item)
        setSearchQuery('')
        setShowDropdown(false)
        setAppointmentNote('')
        setSelectedItems([])
        setStep('datetime')
    }

    useEffect(() => {
        if (step === 'datetime' && target) {
            loadStoreProducts(target.id)
            setTargetImgError(false)
        }
    }, [target, step])

    async function loadStoreProducts(storeId: string) {
        setLoadingProducts(true)
        const { data } = await supabase
            .from('products')
            .select('id, name, description, price, duration_minutes')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('name', { ascending: true })
            .limit(20)
        setStoreProducts(data || [])
        setLoadingProducts(false)
    }

    // ---------- Manipulação dos itens selecionados ----------
    const addToSelection = (product: Product) => {
        setSelectedItems(prev => {
            const existing = prev.find(item => item.product.id === product.id)
            if (existing) {
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            }
            return [...prev, { product, quantity: 1 }]
        })
        setIsEditingNote(false)
    }

    const removeFromSelection = (productId: string) => {
        setSelectedItems(prev => prev.filter(item => item.product.id !== productId))
        setIsEditingNote(false)
    }

    const updateItemQuantity = (productId: string, delta: number) => {
        setSelectedItems(prev => {
            return prev
                .map(item => {
                    if (item.product.id === productId) {
                        const newQty = item.quantity + delta
                        return newQty > 0 ? { ...item, quantity: newQty } : null
                    }
                    return item
                })
                .filter(Boolean) as SelectedItem[]
        })
        setIsEditingNote(false)
    }

    // ---------- Configuração de horários ----------
    const config = useMemo(() => {
        return scheduleConfig || {
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
    }, [scheduleConfig])

    // ---------- Todos os slots do dia (livres + ocupados) ----------
    const allSlots = useMemo(() => {
        if (!selectedDate || !target) return []
        const dateStr = selectedDate.toISOString().split('T')[0]
        const cfg = config
        if (!cfg.is_active || (cfg.blocked_dates && cfg.blocked_dates.includes(dateStr))) return []
        const dayOfWeek = selectedDate.getDay().toString()
        const dayConfig = cfg.weekly?.[dayOfWeek]
        if (!dayConfig || !dayConfig.isOpen) return []

        const slotInterval = cfg.slot_interval || 30
        const startMinutes = toMinutes(dayConfig.start || "08:00")
        const endMinutes = toMinutes(dayConfig.end || "18:00")
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
        const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

        const relevantAppointments = appointments.filter(a =>
            a.date === dateStr && a.status !== 'cancelled' && a.store_id === target.id
        )

        const slots: { time: string; status: 'free' | 'occupied'; appointment?: typeof relevantAppointments[0] }[] = []
        const now = new Date()
        const isToday = selectedDate.toDateString() === now.toDateString()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()

        for (let m = startMinutes; m < endMinutes; m += slotInterval) {
            if (lunchStart !== null && lunchEnd !== null) {
                if (m >= lunchStart && m < lunchEnd) continue
            }
            if (isToday && m < currentMinutes) continue

            const timeStr = fromMinutes(m)
            const slotEnd = m + selectedDuration
            if (slotEnd > endMinutes) continue

            const overlapping = relevantAppointments.find(a => {
                const aStart = toMinutes(a.time)
                const aEnd = aStart + (a.duration_minutes || 60)
                return m < aEnd && aStart < slotEnd
            })

            slots.push({
                time: timeStr,
                status: overlapping ? 'occupied' : 'free',
                appointment: overlapping || undefined,
            })
        }

        return slots
    }, [selectedDate, appointments, config, target, selectedDuration])

    // ---------- Mapa de compromissos ocupados ----------
    const eventsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        if (target) {
            appointments
                .filter(a => a.store_id === target.id && a.status !== 'cancelled')
                .forEach(a => {
                    map[a.date] = (map[a.date] || 0) + 1
                })
        }
        return map
    }, [appointments, target])

    // ---------- Mapa de vagas livres por dia ----------
    const freeSlotsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        if (!target) return map

        const cfg = config
        if (!cfg.is_active) return map

        const year = calendarYear
        const month = calendarMonth
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d)
            const dateStr = date.toISOString().split('T')[0]
            if (dateStr < todayStr) {
                map[dateStr] = 0
                continue
            }
            if (cfg.blocked_dates && cfg.blocked_dates.includes(dateStr)) {
                map[dateStr] = 0
                continue
            }
            const dayOfWeek = date.getDay().toString()
            const dayConfig = cfg.weekly?.[dayOfWeek]
            if (!dayConfig || !dayConfig.isOpen) {
                map[dateStr] = 0
                continue
            }

            const slotInterval = cfg.slot_interval || 30
            const startMinutes = toMinutes(dayConfig.start || '08:00')
            const endMinutes = toMinutes(dayConfig.end || '18:00')
            const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
            const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

            const relevantAppointments = appointments.filter(
                a => a.store_id === target.id && a.date === dateStr && a.status !== 'cancelled'
            )

            let freeCount = 0
            const now = new Date()
            const isToday = date.toDateString() === now.toDateString()
            const currentMinutes = now.getHours() * 60 + now.getMinutes()

            for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
                if (lunchStart !== null && lunchEnd !== null) {
                    const slotEnd = m + selectedDuration
                    if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue
                }
                if (isToday && m <= currentMinutes) continue
                const overlaps = relevantAppointments.some(a => {
                    const aStart = toMinutes(a.time)
                    const aEnd = aStart + (a.duration_minutes || 60)
                    return m < aEnd && aStart < (m + selectedDuration)
                })
                if (!overlaps) freeCount++
            }
            map[dateStr] = freeCount
        }
        return map
    }, [config, appointments, target, selectedDuration, calendarMonth, calendarYear, todayStr])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else if (step === 'datetime') {
            if (initialStoreId) {
                setSelectedDate(null)
                setSelectedTime(null)
            } else {
                setTarget(null)
                setStep('search')
            }
        } else {
            onClose?.()
        }
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime || !target) return
        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const uid = session.session?.user?.id
        if (!uid) {
            toast.error('Você precisa estar logado.')
            setSubmitting(false)
            return
        }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Compromisso'

        const { data: store } = await supabase
            .from('stores')
            .select('owner_id, storeSlug, name, logo_url')
            .eq('id', target.id)
            .single()
        if (!store) {
            toast.error('Loja não encontrada.')
            setSubmitting(false)
            return
        }

        const { data: myProfile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url')
            .eq('id', uid)
            .single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''

        const appointment = {
            store_id: target.id,
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
            customer_id: uid,
            customer_slug: slug,
            customer_avatar_url: myAvatar,
            owner_id: store.owner_id,
            owner_slug: store.storeSlug,
            status: 'pending',
            direction: 'outgoing',
            is_public: isPublic,
        }
        const { error } = await supabase.from('appointments').insert(appointment)
        if (error) {
            toast.error(`Erro ao criar compromisso: ${error.message}`)
            setSubmitting(false)
            return
        }
        await refetch()
        toast.success('Compromisso criado com sucesso!')
        onSuccess?.()
        onClose?.()
    }

    // ---------- Render ----------
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)

    const title = step === 'search' ? 'Buscar loja' : step === 'datetime' ? `Agendar em ${target?.name || ''}` : 'Confirmar'

    return (
        <div
            className="w-full max-w-md mx-auto rounded-3xl shadow-sm"
            style={{ background: colors.background }}
        >
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black" style={{ color: colors.textPrimary }}>{title}</h3>
                    {onClose && (
                        <button onClick={onClose} className="text-2xl" style={{ color: colors.textSecondary }}>×</button>
                    )}
                </div>

                {/* ETAPA BUSCA */}
                {step === 'search' && (
                    <div style={{ position: 'relative' }}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Nome da loja ou @..."
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: 18,
                                border: `1px solid ${colors.border}`,
                                fontSize: 16,
                                outline: 'none',
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                color: colors.textPrimary,
                            }}
                        />
                        {searching && <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />}
                        {showDropdown && results.length > 0 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: colors.background,
                                    borderRadius: 16,
                                    boxShadow: colors.shadow,
                                    marginTop: 8,
                                    zIndex: 10,
                                    maxHeight: 260,
                                    overflowY: 'auto',
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                {results.map(item => {
                                    const logoUrl = getPublicLogoUrl(item.logo_url)
                                    const isBroken = brokenImgIds.has(item.id)
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSelectStore(item)}
                                            style={{
                                                width: '100%',
                                                padding: '14px 18px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                color: colors.textPrimary,
                                            }}
                                        >
                                            {logoUrl && !isBroken ? (
                                                <img
                                                    src={logoUrl}
                                                    alt={item.name}
                                                    style={{
                                                        width: 42,
                                                        height: 42,
                                                        borderRadius: '50%',
                                                        objectFit: 'cover',
                                                        border: `2px solid ${colors.border}`,
                                                    }}
                                                    onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        width: 42,
                                                        height: 42,
                                                        borderRadius: '50%',
                                                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: colors.accentText,
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    <Store size={20} />
                                                </div>
                                            )}
                                            <div>
                                                <p style={{ fontWeight: 700, margin: 0 }}>{item.name}</p>
                                                <p style={{ color: colors.textSecondary, fontSize: 13, margin: 0 }}>@{item.slug}</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ETAPA DATA/HORA */}
                {step === 'datetime' && target && (
                    <>
                        <div
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                backdropFilter: 'blur(12px)',
                                borderRadius: 28,
                                padding: 24,
                                marginBottom: 24,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                {targetImgError || !getPublicLogoUrl(target.logo_url) ? (
                                    <div
                                        style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: 16,
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: colors.accentText,
                                        }}
                                    >
                                        <Store size={24} />
                                    </div>
                                ) : (
                                    <img
                                        src={getPublicLogoUrl(target.logo_url)!}
                                        alt={target.name}
                                        style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: 16,
                                            objectFit: 'cover',
                                            border: `2px solid ${colors.border}`,
                                        }}
                                        onError={() => setTargetImgError(true)}
                                    />
                                )}
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 800, fontSize: 18, color: colors.textPrimary }}>{target.name}</p>
                                    <p style={{ color: colors.textSecondary, fontSize: 14 }}>Agendamento na loja</p>
                                </div>
                                {!initialStoreId && (
                                    <button
                                        onClick={() => { setTarget(null); setStep('search') }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: colors.textSecondary,
                                        }}
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>

                            {/* Lista horizontal de produtos (catálogo) */}
                            <div style={{ marginBottom: 16 }}>
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2 block">
                                    Selecione os serviços
                                </label>
                                {loadingProducts ? (
                                    <div style={{ padding: 12, textAlign: 'center', color: colors.textSecondary }}>
                                        Carregando...
                                    </div>
                                ) : storeProducts.length === 0 ? (
                                    <div style={{ padding: 12, textAlign: 'center', color: colors.textSecondary }}>
                                        Nenhum serviço disponível.
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 8,
                                            overflowX: 'auto',
                                            paddingBottom: 8,
                                            WebkitOverflowScrolling: 'touch',
                                        }}
                                    >
                                        {storeProducts.map(product => {
                                            const isInSelection = selectedItems.some(item => item.product.id === product.id)
                                            return (
                                                <button
                                                    key={product.id}
                                                    onClick={() => addToSelection(product)}
                                                    style={{
                                                        flex: '0 0 auto',
                                                        minWidth: 130,
                                                        maxWidth: 160,
                                                        padding: '10px 14px',
                                                        borderRadius: 16,
                                                        border: isInSelection
                                                            ? `2px solid ${colors.accent}`
                                                            : `1px solid ${colors.border}`,
                                                        background: isInSelection
                                                            ? `${colors.accent}15`
                                                            : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        color: colors.textPrimary,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 4,
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
                                                        {product.name}
                                                    </span>
                                                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: colors.textSecondary }}>
                                                        {product.duration_minutes && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                                <Clock size={12} /> {product.duration_minutes}min
                                                            </span>
                                                        )}
                                                        {product.price !== undefined && product.price > 0 && (
                                                            <span style={{ fontWeight: 700, color: colors.accent }}>
                                                                R$ {product.price.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isInSelection && (
                                                        <span style={{ fontSize: 10, color: colors.accent, fontWeight: 700 }}>
                                                            Adicionado
                                                        </span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Itens selecionados com quantidades */}
                            {selectedItems.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2 block">
                                        Itens agendados
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedItems.map(item => (
                                            <div
                                                key={item.product.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    borderRadius: 12,
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                    border: `1px solid ${colors.border}`,
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.product.name}
                                                    </p>
                                                    <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>
                                                        {item.product.duration_minutes || 60} min cada
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <button
                                                        onClick={() => updateItemQuantity(item.product.id, -1)}
                                                        style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: '50%',
                                                            border: 'none',
                                                            background: colors.border,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            color: colors.textPrimary,
                                                        }}
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        onClick={() => updateItemQuantity(item.product.id, 1)}
                                                        style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: '50%',
                                                            border: 'none',
                                                            background: colors.accent,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            color: colors.accentText,
                                                        }}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => removeFromSelection(item.product.id)}
                                                        style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: '50%',
                                                            border: 'none',
                                                            background: '#ef4444',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            color: 'white',
                                                            marginLeft: 4,
                                                        }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: colors.accent }}>
                                            Duração total: {selectedDuration} min
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Nota (editável) */}
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={appointmentNote}
                                    onChange={e => {
                                        setAppointmentNote(e.target.value)
                                        setIsEditingNote(true)
                                    }}
                                    placeholder="Nota do compromisso (opcional)"
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        paddingRight: 40,
                                        borderRadius: 16,
                                        border: `1px solid ${colors.border}`,
                                        fontSize: 15,
                                        outline: 'none',
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        color: colors.textPrimary,
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        setIsEditingNote(false)
                                        setAppointmentNote(autoNote)
                                    }}
                                    style={{
                                        position: 'absolute',
                                        right: 12,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: isEditingNote ? colors.accent : colors.textSecondary,
                                    }}
                                    title="Reverter para nota automática"
                                >
                                    <Edit3 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* CALENDÁRIO */}
                        <div
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                backdropFilter: 'blur(12px)',
                                borderRadius: 28,
                                padding: 24,
                                marginBottom: 24,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 20,
                                }}
                            >
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 0) {
                                            setCalendarMonth(11)
                                            setCalendarYear(y => y - 1)
                                        } else setCalendarMonth(m => m - 1)
                                    }}
                                    style={{
                                        border: 'none',
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        borderRadius: 14,
                                        width: 40,
                                        height: 40,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={20} color={colors.textPrimary} />
                                </button>
                                <strong style={{ fontSize: 19, color: colors.textPrimary, fontWeight: 800 }}>
                                    {meses[calendarMonth]} {calendarYear}
                                </strong>
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 11) {
                                            setCalendarMonth(0)
                                            setCalendarYear(y => y + 1)
                                        } else setCalendarMonth(m => m + 1)
                                    }}
                                    style={{
                                        border: 'none',
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        borderRadius: 14,
                                        width: 40,
                                        height: 40,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <ChevronRight size={20} color={colors.textPrimary} />
                                </button>
                            </div>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7,1fr)',
                                    gap: 10,
                                    marginBottom: 10,
                                }}
                            >
                                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                                    <div
                                        key={d}
                                        style={{
                                            textAlign: 'center',
                                            fontWeight: 700,
                                            fontSize: 13,
                                            color: colors.textSecondary,
                                        }}
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
                                {Array.from({ length: primeiroDia }).map((_, i) => (
                                    <div key={i} />
                                ))}
                                {Array.from({ length: diasDoMes }).map((_, i) => {
                                    const dia = i + 1
                                    const date = new Date(calendarYear, calendarMonth, dia)
                                    const dateStr = date.toISOString().split('T')[0]
                                    const occupiedCount = eventsByDate[dateStr] || 0
                                    const freeCount = freeSlotsByDate[dateStr] || 0
                                    const isPast = dateStr < todayStr
                                    const isSelected =
                                        selectedDate?.toDateString() === date.toDateString()

                                    const status =
                                        freeCount > 0
                                            ? 'available'
                                            : occupiedCount > 0
                                                ? 'full'
                                                : isPast
                                                    ? 'past'
                                                    : 'closed'
                                    let bgStyle = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`
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
                                            onClick={() => {
                                                setSelectedDate(date)
                                                setSelectedTime(null)
                                            }}
                                            style={{
                                                height: 42,
                                                border: isSelected
                                                    ? `2px solid ${colors.accent}`
                                                    : 'none',
                                                borderRadius: 14,
                                                background: bgStyle,
                                                color: textColorStyle,
                                                cursor: isPast ? 'default' : 'pointer',
                                                position: 'relative',
                                                fontWeight: 600,
                                                fontSize: 15,
                                            }}
                                        >
                                            {dia}
                                            {freeCount > 0 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: -5,
                                                        left: -5,
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 11,
                                                        fontWeight: 800,
                                                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                                    }}
                                                >
                                                    {freeCount}
                                                </div>
                                            )}
                                            {occupiedCount > 0 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: -5,
                                                        right: -5,
                                                        background: '#ef4444',
                                                        color: '#fff',
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 11,
                                                        fontWeight: 800,
                                                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                                    }}
                                                >
                                                    {occupiedCount}
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {selectedDate && (
                            <div>
                                <h3
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 18,
                                        marginBottom: 16,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    Horários
                                </h3>
                                {allSlots.length === 0 ? (
                                    <div
                                        style={{
                                            padding: 28,
                                            textAlign: 'center',
                                            color: colors.textSecondary,
                                            border: `1px dashed ${colors.border}`,
                                            borderRadius: 20,
                                        }}
                                    >
                                        {!config?.is_active
                                            ? 'Loja não está aceitando agendamentos.'
                                            : config?.blocked_dates?.includes(
                                                selectedDate.toISOString().split('T')[0]
                                            )
                                                ? 'Data bloqueada pela loja.'
                                                : !config?.weekly?.[
                                                    selectedDate.getDay().toString()
                                                ]?.isOpen
                                                    ? 'Loja fechada neste dia.'
                                                    : 'Nenhum horário disponível.'}
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                                            gap: 10,
                                        }}
                                    >
                                        {allSlots.map(slot => {
                                            if (slot.status === 'free') {
                                                return (
                                                    <button
                                                        key={slot.time}
                                                        onClick={() => {
                                                            setSelectedTime(slot.time)
                                                            setStep('confirm')
                                                        }}
                                                        style={{
                                                            padding: '16px 12px',
                                                            borderRadius: 18,
                                                            border:
                                                                selectedTime === slot.time
                                                                    ? `2px solid ${colors.accent}`
                                                                    : `1px solid ${colors.border}`,
                                                            background:
                                                                selectedTime === slot.time
                                                                    ? colors.accent
                                                                    : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            color:
                                                                selectedTime === slot.time
                                                                    ? colors.accentText
                                                                    : colors.textPrimary,
                                                            fontSize: 15,
                                                        }}
                                                    >
                                                        {slot.time}
                                                    </button>
                                                )
                                            } else {
                                                const app = slot.appointment
                                                const isPublic = app?.is_public
                                                const customerName = app?.service_name || 'Cliente'
                                                const avatar = app?.customer_avatar_url
                                                return (
                                                    <div
                                                        key={slot.time}
                                                        style={{
                                                            padding: '12px 10px',
                                                            borderRadius: 18,
                                                            border: `1px solid ${colors.border}`,
                                                            background: isPublic
                                                                ? `${colors.accent}20`
                                                                : 'rgba(239, 68, 68, 0.15)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            color: colors.textPrimary,
                                                            fontSize: 13,
                                                            fontWeight: 600,
                                                            cursor: 'default',
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                                                            {slot.time}
                                                        </span>
                                                        {isPublic ? (
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    color: colors.accent,
                                                                }}
                                                            >
                                                                {avatar && (
                                                                    <img
                                                                        src={avatar}
                                                                        style={{
                                                                            width: 20,
                                                                            height: 20,
                                                                            borderRadius: '50%',
                                                                            objectFit: 'cover',
                                                                        }}
                                                                        alt=""
                                                                    />
                                                                )}
                                                                <span style={{ lineHeight: 1.2 }}>
                                                                    {customerName}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    color: '#ef4444',
                                                                }}
                                                            >
                                                                <Lock size={14} />
                                                                <span>Ocupado</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* CONFIRMAÇÃO */}
                {step === 'confirm' && selectedDate && selectedTime && target && (
                    <div style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: 20,
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 24px',
                                boxShadow: `0 10px 30px ${colors.accent}40`,
                            }}
                        >
                            <Calendar size={34} color={colors.accentText} />
                        </div>
                        <h2
                            style={{
                                fontWeight: 800,
                                fontSize: 24,
                                color: colors.textPrimary,
                                marginBottom: 12,
                            }}
                        >
                            {appointmentNote || 'Compromisso'}
                        </h2>
                        <p style={{ color: colors.textSecondary, marginBottom: 24 }}>{target.name}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                    borderRadius: 18,
                                    padding: 18,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <Calendar size={22} color={colors.accent} />
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>
                                        Data
                                    </p>
                                    <p style={{ color: colors.textSecondary, fontSize: 14 }}>
                                        {selectedDate.toLocaleDateString('pt-BR', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                        })}
                                    </p>
                                </div>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                    borderRadius: 18,
                                    padding: 18,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <Clock size={22} color={colors.accent} />
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>
                                        Horário
                                    </p>
                                    <p style={{ color: colors.textSecondary, fontSize: 14 }}>
                                        {selectedTime}
                                    </p>
                                </div>
                            </div>
                            {selectedItems.length > 0 && (
                                <div
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        borderRadius: 18,
                                        padding: 18,
                                        border: `1px solid ${colors.border}`,
                                        textAlign: 'left',
                                    }}
                                >
                                    <p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15, marginBottom: 8 }}>
                                        Serviços
                                    </p>
                                    {selectedItems.map(item => (
                                        <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
                                            <span>{item.product.name}</span>
                                            <span>x{item.quantity}</span>
                                        </div>
                                    ))}
                                    <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 8, paddingTop: 8, fontWeight: 700, color: colors.accent }}>
                                        Duração total: {selectedDuration} min
                                    </div>
                                </div>
                            )}

                            {/* Toggle Público/Privado */}
                            <div
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                    borderRadius: 18,
                                    padding: '10px 14px',
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            color: colors.textPrimary,
                                            fontSize: 15,
                                        }}
                                    >
                                        {isPublic
                                            ? 'Compromisso público'
                                            : 'Compromisso privado'}
                                    </span>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 4,
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                            borderRadius: 16,
                                            padding: 3,
                                        }}
                                    >
                                        <button
                                            onClick={() => setIsPublic(false)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '6px 14px',
                                                borderRadius: 14,
                                                border: 'none',
                                                background: !isPublic
                                                    ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`
                                                    : 'transparent',
                                                color: !isPublic
                                                    ? colors.accentText
                                                    : colors.textSecondary,
                                                fontWeight: 700,
                                                fontSize: 13,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <Lock size={14} />
                                            <span>Privado</span>
                                        </button>
                                        <button
                                            onClick={() => setIsPublic(true)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '6px 14px',
                                                borderRadius: 14,
                                                border: 'none',
                                                background: isPublic
                                                    ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`
                                                    : 'transparent',
                                                color: isPublic
                                                    ? colors.accentText
                                                    : colors.textSecondary,
                                                fontWeight: 700,
                                                fontSize: 13,
                                                cursor: 'pointer',
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
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={goBack}
                                style={{
                                    flex: 1,
                                    padding: '16px 20px',
                                    borderRadius: 18,
                                    border: `1px solid ${colors.border}`,
                                    background: 'transparent',
                                    color: colors.textPrimary,
                                    fontWeight: 700,
                                    fontSize: 16,
                                    cursor: 'pointer',
                                }}
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={submitting}
                                style={{
                                    flex: 1,
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                    color: colors.accentText,
                                    border: 'none',
                                    borderRadius: 18,
                                    padding: '16px 20px',
                                    fontWeight: 800,
                                    fontSize: 16,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    opacity: submitting ? 0.7 : 1,
                                }}
                            >
                                <Check size={20} /> {submitting ? 'Salvando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}