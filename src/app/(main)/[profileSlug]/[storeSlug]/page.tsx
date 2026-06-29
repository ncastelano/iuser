// src/app/(app)/[profileSlug]/[storeSlug]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Search,
    Share2,
    Clock,
    MapPin,
    ExternalLink,
    Settings,
    Star,
    X,
    Plus,
    Navigation,
    Shield,
    Grid3X3,
    MessageCircle,
    QrCode,
    Eye,
    ShoppingCart,
    Home,
    ShoppingBag,
    Store
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleModal } from '@/components/ScheduleModal'
import { getAvatarUrl } from '@/lib/avatar'
import { RatingStars } from '@/components/ratings/RatingStars'
import { StoreFlow } from '../../eu/components/StoreFlow'
import { useCartStore } from '@/store/useCartStore'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import SacolaButton from '@/app/SacolaButton'   // ← importa o mesmo botão da HomePage

type RatingRow = {
    id: string
    rating: number
    profile_id: string
    created_at: string
    comment?: string
    is_anonymous?: boolean
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
        profileSlug?: string | null
    } | null
    products?: {
        name: string
    } | null
}

type SaleType = {
    id: string
    buyer_id: string
    buyer_name?: string
    product_id?: string
    product_name?: string
    store_id: string
    created_at: string
    rating?: number
    comment?: string
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
    products?: {
        name: string
    } | null
}

type AppointmentType = {
    id: string
    start_time: string
    service_name: string
    status: string
    client_id: string
    store_id: string
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

type StoreType = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    is_open: boolean
    logo_url?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    final_whatsapp?: string | null
    whatsapp?: string | null
    category_order?: string[] | null
    allow_scheduling?: boolean
    business_hours?: Record<string, { open: string; close: string }> | null
    location?: any
    view_count?: number
}

const formatAddress = (fullAddress: string | null | undefined): string => {
    if (!fullAddress) return 'Endereço não informado'
    const parts = fullAddress.split(',').map(p => p.trim())
    if (parts.length >= 2) {
        const streetWithNumber = parts[0]
        let city = ''
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i]
            if (
                !/^[A-Z]{2}$/.test(part) &&
                part.toLowerCase() !== 'brasil' &&
                part.length > 2 &&
                !part.includes('CEP')
            ) {
                city = part
                break
            }
        }
        const result = city ? `${streetWithNumber}, ${city}` : streetWithNumber
        return result.length > 30 ? result.substring(0, 27) + '...' : result
    }
    return fullAddress.length > 30 ? fullAddress.substring(0, 27) + '...' : fullAddress
}

const DAY_LABELS: Record<string, string> = {
    mon: 'Segunda-feira',
    tue: 'Terça-feira',
    wed: 'Quarta-feira',
    thu: 'Quinta-feira',
    fri: 'Sexta-feira',
    sat: 'Sábado',
    sun: 'Domingo',
}

function getTodayKey(): string {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    return days[new Date().getDay()]
}

function getTodaySchedule(businessHours: Record<string, { open: string; close: string }> | null | undefined) {
    if (!businessHours) return null
    const todayKey = getTodayKey()
    return businessHours[todayKey] || null
}

function isOpenNow(schedule: { open: string; close: string } | null | undefined): boolean {
    if (!schedule || !schedule.open || !schedule.close) return false
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [openH, openM] = schedule.open.split(':').map(Number)
    let [closeH, closeM] = schedule.close.split(':').map(Number)
    if (closeH === 0 && closeM === 0) {
        closeH = 24
    }
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
}

type TabType = 'products' | 'reviews'

// ------------------- Helpers para o novo sistema de visitantes -------------------
const COOLDOWN_MINUTES = 30
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000

function getOrCreateAnonymousId(): string {
    const key = 'iuser_anon_id'
    let id = localStorage.getItem(key)
    if (!id) {
        id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
        localStorage.setItem(key, id)
    }
    return id
}

function getOrCreateSessionId(): string {
    const key = 'iuser_sid'
    let id = sessionStorage.getItem(key)
    if (!id) {
        id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
        sessionStorage.setItem(key, id)
    }
    return id
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const ua = navigator.userAgent
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet'
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile'
    return 'desktop'
}
// --------------------------------------------------------------------------------

export default function StorePage() {
    const params = useParams()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const router = useRouter()

    const { colors } = useTheme()
    const { bgMode, customBgUrl } = useProfile()

    const [store, setStore] = useState<StoreType | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [myRating, setMyRating] = useState(0)
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
    const [recentSales, setRecentSales] = useState<SaleType[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<AppointmentType[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [cartAnimating, setCartAnimating] = useState(false)
    const { itemsByStore, addItem, removeItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []

    const [adminPanelOpen, setAdminPanelOpen] = useState(false)
    const [adminSales, setAdminSales] = useState<any[]>([])
    const [storeViews, setStoreViews] = useState(0)
    const [productViews, setProductViews] = useState(0)

    const [showAllHours, setShowAllHours] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [activeTab, setActiveTab] = useState<TabType>('products')

    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80

    // ---------- Estados para o SacolaButton (mesmo da HomePage) ----------
    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    // ---------- Captura de visitas (sempre insere em store_visits) ----------
    const captureVisit = useCallback(
        async (storeId: string, userId: string | null) => {
            const anonymousId = userId ? null : getOrCreateAnonymousId()
            const sessionId = getOrCreateSessionId()
            const device = getDeviceType()
            const referrer = document.referrer || null
            const userAgent = navigator.userAgent || null

            const { error } = await supabase.from('store_visits').insert({
                store_id: storeId,
                viewer_id: userId || null,
                anonymous_id: anonymousId,
                session_id: sessionId,
                device_type: device,
                referrer,
                user_agent: userAgent,
            })
            if (error) console.warn('[StorePage] Erro ao registrar visita:', error.message)
        },
        [supabase]
    )

    const captureProductView = useCallback(
        async (productId: string, storeId: string, userId: string | null) => {
            const anonymousId = userId ? null : getOrCreateAnonymousId()
            const sessionId = getOrCreateSessionId()
            const device = getDeviceType()
            const referrer = document.referrer || null
            const userAgent = navigator.userAgent || null

            const { error } = await supabase.from('product_views').insert({
                product_id: productId,
                store_id: storeId,
                viewer_id: userId || null,
                anonymous_id: anonymousId,
                session_id: sessionId,
                device_type: device,
                referrer,
                user_agent: userAgent,
            })
            if (error) console.warn('[StorePage] Erro ao registrar view do produto:', error.message)
        },
        [supabase]
    )

    // ---------- Outras funções ----------
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(
            p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

    const groupedProducts = useMemo(() => {
        const groups: Record<string, any[]> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        return groups
    }, [filteredProducts])

    const isStoreOpen = useMemo(() => {
        if (!store) return false
        const todaySchedule = getTodaySchedule(store.business_hours)
        if (todaySchedule) {
            return isOpenNow(todaySchedule)
        }
        return store.is_open
    }, [store])

    const toggleScheduling = async () => {
        if (!store) return
        const newStatus = !store.allow_scheduling
        const { error } = await supabase
            .from('stores')
            .update({ allow_scheduling: newStatus })
            .eq('id', store.id)
        if (error) {
            toast.error('Erro ao atualizar permissão de agendamentos.')
            return
        }
        setStore(prev => (prev ? { ...prev, allow_scheduling: newStatus } : null))
        toast.success(newStatus ? 'Agendamentos permitidos!' : 'Agendamentos cancelados.')
    }

    useEffect(() => {
        setMounted(true)
    }, [])

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

    const loadRatings = useCallback(
        async (storeId: string, userId: string | null) => {
            const { data, error: ratingsError } = await supabase
                .from('product_reviews')
                .select(
                    'id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")'
                )
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
            if (ratingsError) return
            const rows = (data || []).map((r: any) => ({
                ...r,
                profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                products: Array.isArray(r.products) ? r.products[0] : r.products,
            })) as RatingRow[]
            setRatings(rows)
            if (rows.length > 0) {
                const sum = rows.reduce((acc, r) => acc + r.rating, 0)
                const avg = sum / rows.length
                setStore((prev: StoreType | null) =>
                    prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null
                )
            }
            const myLatest = rows.find(rating => rating.profile_id === userId)
            setMyRating(myLatest?.rating ?? 0)
        },
        [supabase]
    )

    // ---------- Carregar loja e dados ----------
    const loadStore = useCallback(async () => {
        if (!storeSlug) return
        setLoading(true)
        setError(null)
        const { data: foundStore, error: storeError } = await supabase
            .from('stores')
            .select('*')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()
        if (storeError) {
            setError(`Erro ao buscar loja: ${storeError.message}`)
            setLoading(false)
            return
        }
        if (!foundStore) {
            setLoading(false)
            return
        }

        const logoUrl = foundStore.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(foundStore.logo_url).data.publicUrl
            : null
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)
        setIsOwner(userId === foundStore.owner_id)

        // Apenas lê o view_count do banco, sem incrementar aqui
        setTotalVisitors(foundStore.view_count ?? 0)

        // Produtos
        const { data: productsData } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })
        const mappedProducts = (productsData || []).map(product => ({
            ...product,
            image_url: product.image_url
                ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                : null,
        }))

        // WhatsApp
        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('whatsapp')
                .eq('id', foundStore.owner_id)
                .single()
            storeWhatsapp = profile?.whatsapp
        }

        setStore({ ...foundStore, logo_url: logoUrl, final_whatsapp: storeWhatsapp })
        setProducts(mappedProducts)
        await loadRatings(foundStore.id, userId)

        // Agendamentos de hoje
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString()
        const { data: todayData } = await supabase
            .from('appointments')
            .select('*, profiles:client_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id)
            .gte('start_time', startOfDay)
            .lte('start_time', endOfDay)
            .neq('status', 'declined')
            .order('start_time', { ascending: true })
        setAppointmentsToday(
            (todayData || []).map((item: any) => ({
                ...item,
                profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
            }))
        )

        // Vendas recentes (avaliações)
        const { data: salesData } = await supabase
            .from('product_reviews')
            .select(
                'id, rating, comment, is_anonymous, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")'
            )
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })
            .limit(10)

        setRecentSales(
            (salesData || []).map((item: any) => ({
                ...item,
                profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
                products: Array.isArray(item.products) ? item.products[0] : item.products,
                buyer_name: item.profiles?.name || 'Cliente',
                product_name: item.is_anonymous ? 'Avaliação da Loja' : item.products?.name || 'Produto',
                buyer_id: item.profiles?.id,
            }))
        )

        setLoading(false)
    }, [storeSlug, supabase, loadRatings])

    useEffect(() => {
        loadStore()
    }, [loadStore])

    // ---------- Incremento do contador após 3s (com cooldown) ----------
    useEffect(() => {
        if (!store) return

        const storeId = store.id
        let cancelled = false

        const timer = setTimeout(async () => {
            if (cancelled) return

            const cooldownKey = `iuser_vt_${storeId}`
            const lastVisit = localStorage.getItem(cooldownKey)
            const now = Date.now()

            if (lastVisit && now - Number(lastVisit) < COOLDOWN_MS) {
                return // ainda em cooldown
            }

            localStorage.setItem(cooldownKey, String(now))

            // Anima +1 visualmente
            setTotalVisitors(prev => prev + 1)

            // Registra a visita em store_visits
            const { data: { user } } = await supabase.auth.getUser()
            const userId = user?.id ?? null
            if (!cancelled) {
                await captureVisit(storeId, userId)
            }

            // Incrementa view_count via RPC
            if (!cancelled) {
                const { data: newCount, error: rpcError } = await supabase
                    .rpc('increment_store_view', { store_id: storeId })
                if (!rpcError && typeof newCount === 'number') {
                    setTotalVisitors(newCount)
                } else {
                    console.warn('[StorePage] Erro ao incrementar view_count:', rpcError)
                }
            }
        }, 3000)

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store?.id])

    // ---------- Atualização em tempo real do contador de visitantes ----------
    useEffect(() => {
        if (!store) return

        const channel = supabase
            .channel(`store-${store.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'stores',
                    filter: `id=eq.${store.id}`,
                },
                (payload) => {
                    const newCount = payload.new.view_count as number
                    if (typeof newCount === 'number') {
                        setTotalVisitors(newCount)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [store?.id])

    // ---------- Admin panel (usando store_visits) ----------
    useEffect(() => {
        if (!adminPanelOpen || !store) return
        const loadAdminData = async () => {
            const { data: salesData } = await supabase
                .from('store_sales')
                .select('*')
                .eq('store_id', store.id)
                .order('created_at', { ascending: false })
                .limit(50)
            setAdminSales(salesData || [])

            const { data: adminViewsData } = await supabase
                .from('store_visits')
                .select('viewer_id, anonymous_id')
                .eq('store_id', store.id)
            const uniqueLogados = new Set(adminViewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
            const uniqueAnonimos = new Set(adminViewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
            setStoreViews(uniqueLogados.size + uniqueAnonimos.size)

            const { count: prodViewsCount } = await supabase
                .from('product_views')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', store.id)
            setProductViews(prodViewsCount || 0)
        }
        loadAdminData()
    }, [adminPanelOpen, store, supabase])

    const openGoogleMaps = () => {
        if (!store) return
        let url = ''
        if (store.location) {
            try {
                let lat: number | null = null
                let lng: number | null = null
                if (typeof store.location === 'string') {
                    const match = store.location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
                    if (match) {
                        lng = parseFloat(match[1])
                        lat = parseFloat(match[2])
                    }
                } else if (store.location.type === 'Point' && Array.isArray(store.location.coordinates)) {
                    lng = store.location.coordinates[0]
                    lat = store.location.coordinates[1]
                }
                if (lat !== null && lng !== null) {
                    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                }
            } catch (e) {
                console.error('Erro ao extrair coordenadas:', e)
            }
        }
        if (!url && store.address) {
            url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
        }
        if (url) {
            window.open(url, '_blank')
        } else {
            toast.error('Localização não disponível')
        }
    }

    const toggleProduct = (product: any) => {
        if (isOwner) {
            router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
            return
        }
        const isSelected = cartItems.some((item: any) => item.product.id === product.id)
        if (isSelected) {
            removeItem(storeSlug as string, product.id)
            setCartAnimating(true)
            setTimeout(() => setCartAnimating(false), 500)
        } else {
            if (store) captureProductView(product.id, store.id, currentUserId)
            addItem(storeSlug as string, { name: store!.name, logo_url: store!.logo_url ?? null }, product)
            setCartAnimating(true)
            setTimeout(() => setCartAnimating(false), 500)
        }
    }

    const handleProductClick = (product: any) => {
        toggleProduct(product)
    }

    const shareProduct = (product: any) => {
        const url = `${window.location.origin}/${profileSlug}/${storeSlug}/${product.slug || product.id}`
        if (navigator.share) {
            navigator.share({
                title: product.name,
                text: `${product.name} - ${store?.name}`,
                url: url,
            }).catch(() => { })
        } else {
            navigator.clipboard?.writeText(url).then(() => {
                toast.success('Link copiado!')
            }).catch(() => {
                const textarea = document.createElement('textarea')
                textarea.value = url
                document.body.appendChild(textarea)
                textarea.select()
                document.execCommand('copy')
                document.body.removeChild(textarea)
                toast.success('Link copiado!')
            })
        }
    }

    // ---------- Busca status dos pedidos (para o SacolaButton) ----------
    useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: orders } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (orders) {
                setPendingCount(orders.filter(o => o.status === 'pending').length)
                setPreparingCount(orders.filter(o => o.status === 'preparing').length)
                setReadyCount(orders.filter(o => o.status === 'ready').length)
            }

            const { data: purchases } = await supabase
                .from('store_sales')
                .select('id')
                .eq('buyer_id', user.id)
                .eq('status', 'paid')

            if (purchases) {
                const { data: reviews } = await supabase
                    .from('product_reviews')
                    .select('id')
                    .eq('profile_id', user.id)

                const reviewedIds = new Set(reviews?.map(r => r.id) || [])
                const pending = purchases.filter(p => !reviewedIds.has(p.id)).length
                setPendingReviewsCount(pending)
            }
        }
        fetchOrderStatuses()
    }, [])

    // ---------- Animação do carrinho (mesma lógica da HomePage) ----------
    useEffect(() => {
        if (cartItems.length > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [cartItems.length])

    // ---------- Estilos baseados no tema ----------
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    const primaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1.25rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        background: colors.accent,
        color: colors.accentText,
        border: 'none',
        boxShadow: `0 4px 14px ${colors.accent}60`,
        cursor: 'pointer',
    }

    // ---------- Loading transparente ----------
    if (loading) return <LoadingSpinner message="Carregando loja..." />

    if (error || !store)
        return (
            <div className="min-h-screen flex items-center justify-center px-4 text-center" style={{ background: colors.background }}>
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    {error ? (
                        <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    ) : (
                        <Search className="w-12 h-12" style={{ color: colors.textSecondary }} />
                    )}
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error ? 'Erro ao carregar' : 'Loja não encontrada'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {error || `Nenhuma loja com /${storeSlug} foi encontrada.`}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="font-bold mt-2"
                        style={{ color: colors.accent }}
                    >
                        Voltar
                    </button>
                </div>
            </div>
        )

    return (
        <div className="relative flex flex-col min-h-screen pb-28" style={{ background: colors.background }}>
            {/* Fundo animado */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <style jsx global>{`@keyframes float{0%,100%{transform:translateY(0px) rotate(0deg)}50%{transform:translateY(-15px) rotate(5deg)}}`}</style>

            {store && (
                <ScheduleModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    onSuccess={loadStore}
                    store={{ id: store.id, name: store.name, storeSlug: store.storeSlug }}
                />
            )}

            {/* Header */}
            <header className="sticky top-0 z-50 px-3 py-3 backdrop-blur-xl border-b" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.8)`, borderColor: colors.border }}>
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.push('/')}
                        className="flex w-10 h-10 items-center justify-center rounded-2xl border transition-all hover:scale-105 active:scale-95 shadow-sm"
                        style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-1">
                        {[
                            { icon: MessageCircle, action: undefined },
                            { icon: QrCode, action: undefined },
                            { icon: Navigation, action: openGoogleMaps },
                            { icon: Share2, action: () => navigator.share?.({ title: store.name, url: storeUrl }).catch(() => { }) },
                            ...(isOwner ? [{ icon: Settings, action: () => setAdminPanelOpen(true) }] : []),
                        ].map(({ icon: Icon, action }, idx) => (
                            <button
                                key={idx}
                                onClick={action}
                                className="flex w-9 h-9 items-center justify-center rounded-2xl border transition-all hover:scale-105 active:scale-95 shadow-sm"
                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}
                            >
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-4 py-4 flex flex-col gap-5">
                {/* Cabeçalho da loja */}
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                        <div
                            className="w-16 h-16 rounded-2xl p-[3px] shadow-xl"
                            style={{
                                background: isStoreOpen
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                            }}
                        >
                            <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                {store.logo_url ? (
                                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xl font-black" style={{ color: colors.accent }}>
                                        {store.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black tracking-tight" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                            <div className="flex items-center gap-1">
                                <Eye size={12} />
                                <span className="font-bold">{totalVisitors} visitantes</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Descrição */}
                {store.description && (
                    <div className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                        {expandedDesc || store.description.length <= DESC_LIMIT
                            ? store.description
                            : `${store.description.slice(0, DESC_LIMIT)}...`}
                        {store.description.length > DESC_LIMIT && (
                            <button
                                onClick={() => setExpandedDesc(!expandedDesc)}
                                className="ml-1 font-bold text-xs uppercase hover:underline"
                                style={{ color: colors.accent }}
                            >
                                {expandedDesc ? 'ver menos' : 'ver mais'}
                            </button>
                        )}
                    </div>
                )}

                {/* Pills de ação */}
                <div className="flex flex-wrap items-center gap-2">
                    {store.address && (
                        <button
                            onClick={openGoogleMaps}
                            className="group flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold shadow-sm hover:scale-105 transition-all"
                            style={{
                                background: colors.accent,
                                borderColor: colors.accent,
                                color: colors.accentText,
                            }}
                        >
                            <span className="truncate max-w-[100px]">{formatAddress(store.address)}</span>
                            <span className="flex items-center gap-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                                <span className="hidden sm:inline">Ir</span>
                                <Navigation className="w-3 h-3" />
                            </span>
                        </button>
                    )}
                    {store.allow_scheduling && (
                        <button
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold shadow-md hover:scale-105 transition-transform"
                            style={{ background: colors.accent, color: colors.accentText }}
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            Agendar horário
                        </button>
                    )}
                    {isOwner ? (
                        <button
                            onClick={() => router.push(`/${profileSlug}/${storeSlug}/editar-loja`)}
                            className="flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold shadow-sm hover:scale-105 transition-all"
                            style={{
                                background: colors.accent,
                                borderColor: colors.accent,
                                color: colors.accentText,
                            }}
                        >
                            <span>Editar Horários</span>
                            <Clock className="w-3.5 h-3.5" />
                        </button>
                    ) : (
                        store.business_hours && Object.keys(store.business_hours).length > 0 && (
                            <button
                                onClick={() => setShowAllHours(true)}
                                className="group flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold shadow-sm hover:scale-105 transition-all"
                                style={{
                                    background: isStoreOpen ? '#10b981' : '#ef4444',
                                    borderColor: isStoreOpen ? '#10b981' : '#ef4444',
                                    color: '#ffffff',
                                }}
                            >
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#ffffff' }} />
                                <span>
                                    {getTodaySchedule(store.business_hours) && isOpenNow(getTodaySchedule(store.business_hours)) ? 'Aberto' : 'Fechado'}
                                </span>
                                <span className="flex items-center gap-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                                    <span className="hidden sm:inline">Ver</span>
                                    <span>›</span>
                                </span>
                            </button>
                        )
                    )}
                </div>

                {/* Agendados hoje */}
                {appointmentsToday.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textSecondary }}>Hoje</h4>
                        <div className="grid grid-cols-2 gap-3">
                            {appointmentsToday.slice(0, 4).map((appt, i) => (
                                <div
                                    key={appt.id || i}
                                    onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                    className="rounded-2xl p-3 border cursor-pointer hover:shadow-md transition-all"
                                    style={cardStyle}
                                >
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="relative">
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center shadow-md ring-2"
                                                style={{
                                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                                }}
                                            >
                                                {appt.profiles?.avatar_url ? (
                                                    <img src={getAvatarUrl(supabase, appt.profiles.avatar_url)!} className="w-full h-full object-cover rounded-full" alt="" />
                                                ) : (
                                                    <span className="text-xs font-black" style={{ color: colors.accentText }}>
                                                        {appt.profiles?.name?.charAt(0) || '?'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 rounded-full px-1.5 py-0.5 ring-2 ring-white flex items-center" style={{ background: colors.accent }}>
                                                <Clock className="w-2 h-2 mr-0.5" style={{ color: colors.accentText }} />
                                                <span className="text-[6px] font-black" style={{ color: colors.accentText }}>
                                                    {new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold truncate leading-tight" style={{ color: colors.textPrimary }}>{appt.profiles?.name || 'Cliente'}</p>
                                            <p className="text-[8px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Agendado</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl p-2 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.accentLight }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0" style={{ background: 'transparent' }}>
                                                <Calendar className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                                            </div>
                                            <p className="text-[9px] font-bold truncate leading-tight" style={{ color: colors.textPrimary }}>{appt.service_name || 'Agendamento'}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Botão Agendar grande */}
                {store.allow_scheduling && (
                    <button
                        onClick={() => setIsScheduleModalOpen(true)}
                        className="w-full py-3.5 rounded-2xl font-black uppercase text-sm tracking-wider shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
                        style={{ background: colors.accent, color: colors.accentText, boxShadow: `0 8px 24px ${colors.accent}50` }}
                    >
                        <Calendar className="w-5 h-5 inline mr-2" />
                        Agendar horário
                    </button>
                )}

                {/* Abas */}
                <div className="flex rounded-2xl p-1.5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.border }}>
                    <button
                        onClick={() => setActiveTab('products')}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${activeTab === 'products' ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={
                            activeTab === 'products'
                                ? { background: colors.accent, color: colors.accentText, boxShadow: `0 4px 12px ${colors.accent}50` }
                                : { background: 'transparent', color: colors.textSecondary }
                        }
                    >
                        <Grid3X3 className="w-4 h-4" />
                        <span>Produtos ou Serviços</span>
                    </button>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('reviews')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setActiveTab('reviews'); } }}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 cursor-pointer ${activeTab === 'reviews' ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={
                            activeTab === 'reviews'
                                ? { background: colors.accent, color: colors.accentText, boxShadow: `0 4px 12px ${colors.accent}50` }
                                : { background: 'transparent', color: colors.textSecondary }
                        }
                    >
                        <span>Avaliações</span>
                        {store.ratings_count ? (
                            <span className="flex items-center gap-1">
                                <RatingStars value={Number(store.ratings_avg || 0)} size={10} />
                                <span className="text-[10px] font-bold">{Number(store.ratings_avg || 0).toFixed(1)}</span>
                                <span className="text-[9px] opacity-75">({store.ratings_count})</span>
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* Produtos */}
                {activeTab === 'products' && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    placeholder="Buscar produtos..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full border rounded-2xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                                    style={{
                                        background: `${colors.surface}88`,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                    }}
                                />
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)}
                                    className="flex items-center justify-center w-10 h-10 rounded-xl border shadow-md hover:scale-110 transition-transform"
                                    style={{ background: colors.accent, color: colors.accentText, borderColor: colors.accent }}
                                    title="Adicionar produto"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {filteredProducts.length === 0 ? (
                            isOwner ? (
                                <div className="rounded-2xl p-6 flex flex-col items-center text-center gap-4" style={cardStyle}>
                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: colors.accentLight }}>
                                        <Store size={28} style={{ color: colors.accent }} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Sua loja está vazia</h3>
                                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                            Adicione produtos ou serviços para começar a vender.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)}
                                        className="w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Store size={18} />
                                        Adicionar Produto ou Serviço
                                    </button>
                                </div>
                            ) : (
                                <div className="py-16 text-center rounded-2xl border border-dashed flex flex-col items-center gap-3" style={cardStyle}>
                                    <Search className="w-12 h-12" style={{ color: colors.textSecondary }} />
                                    <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhum produto disponível</p>
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>Esta loja ainda não publicou nada.</p>
                                </div>
                            )
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] pl-1"
                                        style={{ color: colors.accent }}>
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {products.map(product => {
                                            const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                            const isHourly = product.price_type === 'hourly'
                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={() => handleProductClick(product)}
                                                    className={`relative rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${isSelected ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-400/20' : ''}`}
                                                    style={{
                                                        background: `${colors.surface}88`,
                                                        borderColor: isSelected ? '#22c55e' : colors.border,
                                                        backdropFilter: 'blur(8px)',
                                                        WebkitBackdropFilter: 'blur(8px)',
                                                    }}
                                                >
                                                    <div className="aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ color: colors.accent }}>
                                                                {product.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase backdrop-blur-md"
                                                                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                                                                {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                            </span>
                                                        )}
                                                        {!isOwner && mounted && isSelected && (
                                                            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        removeItem(storeSlug as string, product.id);
                                                                    }}
                                                                    className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                >
                                                                    <X className="w-4 h-4 text-white" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push('/sacola');
                                                                    }}
                                                                    className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                >
                                                                    <ShoppingBag className="w-4 h-4 text-white" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-3">
                                                        <h4 className="text-sm font-bold line-clamp-1" style={{ color: colors.textPrimary }}>{product.name}</h4>
                                                        <p className="text-[11px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>{product.description || 'Sem descrição'}</p>
                                                        <div className="flex items-center justify-between mt-3">
                                                            <div>
                                                                <span className="text-base font-extrabold" style={{ color: colors.accent }}>
                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                                {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                            </div>
                                                            {isOwner ? (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                    className="w-8 h-8 rounded-full border flex items-center justify-center"
                                                                    style={{ borderColor: colors.border, color: colors.accent }}
                                                                >
                                                                    <ExternalLink className="w-4 h-4" />
                                                                </button>
                                                            ) : mounted && isSelected ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    {/* espaço reservado */}
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleProduct(product) }}
                                                                    className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                    style={{ background: colors.accent }}
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {/* Avaliações */}
                {activeTab === 'reviews' && (
                    <div className="space-y-4">
                        {ratings.length === 0 ? (
                            <div className="py-16 text-center rounded-2xl border border-dashed" style={cardStyle}>
                                <Star className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                                <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {ratings.map((rating: any) => {
                                    const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                                    return (
                                        <div key={rating.id} className="flex gap-3 p-4 rounded-2xl border" style={cardStyle}>
                                            <div className="w-10 h-10 rounded-2xl p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                                <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="font-bold text-sm" style={{ color: colors.accent }}>
                                                            {(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{rating.profiles?.name || 'Usuário'}</p>
                                                        <p className="text-[10px] font-medium" style={{ color: colors.accent }}>
                                                            {new Date(rating.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.accent }}>
                                                        <Shield className="w-3 h-3" />
                                                        <span className="text-[9px] font-black uppercase">Verificada</span>
                                                    </div>
                                                </div>
                                                <div className="mt-1.5">
                                                    <RatingStars value={rating.rating} size={14} />
                                                    {!rating.is_anonymous && rating.products?.name && (
                                                        <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: colors.accentLight, color: colors.accent }}>
                                                            {rating.products.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {rating.comment && (
                                                    <p className="mt-2 text-sm italic leading-relaxed" style={{ color: colors.textSecondary }}>"{rating.comment}"</p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Botões flutuantes – agora com SacolaButton igual ao da HomePage */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                <SacolaButton
                    totalItems={cartItems.length}
                    statusCounts={{
                        pending: pendingCount,
                        preparing: preparingCount,
                        ready: readyCount,
                        reviews: pendingReviewsCount,
                    }}
                    animate={cartAnimating}
                />
                <button
                    onClick={() => router.push('/')}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                        color: colors.accentText,
                        border: `2px solid ${colors.border}`,
                        boxShadow: `0 8px 24px ${colors.accent}60`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>

            {/* Modal de horários */}
            {showAllHours && store.business_hours && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllHours(false)}>
                    <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Horários de Funcionamento</h3>
                            <button onClick={() => setShowAllHours(false)} className="text-2xl" style={{ color: colors.textSecondary }}>×</button>
                        </div>
                        <div className="space-y-2">
                            {Object.entries(DAY_LABELS).map(([key, label]) => {
                                const schedule = store.business_hours![key]
                                return (
                                    <div key={key} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: colors.border }}>
                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{label}</span>
                                        {schedule && schedule.open && schedule.close ? (
                                            <span className="text-sm" style={{ color: colors.textSecondary }}>{schedule.open.slice(0, 5)} - {schedule.close.slice(0, 5)}</span>
                                        ) : (
                                            <span className="text-sm italic" style={{ color: colors.textSecondary }}>Fechado</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Admin panel */}
            {adminPanelOpen && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={() => setAdminPanelOpen(false)}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Gerenciar Loja</h3>
                            <button onClick={() => setAdminPanelOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl text-2xl" style={{ color: colors.textSecondary }}>×</button>
                        </div>
                        <StoreFlow
                            store={store}
                            sales={adminSales}
                            supabase={supabase}
                            onToggleStatus={() => toast.success('Status da loja alterado')}
                            profile={{ profileSlug }}
                            onUpdateOrder={() => {
                                supabase.from('store_sales').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => setAdminSales(data || []))
                            }}
                            onAddProduct={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                            onEditStore={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                            onToggleScheduling={toggleScheduling}
                            storeViews={storeViews}
                            productViews={productViews}
                            onUpdateStore={(updatedFields) => setStore(prev => prev ? { ...prev, ...updatedFields } : null)}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}