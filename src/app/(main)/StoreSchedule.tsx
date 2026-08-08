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
    Sparkles,
    ArrowRight,
    AlertCircle,
    Eye,
    EyeOff,
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

// ===== GRADIENTE FIXO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
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
    const [validationError, setValidationError] = useState<string | null>(null)
    const [showCalendar, setShowCalendar] = useState(false)

    // ===== ESTADOS DE AUTENTICAÇÃO =====
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
    const [authEmail, setAuthEmail] = useState('')
    const [authPassword, setAuthPassword] = useState('')
    const [authConfirmPassword, setAuthConfirmPassword] = useState('')
    const [authName, setAuthName] = useState('')
    const [authProfileSlug, setAuthProfileSlug] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null)
    const slugTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [authInitialized, setAuthInitialized] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // ===== VERIFICAR AUTENTICAÇÃO =====
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserId(user.id)
                setIsAuthenticated(true)

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('profileSlug, avatar_url, name')
                    .eq('id', user.id)
                    .single()

                if (profile) {
                    setCurrentUserSlug(profile.profileSlug)
                    setCurrentUserAvatar(profile.avatar_url)
                    setCurrentUserName(profile.name)
                }
            } else {
                setIsAuthenticated(false)
                setCurrentUserId(null)
            }
            setAuthInitialized(true)
        }
        checkAuth()
    }, [])

    // ===== VERIFICAR DISPONIBILIDADE DO SLUG =====
    useEffect(() => {
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        if (authProfileSlug.length < 3) {
            setIsSlugAvailable(null)
            return
        }
        slugTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug')
                .eq('profileSlug', authProfileSlug)
                .single()
            setIsSlugAvailable(!data)
        }, 500)
        return () => {
            if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        }
    }, [authProfileSlug])

    // ===== FUNÇÕES DE AUTENTICAÇÃO =====
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        const { data, error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
        })
        if (error) {
            setAuthError('Email ou senha inválidos')
            setAuthLoading(false)
            return
        }
        if (data.user) {
            setCurrentUserId(data.user.id)
            setIsAuthenticated(true)

            const { data: profile } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url, name')
                .eq('id', data.user.id)
                .single()

            if (profile) {
                setCurrentUserSlug(profile.profileSlug)
                setCurrentUserAvatar(profile.avatar_url)
                setCurrentUserName(profile.name)
            }
            toast.success('Login realizado com sucesso!')
        }
        setAuthLoading(false)
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        if (authPassword !== authConfirmPassword) {
            setAuthError('As senhas não coincidem')
            setAuthLoading(false)
            return
        }
        if (!authProfileSlug || !/^[a-z0-9-]+$/.test(authProfileSlug)) {
            setAuthError('O link do perfil deve conter apenas letras, números e hifens')
            setAuthLoading(false)
            return
        }
        const { data: slugCheck } = await supabase
            .from('profiles')
            .select('profileSlug')
            .eq('profileSlug', authProfileSlug)
            .single()
        if (slugCheck) {
            setAuthError('Este link de perfil já está em uso')
            setAuthLoading(false)
            return
        }
        const { data, error } = await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: { data: { full_name: authName, slug: authProfileSlug } },
        })
        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
            return
        }
        if (data.user) {
            await supabase.from('profiles').upsert({
                id: data.user.id,
                name: authName,
                profileSlug: authProfileSlug,
            })
            setCurrentUserId(data.user.id)
            setIsAuthenticated(true)
            setCurrentUserSlug(authProfileSlug)
            setCurrentUserName(authName)
            toast.success('Conta criada com sucesso!')
        }
        setAuthLoading(false)
    }

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
        setValidationError(null)
        setShowCalendar(false)
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
        setValidationError(null)
    }

    const removeFromSelection = (productId: string) => {
        setSelectedItems(prev => prev.filter(item => item.product.id !== productId))
        setIsEditingNote(false)
        if (selectedItems.length <= 1) {
            setValidationError('Selecione pelo menos um serviço')
        }
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
        setValidationError(null)
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

    // ---------- FUNÇÃO PARA ENCONTRAR PRÓXIMOS HORÁRIOS DISPONÍVEIS ----------
    const getNextAvailableSlots = useMemo(() => {
        if (!target || !config.is_active || selectedItems.length === 0) return []

        const slots: { date: Date; time: string; dateStr: string }[] = []
        const now = new Date()
        const maxDays = 30
        const slotInterval = config.slot_interval || 60

        for (let d = 0; d < maxDays; d++) {
            const date = new Date(now)
            date.setDate(date.getDate() + d)
            const dateStr = date.toISOString().split('T')[0]

            if (dateStr < todayStr) continue
            if (config.blocked_dates && config.blocked_dates.includes(dateStr)) continue

            const dayOfWeek = date.getDay().toString()
            const dayConfig = config.weekly?.[dayOfWeek]

            if (!dayConfig || !dayConfig.isOpen) continue

            const startMinutes = toMinutes(dayConfig.start || "08:00")
            const endMinutes = toMinutes(dayConfig.end || "18:00")
            const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null
            const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null

            const relevantAppointments = appointments.filter(a =>
                a.date === dateStr && a.status !== 'cancelled' && a.store_id === target.id
            )

            const isToday = date.toDateString() === now.toDateString()
            const currentMinutes = now.getHours() * 60 + now.getMinutes()

            for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
                if (lunchStart !== null && lunchEnd !== null) {
                    const slotEnd = m + selectedDuration
                    if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue
                }

                if (isToday && m <= currentMinutes) continue

                const hasConflict = relevantAppointments.some(a => {
                    const aStart = toMinutes(a.time)
                    const aEnd = aStart + (a.duration_minutes || 60)
                    return m < aEnd && aStart < (m + selectedDuration)
                })

                if (!hasConflict) {
                    slots.push({
                        date: new Date(date),
                        time: fromMinutes(m),
                        dateStr: dateStr,
                    })
                }
            }

            if (slots.length >= 5) break
        }

        return slots.slice(0, 5)
    }, [target, config, appointments, selectedDuration, todayStr, selectedItems.length])

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
        if (!target || selectedItems.length === 0) return map

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
    }, [config, appointments, target, selectedDuration, calendarMonth, calendarYear, todayStr, selectedItems.length])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const goBack = () => {
        if (step === 'confirm') {
            setStep('datetime')
            setValidationError(null)
        } else if (step === 'datetime') {
            if (initialStoreId) {
                setSelectedDate(null)
                setSelectedTime(null)
                setShowCalendar(false)
            } else {
                setTarget(null)
                setStep('search')
            }
        } else {
            onClose?.()
        }
    }

    // ---------- VALIDAÇÃO ANTES DE CONFIRMAR (INCLUI VERIFICAÇÃO DE AUTENTICAÇÃO) ----------
    const handleConfirmClick = () => {
        // 1. Verifica se está autenticado
        if (!isAuthenticated) {
            setValidationError('⚠️ Você precisa estar logado para agendar')
            // Rola para o topo para mostrar o formulário de login
            const authSection = document.getElementById('auth-section')
            if (authSection) {
                authSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            return
        }

        // 2. Verifica se há itens selecionados
        if (selectedItems.length === 0) {
            setValidationError('⚠️ Selecione pelo menos um serviço ou produto para agendar')
            const serviceSection = document.getElementById('service-selection')
            if (serviceSection) {
                serviceSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            return
        }

        // 3. Se passou na validação, chama o handleConfirm
        handleConfirm()
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime || !target) return
        setSubmitting(true)

        // Pega o usuário novamente para garantir
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
    const borderColor = colors.border
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const accentColor = colors.accent

    const title = step === 'search' ? 'Buscar loja' : step === 'datetime' ? `Agendar em ${target?.name || ''}` : 'Confirmar'

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        })
    }

    const hasSelectedDateTime = selectedDate && selectedTime

    // Se não estiver autenticado, mostra o formulário de login
    const showAuthForm = !isAuthenticated && step === 'confirm'

    return (
        <div
            className="w-full max-w-md mx-auto rounded-3xl shadow-sm max-h-[95vh] overflow-y-auto"
            style={{
                background: colors.background,
                overscrollBehavior: 'contain'
            }}
        >
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black" style={{ color: textPrimary }}>{title}</h3>
                    {onClose && (
                        <button onClick={onClose} className="text-2xl" style={{ color: textSecondary }}>×</button>
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
                                border: `1px solid ${borderColor}`,
                                fontSize: 16,
                                outline: 'none',
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                color: textPrimary,
                            }}
                        />
                        {searching && <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: textSecondary }} />}
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
                                    border: `1px solid ${borderColor}`,
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
                                                color: textPrimary,
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
                                                        border: `2px solid ${borderColor}`,
                                                    }}
                                                    onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        width: 42,
                                                        height: 42,
                                                        borderRadius: '50%',
                                                        background: GRADIENT,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#ffffff',
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    <Store size={20} />
                                                </div>
                                            )}
                                            <div>
                                                <p style={{ fontWeight: 700, margin: 0 }}>{item.name}</p>
                                                <p style={{ color: textSecondary, fontSize: 13, margin: 0 }}>@{item.slug}</p>
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
                                border: `1px solid ${borderColor}`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                {targetImgError || !getPublicLogoUrl(target.logo_url) ? (
                                    <div
                                        style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: 16,
                                            background: GRADIENT,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ffffff',
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
                                            border: `2px solid ${borderColor}`,
                                        }}
                                        onError={() => setTargetImgError(true)}
                                    />
                                )}
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 800, fontSize: 18, color: textPrimary }}>{target.name}</p>
                                    <p style={{ color: textSecondary, fontSize: 14 }}>Agendamento na loja</p>
                                </div>
                                {!initialStoreId && (
                                    <button
                                        onClick={() => { setTarget(null); setStep('search') }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: textSecondary,
                                        }}
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>

                            {/* ===== RESUMO DO AGENDAMENTO SE JÁ TIVER DATA/HORA ===== */}
                            {hasSelectedDateTime && (
                                <div
                                    style={{
                                        background: `linear-gradient(135deg, ${accentColor}10, ${accentColor}05)`,
                                        borderRadius: 12,
                                        padding: '12px 16px',
                                        marginBottom: 16,
                                        border: `1px solid ${accentColor}30`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <div>
                                        <span style={{ fontSize: 10, color: textSecondary, fontWeight: 600 }}>
                                            DATA E HORA SELECIONADAS
                                        </span>
                                        <p style={{ fontWeight: 700, fontSize: 14, color: textPrimary, margin: 0 }}>
                                            {selectedDate?.toLocaleDateString('pt-BR', {
                                                day: 'numeric',
                                                month: 'short'
                                            })} • {selectedTime}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedDate(null)
                                            setSelectedTime(null)
                                            setShowCalendar(false)
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: textSecondary,
                                            padding: '4px 8px',
                                            borderRadius: 8,
                                            fontSize: 12,
                                            fontWeight: 600,
                                        }}
                                    >
                                        Alterar
                                    </button>
                                </div>
                            )}

                            {/* ===== SELEÇÃO DE SERVIÇOS ===== */}
                            <div id="service-selection" style={{ marginBottom: 16 }}>
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2 block">
                                    Selecione os serviços <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                {loadingProducts ? (
                                    <div style={{ padding: 12, textAlign: 'center', color: textSecondary }}>
                                        Carregando...
                                    </div>
                                ) : storeProducts.length === 0 ? (
                                    <div style={{
                                        padding: 16,
                                        textAlign: 'center',
                                        color: textSecondary,
                                        border: `1px dashed ${borderColor}`,
                                        borderRadius: 12,
                                    }}>
                                        <Store size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                        <p style={{ fontSize: 13, fontWeight: 600 }}>Nenhum serviço disponível</p>
                                        <p style={{ fontSize: 11, opacity: 0.7 }}>Esta loja ainda não cadastrou serviços</p>
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
                                                            ? `2px solid ${accentColor}`
                                                            : `1px solid ${borderColor}`,
                                                        background: isInSelection
                                                            ? `${accentColor}15`
                                                            : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        color: textPrimary,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 4,
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
                                                        {product.name}
                                                    </span>
                                                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: textSecondary }}>
                                                        {product.duration_minutes && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                                <Clock size={12} /> {product.duration_minutes}min
                                                            </span>
                                                        )}
                                                        {product.price !== undefined && product.price > 0 && (
                                                            <span style={{ fontWeight: 700, color: accentColor }}>
                                                                R$ {product.price.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isInSelection && (
                                                        <span style={{ fontSize: 10, color: accentColor, fontWeight: 700 }}>
                                                            ✓ Adicionado
                                                        </span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ===== VALIDAÇÃO DE ERRO ===== */}
                            {validationError && (
                                <div
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: 12,
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        marginBottom: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}
                                >
                                    <AlertCircle size={16} style={{ color: '#ef4444' }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                                        {validationError}
                                    </span>
                                </div>
                            )}

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
                                                    border: `1px solid ${borderColor}`,
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.product.name}
                                                    </p>
                                                    <p style={{ fontSize: 11, color: textSecondary, margin: 0 }}>
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
                                                            background: borderColor,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            color: textPrimary,
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
                                                            background: accentColor,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            color: '#ffffff',
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
                                        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: accentColor }}>
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
                                        border: `1px solid ${borderColor}`,
                                        fontSize: 15,
                                        outline: 'none',
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        color: textPrimary,
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
                                        color: isEditingNote ? accentColor : textSecondary,
                                    }}
                                    title="Reverter para nota automática"
                                >
                                    <Edit3 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* ===== CARD DE SUGESTÕES DE HORÁRIOS (aparece apenas se tiver serviços selecionados) ===== */}
                        {selectedItems.length > 0 && getNextAvailableSlots.length > 0 && !hasSelectedDateTime && !showCalendar && (
                            <div
                                style={{
                                    background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`,
                                    borderRadius: 16,
                                    padding: '16px',
                                    marginBottom: 20,
                                    border: `1px solid ${accentColor}30`,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <Sparkles size={16} style={{ color: accentColor }} />
                                    <span style={{ fontWeight: 700, fontSize: 13, color: textPrimary }}>
                                        Sugestões de horários
                                    </span>
                                    <span style={{ fontSize: 10, color: textSecondary, marginLeft: 'auto' }}>
                                        próximos disponíveis
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {getNextAvailableSlots.map((slot, index) => {
                                        const isSelected = selectedDate &&
                                            selectedDate.toDateString() === slot.date.toDateString() &&
                                            selectedTime === slot.time

                                        return (
                                            <button
                                                key={`${slot.dateStr}-${slot.time}`}
                                                onClick={() => {
                                                    setSelectedDate(slot.date)
                                                    setSelectedTime(slot.time)
                                                    setValidationError(null)
                                                    setStep('confirm')
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '10px 14px',
                                                    borderRadius: 12,
                                                    background: isSelected
                                                        ? accentColor
                                                        : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                    border: `1px solid ${isSelected ? accentColor : borderColor}`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    width: '100%',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        color: isSelected ? '#ffffff' : textPrimary
                                                    }}>
                                                        {formatDate(slot.date)}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 10,
                                                        color: isSelected ? '#ffffff' : textSecondary,
                                                        opacity: 0.7
                                                    }}>
                                                        •
                                                    </span>
                                                    <span style={{
                                                        fontWeight: 700,
                                                        fontSize: 15,
                                                        color: isSelected ? '#ffffff' : textPrimary
                                                    }}>
                                                        {slot.time}
                                                    </span>
                                                </div>
                                                <ArrowRight
                                                    size={16}
                                                    style={{
                                                        color: isSelected ? '#ffffff' : accentColor,
                                                        opacity: isSelected ? 1 : 0.6
                                                    }}
                                                />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ===== BOTÃO PARA VER CALENDÁRIO (PILL STYLE) ===== */}
                        {!hasSelectedDateTime && (
                            <div style={{ marginBottom: 20 }}>
                                {!showCalendar ? (
                                    <button
                                        onClick={() => {
                                            if (selectedItems.length === 0) {
                                                setValidationError('⚠️ Selecione pelo menos um serviço primeiro')
                                                const serviceSection = document.getElementById('service-selection')
                                                if (serviceSection) {
                                                    serviceSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                                }
                                                return
                                            }
                                            setShowCalendar(true)
                                        }}
                                        style={{
                                            ...pillButtonStyle,
                                            width: '100%',
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: `0 4px 12px ${accentColor}40`,
                                            fontSize: '0.875rem',
                                            padding: '0.75rem 1.5rem',
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        <Eye size={18} />
                                        Ver calendário completo
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowCalendar(false)}
                                        style={{
                                            ...pillButtonStyle,
                                            width: '100%',
                                            background: 'transparent',
                                            border: `1px solid ${borderColor}`,
                                            color: textSecondary,
                                            fontSize: '0.875rem',
                                            padding: '0.75rem 1.5rem',
                                        }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        <X size={16} />
                                        Fechar calendário
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ===== CALENDÁRIO ===== */}
                        {showCalendar && !hasSelectedDateTime && (
                            <div
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                    backdropFilter: 'blur(12px)',
                                    borderRadius: 28,
                                    padding: 24,
                                    marginBottom: 24,
                                    border: `1px solid ${borderColor}`,
                                    animation: 'slideDown 0.3s ease-out',
                                }}
                            >
                                <style>{`
                                    @keyframes slideDown {
                                        from {
                                            opacity: 0;
                                            transform: translateY(-10px);
                                        }
                                        to {
                                            opacity: 1;
                                            transform: translateY(0);
                                        }
                                    }
                                `}</style>
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
                                        <ChevronLeft size={20} color={textPrimary} />
                                    </button>
                                    <strong style={{ fontSize: 19, color: textPrimary, fontWeight: 800 }}>
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
                                        <ChevronRight size={20} color={textPrimary} />
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
                                                color: textSecondary,
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
                                        let textColorStyle = textPrimary
                                        if (isSelected) {
                                            bgStyle = accentColor
                                            textColorStyle = '#ffffff'
                                        } else if (isPast) {
                                            bgStyle = 'transparent'
                                            textColorStyle = textSecondary
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
                                                disabled={isPast || freeCount === 0}
                                                onClick={() => {
                                                    setSelectedDate(date)
                                                    setSelectedTime(null)
                                                    setValidationError(null)
                                                }}
                                                style={{
                                                    height: 42,
                                                    border: isSelected
                                                        ? `2px solid ${accentColor}`
                                                        : 'none',
                                                    borderRadius: 14,
                                                    background: bgStyle,
                                                    color: textColorStyle,
                                                    cursor: (isPast || freeCount === 0) ? 'default' : 'pointer',
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
                        )}

                        {/* ===== HORÁRIOS DO DIA SELECIONADO ===== */}
                        {selectedDate && !hasSelectedDateTime && (
                            <div>
                                <h3
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 18,
                                        marginBottom: 16,
                                        color: textPrimary,
                                    }}
                                >
                                    Horários para {selectedDate.toLocaleDateString('pt-BR', {
                                        day: 'numeric',
                                        month: 'long'
                                    })}
                                </h3>
                                {allSlots.length === 0 ? (
                                    <div
                                        style={{
                                            padding: 28,
                                            textAlign: 'center',
                                            color: textSecondary,
                                            border: `1px dashed ${borderColor}`,
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
                                                            setValidationError(null)
                                                            setStep('confirm')
                                                        }}
                                                        style={{
                                                            padding: '16px 12px',
                                                            borderRadius: 18,
                                                            border:
                                                                selectedTime === slot.time
                                                                    ? `2px solid ${accentColor}`
                                                                    : `1px solid ${borderColor}`,
                                                            background:
                                                                selectedTime === slot.time
                                                                    ? accentColor
                                                                    : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            color:
                                                                selectedTime === slot.time
                                                                    ? '#ffffff'
                                                                    : textPrimary,
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
                                                            border: `1px solid ${borderColor}`,
                                                            background: isPublic
                                                                ? `${accentColor}20`
                                                                : 'rgba(239, 68, 68, 0.15)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            color: textPrimary,
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
                                                                    color: accentColor,
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

                {/* ===== TELA DE CONFIRMAÇÃO COM LOGIN ===== */}
                {step === 'confirm' && selectedDate && selectedTime && target && (
                    <div style={{ textAlign: 'center' }}>
                        {/* ===== SE NÃO ESTIVER AUTENTICADO, MOSTRA O FORMULÁRIO DE LOGIN ===== */}
                        {!isAuthenticated ? (
                            <div id="auth-section" className="space-y-4">
                                <div
                                    style={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: 20,
                                        background: GRADIENT,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 16px',
                                        boxShadow: `0 10px 30px ${accentColor}40`,
                                    }}
                                >
                                    <Lock size={34} color="#ffffff" />
                                </div>
                                <h2 style={{ fontWeight: 800, fontSize: 20, color: textPrimary }}>
                                    Identifique-se para agendar
                                </h2>
                                <p style={{ color: textSecondary, fontSize: 13 }}>
                                    Faça login ou crie uma conta para confirmar seu agendamento
                                </p>

                                {authError && (
                                    <div className="p-3 rounded-full text-[10px] font-black text-center" style={{ background: '#f9731620', color: '#f97316' }}>
                                        ⚠️ {authError}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAuthMode('login')}
                                        className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'login' ? 'shadow-sm' : ''}`}
                                        style={authMode === 'login' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: textSecondary, border: `2px solid ${borderColor}` }}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        onClick={() => setAuthMode('register')}
                                        className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'register' ? 'shadow-sm' : ''}`}
                                        style={authMode === 'register' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: textSecondary, border: `2px solid ${borderColor}` }}
                                    >
                                        Criar Conta
                                    </button>
                                </div>

                                {authMode === 'login' ? (
                                    <form onSubmit={handleLogin} className="space-y-3">
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                            style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                            autoComplete="email"
                                        />
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="sua senha"
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm pr-10"
                                                style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                                value={authPassword}
                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                required
                                                autoComplete="current-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                                style={{ color: textSecondary }}
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={authLoading}
                                            className="w-full py-2.5 rounded-full font-black uppercase text-xs tracking-wider transition-all disabled:opacity-50"
                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                        >
                                            {authLoading ? 'Entrando...' : 'Entrar'}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleRegister} className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="Nome Completo"
                                            className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                            style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                            value={authName}
                                            onChange={(e) => setAuthName(e.target.value)}
                                            required
                                            autoComplete="name"
                                        />
                                        <div className="flex items-center gap-1 border-2 rounded-full px-3" style={{ background: colors.surface, borderColor: borderColor }}>
                                            <span className="text-[9px] font-black" style={{ color: textSecondary }}>iuser.com.br/</span>
                                            <input
                                                type="text"
                                                placeholder="seu-perfil"
                                                className="flex-1 py-2.5 bg-transparent text-sm outline-none"
                                                style={{ color: textPrimary }}
                                                value={authProfileSlug}
                                                onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                required
                                                autoComplete="off"
                                            />
                                            {isSlugAvailable !== null && (
                                                <span className={`text-[9px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                                    {isSlugAvailable ? '✓' : '✗'}
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                            style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                            autoComplete="email"
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Senha"
                                            className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                            style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                            value={authPassword}
                                            onChange={(e) => setAuthPassword(e.target.value)}
                                            required
                                            autoComplete="new-password"
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Confirmar senha"
                                            className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                            style={{ background: colors.surface, borderColor: borderColor, color: textPrimary }}
                                            value={authConfirmPassword}
                                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                            required
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="submit"
                                            disabled={authLoading || isSlugAvailable === false}
                                            className="w-full py-2.5 rounded-full font-black uppercase text-xs tracking-wider transition-all disabled:opacity-50"
                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                        >
                                            {authLoading ? 'Criando...' : 'Criar Conta'}
                                        </button>
                                    </form>
                                )}

                                <button
                                    onClick={goBack}
                                    style={{
                                        ...pillButtonStyle,
                                        width: '100%',
                                        background: 'transparent',
                                        border: `1px solid ${borderColor}`,
                                        color: textSecondary,
                                        fontSize: '0.875rem',
                                        padding: '0.75rem 1.5rem',
                                    }}
                                    className="hover:opacity-70 transition-opacity"
                                >
                                    Voltar
                                </button>
                            </div>
                        ) : (
                            // ===== USUÁRIO AUTENTICADO - MOSTRA CONFIRMAÇÃO =====
                            <>
                                <div
                                    style={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: 20,
                                        background: GRADIENT,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 24px',
                                        boxShadow: `0 10px 30px ${accentColor}40`,
                                    }}
                                >
                                    <Calendar size={34} color="#ffffff" />
                                </div>
                                <h2
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 24,
                                        color: textPrimary,
                                        marginBottom: 4,
                                    }}
                                >
                                    {appointmentNote || 'Compromisso'}
                                </h2>
                                <p style={{ color: textSecondary, fontSize: 13, marginBottom: 16 }}>
                                    {target.name} • {currentUserSlug && `@${currentUserSlug}`}
                                </p>

                                {selectedItems.length === 0 && (
                                    <div
                                        style={{
                                            padding: '12px 16px',
                                            borderRadius: 12,
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            marginBottom: 16,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            textAlign: 'left',
                                        }}
                                    >
                                        <AlertCircle size={16} style={{ color: '#ef4444' }} />
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                                            ⚠️ Nenhum serviço selecionado. Volte e escolha pelo menos um serviço.
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 14,
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                            borderRadius: 18,
                                            padding: 18,
                                            border: `1px solid ${borderColor}`,
                                        }}
                                    >
                                        <Calendar size={22} color={accentColor} />
                                        <div style={{ textAlign: 'left' }}>
                                            <p style={{ fontWeight: 700, color: textPrimary, fontSize: 15 }}>Data</p>
                                            <p style={{ color: textSecondary, fontSize: 14 }}>
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
                                            border: `1px solid ${borderColor}`,
                                        }}
                                    >
                                        <Clock size={22} color={accentColor} />
                                        <div style={{ textAlign: 'left' }}>
                                            <p style={{ fontWeight: 700, color: textPrimary, fontSize: 15 }}>Horário</p>
                                            <p style={{ color: textSecondary, fontSize: 14 }}>{selectedTime}</p>
                                        </div>
                                    </div>
                                    {selectedItems.length > 0 && (
                                        <div
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                borderRadius: 18,
                                                padding: 18,
                                                border: `1px solid ${borderColor}`,
                                                textAlign: 'left',
                                            }}
                                        >
                                            <p style={{ fontWeight: 700, color: textPrimary, fontSize: 15, marginBottom: 8 }}>Serviços</p>
                                            {selectedItems.map(item => (
                                                <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: textSecondary, marginBottom: 4 }}>
                                                    <span>{item.product.name}</span>
                                                    <span>x{item.quantity}</span>
                                                </div>
                                            ))}
                                            <div style={{ borderTop: `1px solid ${borderColor}`, marginTop: 8, paddingTop: 8, fontWeight: 700, color: accentColor }}>
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
                                            border: `1px solid ${borderColor}`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 600, color: textPrimary, fontSize: 15 }}>
                                                {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                            </span>
                                            <div style={{ display: 'flex', gap: 4, background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, borderRadius: 16, padding: 3 }}>
                                                <button
                                                    onClick={() => setIsPublic(false)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '6px 14px',
                                                        borderRadius: 14,
                                                        border: 'none',
                                                        background: !isPublic ? GRADIENT : 'transparent',
                                                        color: !isPublic ? '#ffffff' : textSecondary,
                                                        fontWeight: 700,
                                                        fontSize: 13,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <Lock size={14} /> <span>Privado</span>
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
                                                        background: isPublic ? GRADIENT : 'transparent',
                                                        color: isPublic ? '#ffffff' : textSecondary,
                                                        fontWeight: 700,
                                                        fontSize: 13,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <Earth size={14} /> <span>Público</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={goBack}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: 'transparent',
                                            border: `1px solid ${borderColor}`,
                                            color: textSecondary,
                                            fontSize: '0.875rem',
                                            padding: '0.75rem 1.5rem',
                                        }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleConfirmClick}
                                        disabled={submitting || selectedItems.length === 0}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: selectedItems.length === 0 ? borderColor : GRADIENT,
                                            color: selectedItems.length === 0 ? textSecondary : '#ffffff',
                                            fontSize: '0.875rem',
                                            padding: '0.75rem 1.5rem',
                                            opacity: (submitting || selectedItems.length === 0) ? 0.5 : 1,
                                            cursor: selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        <Check size={20} /> {submitting ? 'Salvando...' : 'Confirmar'}
                                    </button>
                                </div>
                                {selectedItems.length === 0 && (
                                    <p style={{ fontSize: 11, color: '#ef4444', marginTop: 8, fontWeight: 600 }}>
                                        ⚠️ Selecione um serviço para confirmar
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}