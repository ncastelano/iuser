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
    CheckCircle2,
    Trash2,
    Plus,
    Navigation,
    Shield,
    Grid3X3,
    MessageCircle,
    QrCode,
    Eye,
    ShoppingCart,
    Home
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleModal } from '@/components/ScheduleModal'
import { getAvatarUrl } from '@/lib/avatar'
import { RatingStars } from '@/components/ratings/RatingStars'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { StoreFlow } from '../../eu/components/StoreFlow'
import { useCartStore } from '@/store/useCartStore'
import { useTheme } from '@/app/theme'

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

export default function StorePage() {
    const params = useParams()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const router = useRouter()

    const { colors } = useTheme()

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
    const [recentVisitors, setRecentVisitors] = useState<any[]>([]) // avatares dos últimos visitantes (total)
    const [onlineNow, setOnlineNow] = useState(0)
    const [onlineVisitors, setOnlineVisitors] = useState<any[]>([]) // avatares online
    const [activeTab, setActiveTab] = useState<TabType>('products')

    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80

    // Captura de dados
    const getAnonymousId = useCallback(() => {
        const key = 'iuser_anonymous_id'
        let id = localStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
            localStorage.setItem(key, id)
        }
        return id
    }, [])

    const getSessionId = useCallback(() => {
        const key = 'iuser_session_id'
        let id = sessionStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
            sessionStorage.setItem(key, id)
        }
        return id
    }, [])

    const hasVisitedThisSession = useCallback(() => {
        const key = `iuser_visited_store_${storeSlug}`
        if (sessionStorage.getItem(key)) return true
        sessionStorage.setItem(key, '1')
        return false
    }, [storeSlug])

    const getDeviceType = useCallback((): 'mobile' | 'tablet' | 'desktop' => {
        const ua = navigator.userAgent
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet'
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile'
        return 'desktop'
    }, [])

    const captureVisit = useCallback(async (storeId: string, userId: string | null) => {
        if (hasVisitedThisSession()) return

        const anonymousId = userId ? null : getAnonymousId()
        const sessionId = getSessionId()
        const deviceType = getDeviceType()
        const referrer = document.referrer || null
        const userAgent = navigator.userAgent || null

        const { error } = await supabase.from('store_views').insert({
            store_id: storeId,
            viewer_id: userId || null,
            anonymous_id: anonymousId,
            session_id: sessionId,
            device_type: deviceType,
            referrer,
            user_agent: userAgent,
            is_anonymous: !userId
        })
        if (error) console.warn('[StorePage] Erro ao registrar visita:', error.message)
    }, [supabase, getAnonymousId, getSessionId, getDeviceType, hasVisitedThisSession])

    const captureProductView = useCallback(async (productId: string, storeId: string, userId: string | null) => {
        const anonymousId = userId ? null : getAnonymousId()
        const sessionId = getSessionId()
        const deviceType = getDeviceType()
        const referrer = document.referrer || null
        const userAgent = navigator.userAgent || null

        const { error } = await supabase.from('product_views').insert({
            product_id: productId,
            store_id: storeId,
            viewer_id: userId || null,
            anonymous_id: anonymousId,
            session_id: sessionId,
            device_type: deviceType,
            referrer,
            user_agent: userAgent
        })
        if (error) console.warn('[StorePage] Erro ao registrar view do produto:', error.message)
    }, [supabase, getAnonymousId, getSessionId, getDeviceType])

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

    // Buscar visitantes online (últimos 60 segundos)
    const fetchOnlineVisitors = useCallback(async (storeId: string) => {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
        const { data } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id, created_at, profiles:viewer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', storeId)
            .gte('created_at', oneMinuteAgo)
            .order('created_at', { ascending: false })

        const uniqueMap = new Map<string, any>()
        data?.forEach(v => {
            const key = v.viewer_id || v.anonymous_id
            if (key && !uniqueMap.has(key)) {
                uniqueMap.set(key, {
                    ...v,
                    profiles: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles,
                })
            }
        })
        const onlineList = Array.from(uniqueMap.values())
        setOnlineNow(onlineList.length)
        setOnlineVisitors(onlineList.slice(0, 4)) // até 4 avatares
    }, [supabase])

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

        if (userId !== foundStore.owner_id) {
            await captureVisit(foundStore.id, userId)
        }

        // Total de visitantes únicos (logados + anônimos) - histórico
        const { data: viewsData } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id')
            .eq('store_id', foundStore.id)
        const uniqueLogados = new Set(viewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
        const uniqueAnonimos = new Set(viewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
        setTotalVisitors(uniqueLogados.size + uniqueAnonimos.size)

        // Buscar últimos visitantes únicos (para fallback dos avatares)
        const { data: recentViews } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id, created_at, profiles:viewer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })
            .limit(20)

        if (recentViews) {
            const uniqueVisitors = new Map<string, any>()
            for (const view of recentViews) {
                const key = view.viewer_id ?? view.anonymous_id
                if (!uniqueVisitors.has(key)) {
                    uniqueVisitors.set(key, {
                        ...view,
                        profiles: Array.isArray(view.profiles) ? view.profiles[0] : view.profiles,
                    })
                }
            }
            setRecentVisitors(Array.from(uniqueVisitors.values()).slice(0, 4))
        }

        // Carrega também os visitantes online
        fetchOnlineVisitors(foundStore.id)

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
    }, [loadRatings, storeSlug, supabase, captureVisit, fetchOnlineVisitors])

    useEffect(() => {
        loadStore()
    }, [loadStore])

    // Realtime + polling para visitantes online
    useEffect(() => {
        if (!store) return

        const channel = supabase
            .channel(`store-online-${store.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'store_views',
                    filter: `store_id=eq.${store.id}`,
                },
                () => {
                    fetchOnlineVisitors(store.id)
                }
            )
            .subscribe()

        const interval = setInterval(() => {
            fetchOnlineVisitors(store.id)
        }, 10000) // fallback a cada 10s

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [store, fetchOnlineVisitors])

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
                .from('store_views')
                .select('viewer_id, anonymous_id')
                .eq('store_id', store.id)
            const uniqueAdminLogados = new Set(adminViewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
            const uniqueAdminAnonimos = new Set(adminViewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
            setStoreViews(uniqueAdminLogados.size + uniqueAdminAnonimos.size)

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

    if (loading) return <LoadingSpinner />

    if (error || !store)
        return (
            <div className="min-h-screen flex items-center justify-center px-4 text-center">
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
        <div className="relative flex flex-col min-h-screen pb-28">
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
            <header className="sticky top-0 z-50 px-3 py-2.5 border-b backdrop-blur-xl" style={{ background: colors.surface, borderColor: colors.border }}>
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={() => router.push('/')}
                        className="flex w-9 h-9 items-center justify-center border rounded-xl transition-all shadow-sm"
                        style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button className="flex w-8 h-8 items-center justify-center border rounded-xl transition-all shadow-sm"
                            style={{ background: colors.surface, borderColor: colors.border }}>
                            <MessageCircle className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                        </button>
                        <button className="flex w-8 h-8 items-center justify-center border rounded-xl transition-all shadow-sm"
                            style={{ background: colors.surface, borderColor: colors.border }}>
                            <QrCode className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                        </button>
                        <button
                            onClick={openGoogleMaps}
                            className="flex w-8 h-8 items-center justify-center border rounded-xl transition-all shadow-sm"
                            style={{ background: colors.surface, borderColor: colors.border }}>
                            <Navigation className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                        </button>
                        <button
                            onClick={() => navigator.share?.({ title: store.name, url: storeUrl }).catch(() => { })}
                            className="flex w-8 h-8 items-center justify-center border rounded-xl transition-all shadow-sm"
                            style={{ background: colors.surface, borderColor: colors.border }}>
                            <Share2 className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                        </button>
                        {isOwner && (
                            <button
                                onClick={() => setAdminPanelOpen(true)}
                                className="flex w-8 h-8 items-center justify-center border rounded-xl transition-all shadow-sm"
                                style={{ background: colors.surface, borderColor: colors.border }}>
                                <Settings className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-3 py-4 flex flex-col gap-4">
                {/* Perfil da loja */}
                <div className="flex gap-4">
                    <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full p-[2px] shadow-md" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                {store.logo_url ? (
                                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.accent }}>
                                        {store.name?.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                            <div className="flex items-center gap-1">
                                <Eye size={12} />
                                <span className="font-medium">
                                    {onlineNow > 0 ? `${onlineNow} online` : `${totalVisitors} visitantes`}
                                </span>
                                {/* Avatares online (prioridade) ou fallback com visitantes recentes */}
                                {onlineVisitors.length > 0 ? (
                                    <div className="flex items-center -space-x-1 ml-1">
                                        {onlineVisitors.map((visitor, i) => (
                                            <div
                                                key={i}
                                                className="w-4 h-4 rounded-full ring-1 ring-white overflow-hidden border"
                                                style={{ background: colors.surface, borderColor: colors.border }}
                                            >
                                                {visitor.profiles?.avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(supabase, visitor.profiles.avatar_url)!}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-full h-full flex items-center justify-center text-[6px] font-bold"
                                                        style={{ color: colors.textSecondary }}
                                                    >
                                                        {visitor.profiles?.name?.charAt(0) || '?'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : recentVisitors.length > 0 ? (
                                    <div className="flex items-center -space-x-1 ml-1">
                                        {recentVisitors.map((visitor, i) => (
                                            <div
                                                key={i}
                                                className="w-4 h-4 rounded-full ring-1 ring-white overflow-hidden border"
                                                style={{ background: colors.surface, borderColor: colors.border }}
                                            >
                                                {visitor.profiles?.avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(supabase, visitor.profiles.avatar_url)!}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-full h-full flex items-center justify-center text-[6px] font-bold"
                                                        style={{ color: colors.textSecondary }}
                                                    >
                                                        {visitor.profiles?.name?.charAt(0) || '?'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <span className="text-gray-300">·</span>
                            <div className="flex items-center gap-1">
                                <RatingStars value={Number(store.ratings_avg || 0)} size={10} />
                                <span className="font-medium">{Number(store.ratings_avg || 0).toFixed(1)}</span>
                                <span>({store.ratings_count ?? 0})</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <span className={`w-2 h-2 rounded-full ${isStoreOpen ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                            <span className="text-[10px] font-black uppercase" style={{ color: colors.textSecondary }}>
                                {isStoreOpen ? 'Aberto' : 'Fechado'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Descrição */}
                {store.description && (
                    <div className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                        {expandedDesc || (store.description.length <= DESC_LIMIT) ? (
                            <>
                                {store.description}
                                {store.description.length > DESC_LIMIT && (
                                    <button onClick={() => setExpandedDesc(false)} className="font-bold ml-1" style={{ color: colors.accent }}>ver menos</button>
                                )}
                            </>
                        ) : (
                            <>
                                {store.description.slice(0, DESC_LIMIT)}...
                                <button onClick={() => setExpandedDesc(true)} className="font-bold ml-1" style={{ color: colors.accent }}>ver mais</button>
                            </>
                        )}
                    </div>
                )}

                {/* Botões de ação */}
                <div className="flex items-center gap-2 flex-wrap">
                    {store.address && (
                        <button
                            onClick={openGoogleMaps}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full border transition-all shadow-sm"
                            style={{ background: colors.accentLight, borderColor: colors.accent, color: colors.accent }}>
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black uppercase">{formatAddress(store.address).substring(0, 15)}...</span>
                        </button>
                    )}
                    {store.allow_scheduling && (
                        <button
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full font-black text-[10px] uppercase shadow-md"
                            style={{ background: colors.accent, color: colors.accentText }}>
                            <Calendar className="w-3.5 h-3.5" /> Agendar
                        </button>
                    )}
                    {store.business_hours && Object.keys(store.business_hours).length > 0 && (
                        <button
                            onClick={() => setShowAllHours(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full border font-black text-[10px] uppercase shadow-sm"
                            style={{ background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>
                            <Clock className="w-3.5 h-3.5" />
                            {getTodaySchedule(store.business_hours) && isOpenNow(getTodaySchedule(store.business_hours)) ? 'Aberto' : 'Horários'}
                        </button>
                    )}
                </div>

                {appointmentsToday.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase" style={{ color: colors.textSecondary }}>Agendados Hoje</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {appointmentsToday.slice(0, 4).map((appt, i) => (
                                <div
                                    key={appt.id || i}
                                    onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                    className="group border rounded-2xl p-3 transition-all duration-300 cursor-pointer backdrop-blur-sm"
                                    style={{ background: colors.surface, borderColor: colors.border }}>
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="relative">
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center shadow-md ring-2"
                                                style={{
                                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                                    '--tw-ring-color': colors.accentLight,
                                                } as React.CSSProperties}>
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
                                    <div className="rounded-xl p-2 border" style={{ background: colors.accentLight, borderColor: colors.accentLight }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0" style={{ background: colors.surface }}>
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

                {store.allow_scheduling && (
                    <button
                        onClick={() => setIsScheduleModalOpen(true)}
                        className="w-full py-2.5 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md"
                        style={{ background: colors.accent, color: colors.accentText }}>
                        <Calendar className="w-4 h-4 inline mr-1" /> Agendar
                    </button>
                )}

                {/* Abas */}
                <div className="flex gap-1 backdrop-blur-sm rounded-xl p-1 border" style={{ background: colors.surface, borderColor: colors.border }}>
                    {[
                        { key: 'products', label: 'Produtos', icon: Grid3X3 },
                        { key: 'reviews', label: 'Avaliações', icon: Star },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === tab.key ? 'shadow-md' : ''}`}
                            style={
                                activeTab === tab.key
                                    ? { background: colors.accent, color: colors.accentText }
                                    : { background: 'transparent', color: colors.textSecondary }
                            }>
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Conteúdo das abas (produtos e avaliações) */}
                {activeTab === 'products' && (
                    <>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: colors.accent }} />
                            <input
                                type="text"
                                placeholder="procurar..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full border rounded-xl py-2 pl-8 pr-3 text-xs focus:outline-none transition-all"
                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                            />
                        </div>

                        {filteredProducts.length === 0 ? (
                            <div className="py-8 text-center rounded-xl border border-dashed" style={{ background: colors.surface, borderColor: colors.border }}>
                                <Search className="w-6 h-6 mx-auto mb-1" style={{ color: colors.textSecondary }} />
                                <p className="font-bold text-[10px] uppercase" style={{ color: colors.textSecondary }}>Nenhum produto</p>
                            </div>
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-2">
                                    <h4 className="text-[8px] font-black uppercase tracking-[0.3em] bg-clip-text text-transparent"
                                        style={{ backgroundImage: `linear-gradient(to right, ${colors.accent}, ${colors.accentLight})`, WebkitBackgroundClip: 'text' }}>
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {products.map(product => {
                                            const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                            const isHourly = product.price_type === 'hourly'
                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={() => handleProductClick(product)}
                                                    className={`relative rounded-xl overflow-hidden shadow-sm border transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${isSelected ? 'ring-2 ring-orange-500 border-orange-500' : ''}`}
                                                    style={{ background: colors.surface, borderColor: isSelected ? colors.accent : colors.border }}>
                                                    <div className="aspect-square overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.accent }}>
                                                                {product.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-2.5">
                                                        <h4 className="text-xs font-black line-clamp-1" style={{ color: colors.textPrimary }}>{product.name}</h4>
                                                        <p className="text-[10px] line-clamp-1 mt-0.5" style={{ color: colors.textSecondary }}>{product.description || 'Sem descrição'}</p>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <div>
                                                                <span className="text-sm font-black" style={{ color: colors.accent }}>
                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                                {isHourly && <span className="text-[9px] font-bold ml-1" style={{ color: colors.textSecondary }}>/h</span>}
                                                            </div>
                                                            {isOwner ? (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                    className="w-7 h-7 rounded-full border transition-all flex items-center justify-center"
                                                                    style={{ background: colors.surface, borderColor: colors.border, color: colors.accent }}>
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </button>
                                                            ) : mounted && isSelected ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); router.push('/sacola') }}
                                                                        className="w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md"
                                                                        style={{ background: colors.accent }}>
                                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); removeItem(storeSlug as string, product.id) }}
                                                                        className="w-7 h-7 rounded-full border flex items-center justify-center"
                                                                        style={{ background: colors.accentLight, borderColor: colors.accent, color: colors.accent }}>
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleProduct(product) }}
                                                                    className="w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md"
                                                                    style={{ background: colors.accent }}>
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 text-[7px] font-black uppercase backdrop-blur-sm px-1.5 py-0.5 rounded-full" style={{ background: colors.surface, color: colors.accent }}>
                                                                {product.type === 'physical' ? 'Produto' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                            </span>
                                                        )}
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

                {activeTab === 'reviews' && (
                    <div className="space-y-4">
                        {ratings.length > 0 && (
                            <div className="flex items-center justify-between rounded-xl p-3 border" style={{ background: colors.surface, borderColor: colors.border }}>
                                <div className="flex items-center gap-2">
                                    <RatingStars value={Number(store.ratings_avg || 0)} size={12} />
                                    <span className="text-xs font-black" style={{ color: colors.textPrimary }}>{Number(store.ratings_avg || 0).toFixed(1)}</span>
                                    <span className="text-[9px] font-bold" style={{ color: colors.accent }}>({store.ratings_count ?? 0})</span>
                                    {myRating > 0 && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.accent }}>✓</span>}
                                </div>
                                <div className="flex -space-x-1.5">
                                    {ratings.slice(0, 3).map((r, i) => (
                                        <div key={i} className="w-6 h-6 rounded-full ring-1 ring-white border overflow-hidden" style={{ background: colors.surface, borderColor: colors.border }}>
                                            {r.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, r.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[7px] font-bold" style={{ color: colors.textSecondary }}>{r.profiles?.name?.charAt(0) || '?'}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {ratings.length === 0 ? (
                            <div className="py-12 text-center rounded-2xl border border-dashed" style={{ background: colors.surface, borderColor: colors.border }}>
                                <Star className="w-10 h-10 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                <p className="font-bold text-sm" style={{ color: colors.textSecondary }}>Nenhuma avaliação ainda</p>
                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {ratings.map((rating: any) => {
                                    const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                                    return (
                                        <div key={rating.id} className="flex gap-3 p-4 rounded-2xl border transition-all backdrop-blur-sm" style={{ background: colors.surface, borderColor: colors.border }}>
                                            <div className="w-10 h-10 rounded-full overflow-hidden p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                                <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                                                            <span className="font-bold text-xs" style={{ color: colors.accent }}>{(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div>
                                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{rating.profiles?.name || 'Usuário'}</p>
                                                        <p className="text-[10px] font-medium" style={{ color: colors.accent }}>{new Date(rating.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{ background: colors.accentLight, borderColor: colors.accent }}>
                                                        <Shield className="w-3 h-3" style={{ color: colors.accent }} />
                                                        <span className="text-[8px] font-black uppercase" style={{ color: colors.accent }}>Verificada</span>
                                                    </div>
                                                </div>
                                                <div className="mb-1">
                                                    <RatingStars value={rating.rating} size={12} />
                                                    {!rating.is_anonymous && rating.products?.name && (
                                                        <span className="ml-2 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.accent }}>{rating.products.name}</span>
                                                    )}
                                                </div>
                                                {rating.comment && (
                                                    <p className="text-xs italic leading-relaxed mt-1" style={{ color: colors.textSecondary }}>"{rating.comment}"</p>
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

            {/* Botões flutuantes: Sacola + Início */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                <button
                    onClick={() => router.push('/sacola')}
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                        color: colors.accentText,
                        border: 'none',
                        borderRadius: 32,
                        padding: '16px 28px',
                        fontWeight: 800,
                        fontSize: 18,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        boxShadow: `0 12px 40px ${colors.accent}80`,
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                        position: 'relative',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                    <ShoppingCart size={24} />
                    Sacola
                    {cartItems.length > 0 && (
                        <span
                            className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                            style={{
                                background: colors.accentText,
                                color: colors.accent,
                                border: `2px solid ${colors.accent}`,
                                transform: cartAnimating ? 'scale(1.3)' : 'scale(1)',
                                transition: 'transform 0.2s ease',
                            }}
                        >
                            {cartItems.length}
                        </span>
                    )}
                </button>
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

            {/* Admin panel (StoreFlow) */}
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