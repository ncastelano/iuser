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
    ShoppingBag,
    Edit3,
    Lock,
    Earth,
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

interface Props {
    storeId?: string
    storeName?: string
    storeSlug?: string
    // businessHours não usado internamente
    businessHours?: Record<string, { open: string; close: string }> | null
    onClose: () => void
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
    const [selectedDuration, setSelectedDuration] = useState<number>(60)
    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)   // <-- NOVO

    const [showProducts, setShowProducts] = useState(false)
    const [storeProducts, setStoreProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [isEditingNote, setIsEditingNote] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // ---------- Efeitos ----------

    // Carrega opening_hours sempre que target existir
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

    // Busca lojas (apenas na etapa de busca)
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
        setSelectedProduct(null)
        setShowProducts(false)
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
            .eq('type', 'service')
            .limit(20)
        setStoreProducts(data || [])
        setLoadingProducts(false)
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

    // ---------- Slots livres ----------
    const slotsLivres = useMemo(() => {
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
    }, [selectedDate, appointments, config, selectedDuration, target])

    // ---------- Badges ----------
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

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const getDateStatus = (date: Date): 'past' | 'closed' | 'full' | 'available' => {
        const dateStr = date.toISOString().split('T')[0]
        if (dateStr < todayStr) return 'past'

        const cfg = config
        if (!cfg.is_active || (cfg.blocked_dates && cfg.blocked_dates.includes(dateStr))) return 'closed'
        const dayOfWeek = date.getDay().toString()
        const dayConfig = cfg.weekly?.[dayOfWeek]
        if (!dayConfig || !dayConfig.isOpen) return 'closed'

        const slotInterval = cfg.slot_interval || 30
        const startMinutes = toMinutes(dayConfig.start || '08:00')
        const endMinutes = toMinutes(dayConfig.end || '18:00')
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
        const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

        const relevantAppointments = appointments.filter(
            a => a.date === dateStr && a.status !== 'cancelled' && a.store_id === target?.id
        )

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
            const overlaps = relevantAppointments.some(a => {
                const aStart = toMinutes(a.time)
                const aDuration = a.duration_minutes || 60
                const aEnd = aStart + aDuration
                return m < aEnd && aStart < (m + selectedDuration)
            })
            if (!overlaps) freeSlots++
        }

        if (freeSlots === 0) return 'full'
        return 'available'
    }

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else if (step === 'datetime') {
            if (initialStoreId) onClose()
            else { setTarget(null); setStep('search') }
        } else onClose()
    }

    const selectProduct = (product: Product) => {
        setSelectedProduct(product)
        setAppointmentNote(product.name)
        setIsEditingNote(false)
        setSelectedDuration(product.duration_minutes || 60)
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
            is_public: isPublic,   // <-- agora usa o estado
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
        onClose()
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
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
                style={{ background: colors.background }}
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black" style={{ color: colors.textPrimary }}>{title}</h3>
                        <button onClick={onClose} className="text-2xl" style={{ color: colors.textSecondary }}>×</button>
                    </div>

                    {/* ETAPA BUSCA */}
                    {step === 'search' && (
                        <div style={{ position: 'relative' }}>
                            <input ref={searchInputRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Nome da loja ou @..." autoFocus style={{ width: '100%', padding: '16px 20px', borderRadius: 18, border: `1px solid ${colors.border}`, fontSize: 16, outline: 'none', background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, color: colors.textPrimary }} />
                            {searching && <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />}
                            {showDropdown && results.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: colors.background, borderRadius: 16, boxShadow: colors.shadow, marginTop: 8, zIndex: 10, maxHeight: 260, overflowY: 'auto', border: `1px solid ${colors.border}` }}>
                                    {results.map(item => {
                                        const logoUrl = getPublicLogoUrl(item.logo_url)
                                        const isBroken = brokenImgIds.has(item.id)
                                        return (
                                            <button key={item.id} onClick={() => handleSelectStore(item)} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: colors.textPrimary }}>
                                                {logoUrl && !isBroken ? <img src={logoUrl} alt={item.name} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${colors.border}` }} onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))} /> : <div style={{ width: 42, height: 42, borderRadius: '50%', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.accentText, fontWeight: 800 }}><Store size={20} /></div>}
                                                <div><p style={{ fontWeight: 700, margin: 0 }}>{item.name}</p><p style={{ color: colors.textSecondary, fontSize: 13, margin: 0 }}>@{item.slug}</p></div>
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
                            <div style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, backdropFilter: 'blur(12px)', borderRadius: 28, padding: 24, marginBottom: 24, border: `1px solid ${colors.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    {targetImgError || !getPublicLogoUrl(target.logo_url) ? (
                                        <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.accentText }}><Store size={24} /></div>
                                    ) : (
                                        <img src={getPublicLogoUrl(target.logo_url)!} alt={target.name} style={{ width: 52, height: 52, borderRadius: 16, objectFit: 'cover', border: `2px solid ${colors.border}` }} onError={() => setTargetImgError(true)} />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontWeight: 800, fontSize: 18, color: colors.textPrimary }}>{target.name}</p>
                                        <p style={{ color: colors.textSecondary, fontSize: 14 }}>Agendamento na loja</p>
                                    </div>
                                    {!initialStoreId && <button onClick={() => { setTarget(null); setStep('search') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textSecondary }}><X size={20} /></button>}
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input type="text" value={appointmentNote} onChange={e => { setAppointmentNote(e.target.value); if (selectedProduct && e.target.value !== selectedProduct.name) setSelectedProduct(null) }} placeholder="Descrição do serviço (opcional)" style={{ width: '100%', padding: '14px 18px', paddingRight: selectedProduct ? 40 : 18, borderRadius: 16, border: `1px solid ${colors.border}`, fontSize: 15, outline: 'none', background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, color: colors.textPrimary }} />
                                    {selectedProduct && <button onClick={() => setIsEditingNote(!isEditingNote)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: colors.accent }}><Edit3 size={16} /></button>}
                                </div>
                                {!selectedProduct && (
                                    <div style={{ marginTop: 16 }}>
                                        <label style={{ fontWeight: 700, fontSize: 14, color: colors.textSecondary, display: 'block', marginBottom: 8 }}>Duração</label>
                                        <select value={selectedDuration} onChange={e => setSelectedDuration(Number(e.target.value))} style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: `1px solid ${colors.border}`, fontSize: 15, outline: 'none', background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, color: colors.textPrimary }}>
                                            <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1h</option><option value={90}>1h30</option><option value={120}>2h</option><option value={180}>3h</option><option value={240}>4h</option>
                                        </select>
                                    </div>
                                )}
                                {selectedProduct && <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: colors.accent, fontWeight: 700 }}><span>⏱️ {selectedDuration} min</span></div>}
                                <div style={{ marginTop: 16 }}>
                                    <button onClick={() => setShowProducts(!showProducts)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 14, border: `1px solid ${colors.border}`, background: showProducts ? `${colors.accent}30` : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, color: showProducts ? colors.accent : colors.textSecondary, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ShoppingBag size={18} /> {showProducts ? 'Ocultar produtos' : 'Escolher produto/serviço'}</button>
                                    {showProducts && (
                                        <div style={{ marginTop: 12, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 16, border: `1px solid ${colors.border}`, maxHeight: 200, overflowY: 'auto' }}>
                                            {loadingProducts ? <div style={{ padding: 20, textAlign: 'center', color: colors.textSecondary }}>Carregando...</div> : storeProducts.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: colors.textSecondary }}>Nenhum produto.</div> : storeProducts.map(product => (
                                                <button key={product.id} onClick={() => selectProduct(product)} style={{ width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', borderBottom: `1px solid ${colors.border}`, background: selectedProduct?.id === product.id ? `${colors.accent}30` : 'transparent', cursor: 'pointer', textAlign: 'left', color: colors.textPrimary }}>
                                                    <div><p style={{ fontWeight: 600, margin: 0 }}>{product.name}</p>{product.description && <p style={{ fontSize: 13, color: colors.textSecondary, margin: '2px 0 0' }}>{product.description}</p>}</div>
                                                    {product.price !== undefined && product.price > 0 && <span style={{ fontWeight: 700, color: colors.accent, fontSize: 14 }}>R$ {product.price.toFixed(2)}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* CALENDÁRIO */}
                            <div style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, backdropFilter: 'blur(12px)', borderRadius: 28, padding: 24, marginBottom: 24, border: `1px solid ${colors.border}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) } else setCalendarMonth(m => m - 1) }} style={{ border: 'none', background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} color={colors.textPrimary} /></button>
                                    <strong style={{ fontSize: 19, color: colors.textPrimary, fontWeight: 800 }}>{meses[calendarMonth]} {calendarYear}</strong>
                                    <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) } else setCalendarMonth(m => m + 1) }} style={{ border: 'none', background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronRight size={20} color={colors.textPrimary} /></button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 10 }}>
                                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: colors.textSecondary }}>{d}</div>)}
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

                                        let bgStyle = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`
                                        let textColorStyle = colors.textPrimary
                                        if (isSelected) { bgStyle = colors.accent; textColorStyle = colors.accentText }
                                        else if (isPast) { bgStyle = 'transparent'; textColorStyle = colors.textSecondary }
                                        else if (status === 'available') { bgStyle = 'rgba(59, 130, 246, 0.25)'; textColorStyle = '#3b82f6' }
                                        else if (status === 'full') { bgStyle = 'rgba(239, 68, 68, 0.25)'; textColorStyle = '#ef4444' }

                                        return (
                                            <button key={dia} disabled={isPast} onClick={() => { setSelectedDate(date); setSelectedTime(null) }} style={{ height: 42, border: isSelected ? `2px solid ${colors.accent}` : 'none', borderRadius: 14, background: bgStyle, color: textColorStyle, cursor: isPast ? 'default' : 'pointer', position: 'relative', fontWeight: 600, fontSize: 15 }}>
                                                {dia}
                                                {count > 0 && <div style={{ position: 'absolute', top: -5, right: -5, background: colors.accent, color: colors.accentText, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{count}</div>}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {selectedDate && (
                                <div>
                                    <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: colors.textPrimary }}>Horários disponíveis</h3>
                                    {slotsLivres.length === 0 ? (
                                        <div style={{ padding: 28, textAlign: 'center', color: colors.textSecondary, border: `1px dashed ${colors.border}`, borderRadius: 20 }}>
                                            {!config?.is_active ? 'Loja não está aceitando agendamentos.' :
                                                config?.blocked_dates?.includes(selectedDate.toISOString().split('T')[0]) ? 'Data bloqueada pela loja.' :
                                                    !config?.weekly?.[selectedDate.getDay().toString()]?.isOpen ? 'Loja fechada neste dia.' :
                                                        'Nenhum horário livre.'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                                            {slotsLivres.map(time => (
                                                <button key={time} onClick={() => { setSelectedTime(time); setStep('confirm') }} style={{ padding: '16px 12px', borderRadius: 18, border: selectedTime === time ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`, background: selectedTime === time ? colors.accent : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, fontWeight: 700, cursor: 'pointer', color: selectedTime === time ? colors.accentText : colors.textPrimary, fontSize: 15 }}>{time}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* CONFIRMAÇÃO */}
                    {step === 'confirm' && selectedDate && selectedTime && target && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ width: 72, height: 72, borderRadius: 20, background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: `0 10px 30px ${colors.accent}40` }}><Calendar size={34} color={colors.accentText} /></div>
                            <h2 style={{ fontWeight: 800, fontSize: 24, color: colors.textPrimary, marginBottom: 12 }}>{appointmentNote || 'Compromisso'}</h2>
                            <p style={{ color: colors.textSecondary, marginBottom: 24 }}>{target.name}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 18, padding: 18, border: `1px solid ${colors.border}` }}><Calendar size={22} color={colors.accent} /><div style={{ textAlign: 'left' }}><p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Data</p><p style={{ color: colors.textSecondary, fontSize: 14 }}>{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 18, padding: 18, border: `1px solid ${colors.border}` }}><Clock size={22} color={colors.accent} /><div style={{ textAlign: 'left' }}><p style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 15 }}>Horário</p><p style={{ color: colors.textSecondary, fontSize: 14 }}>{selectedTime}</p></div></div>

                                {/* Toggle Público/Privado */}
                                <div style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, borderRadius: 18, padding: '10px 14px', border: `1px solid ${colors.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: 15 }}>
                                            {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 4, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, borderRadius: 16, padding: 3 }}>
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
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button onClick={goBack} style={{ flex: 1, padding: '16px 20px', borderRadius: 18, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textPrimary, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Voltar</button>
                                <button onClick={handleConfirm} disabled={submitting} style={{ flex: 1, background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`, color: colors.accentText, border: 'none', borderRadius: 18, padding: '16px 20px', fontWeight: 800, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.7 : 1 }}><Check size={20} /> {submitting ? 'Salvando...' : 'Confirmar'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}