// src/app/(app)/[profileSlug]/[storeSlug]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
    Sparkles,
    ShoppingBag,
    Star,
    ChevronRight,
    CheckCircle2,
    Trash2,
    Plus,
    Navigation,
    Shield,
    Grid3X3,
    MessageCircle,
    QrCode,
    Eye
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleModal } from '@/components/ScheduleModal'
import { getAvatarUrl } from '@/lib/avatar'
import AnimatedBackground from '@/components/AnimatedBackground'
import { RatingStars } from '@/components/ratings/RatingStars'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { StoreFlow } from '../../eu/components/StoreFlow'
import { useCartStore } from '@/store/useCartStore'

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
    const [supabase] = useState(() => createClient())

    const [adminPanelOpen, setAdminPanelOpen] = useState(false)
    const [adminSales, setAdminSales] = useState<any[]>([])
    const [storeViews, setStoreViews] = useState(0)
    const [productViews, setProductViews] = useState(0)

    const [showAllHours, setShowAllHours] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [activeTab, setActiveTab] = useState<TabType>('products')

    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80

    // ═══════════════════════════════════════════════════════════
    // 🆕 FUNÇÕES DE CAPTURA AVANÇADA
    // ═══════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════
    // FIM DAS NOVAS FUNÇÕES
    // ═══════════════════════════════════════════════════════════

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

        // 🆕 Registrar visita (todos os visitantes, uma vez por sessão)
        if (userId !== foundStore.owner_id) {
            await captureVisit(foundStore.id, userId)
        }

        // Total de visitantes únicos (logados + anônimos)
        const { data: viewsData } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id')
            .eq('store_id', foundStore.id)
        const uniqueLogados = new Set(viewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
        const uniqueAnonimos = new Set(viewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
        setTotalVisitors(uniqueLogados.size + uniqueAnonimos.size)

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
    }, [loadRatings, storeSlug, supabase, captureVisit])

    useEffect(() => {
        loadStore()
    }, [loadStore])

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

    const handleProductClick = (product: any) => {
        if (isOwner) {
            router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
        } else {
            if (store) captureProductView(product.id, store.id, currentUserId)
            addItem(storeSlug as string, { name: store!.name, logo_url: store!.logo_url ?? null }, product)
            setCartAnimating(true)
            setTimeout(() => setCartAnimating(false), 500)
        }
    }

    if (loading) return <LoadingSpinner />

    if (error || !store)
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 px-4 text-center">
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    {error ? (
                        <AlertTriangle className="w-12 h-12 text-red-500" />
                    ) : (
                        <Search className="w-12 h-12 text-orange-300" />
                    )}
                    <h2 className="text-2xl font-black text-gray-800">
                        {error ? 'Erro ao carregar' : 'Loja não encontrada'}
                    </h2>
                    <p className="text-gray-600 text-sm">
                        {error || `Nenhuma loja com /${storeSlug} foi encontrada.`}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="text-orange-500 hover:text-orange-600 font-bold mt-2"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        )

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-28">
            <AnimatedBackground />
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
            <header className="sticky top-0 z-50 px-3 py-2.5 border-b border-orange-200/30 bg-white/70 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={() => router.push('/')}
                        className="flex w-9 h-9 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm flex-shrink-0"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                            className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm"
                            title="Mensagem"
                        >
                            <MessageCircle className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button
                            className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm"
                            title="QR Code"
                        >
                            <QrCode className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button
                            onClick={openGoogleMaps}
                            className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm"
                            title="Como chegar"
                        >
                            <Navigation className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button
                            onClick={() => {
                                if (navigator.share)
                                    navigator.share({ title: store.name, url: storeUrl }).catch(() => { })
                            }}
                            className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm"
                        >
                            <Share2 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        {isOwner && (
                            <button
                                onClick={() => setAdminPanelOpen(true)}
                                className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm"
                            >
                                <Settings className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-3 py-4 flex flex-col gap-4">
                {/* Perfil da loja - layout horizontal */}
                <div className="flex gap-4">
                    <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 p-[2px] shadow-md">
                            <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                {store.logo_url ? (
                                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xl font-black text-orange-500">
                                        {store.name?.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-black text-gray-800 truncate">{store.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                                <Eye size={12} className="text-gray-400" />
                                <span className="font-medium">{totalVisitors} visitantes</span>
                            </div>
                            <span className="text-gray-300">·</span>
                            <div className="flex items-center gap-1">
                                <RatingStars value={Number(store.ratings_avg || 0)} size={10} />
                                <span className="font-medium">
                                    {Number(store.ratings_avg || 0).toFixed(1)}
                                </span>
                                <span className="text-gray-400">({store.ratings_count ?? 0})</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <span
                                className={`w-2 h-2 rounded-full ${isStoreOpen ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
                            />
                            <span className="text-[10px] font-black uppercase text-gray-500">
                                {isStoreOpen ? 'Aberto' : 'Fechado'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Descrição com ver mais / ver menos */}
                {store.description && (
                    <div className="text-sm text-gray-600 leading-relaxed">
                        {expandedDesc || (store.description.length <= DESC_LIMIT) ? (
                            <>
                                {store.description}
                                {store.description.length > DESC_LIMIT && (
                                    <button
                                        onClick={() => setExpandedDesc(false)}
                                        className="text-orange-500 font-bold ml-1"
                                    >
                                        ver menos
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                {store.description.slice(0, DESC_LIMIT)}...
                                <button
                                    onClick={() => setExpandedDesc(true)}
                                    className="text-orange-500 font-bold ml-1"
                                >
                                    ver mais
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Botões de ação e agendados */}
                <div className="flex items-center gap-2 flex-wrap">
                    {store.address && (
                        <button
                            onClick={openGoogleMaps}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 hover:bg-red-500 hover:text-white transition-all group shadow-sm"
                        >
                            <MapPin className="w-3.5 h-3.5 text-red-500 group-hover:text-white" />
                            <span className="text-[10px] font-black uppercase text-red-500 group-hover:text-white">
                                {formatAddress(store.address).substring(0, 15)}...
                            </span>
                        </button>
                    )}
                    {store.allow_scheduling && (
                        <button
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-[10px] uppercase shadow-md"
                        >
                            <Calendar className="w-3.5 h-3.5" /> Agendar
                        </button>
                    )}
                    {store.business_hours && Object.keys(store.business_hours).length > 0 && (
                        <button
                            onClick={() => setShowAllHours(true)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full border font-black text-[10px] uppercase shadow-sm ${(() => {
                                const today = getTodaySchedule(store.business_hours)
                                return today && isOpenNow(today)
                                    ? 'bg-green-50 border-green-200 text-green-600'
                                    : 'bg-gray-50 border-gray-200 text-gray-600'
                            })()
                                }`}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            {(() => {
                                const today = getTodaySchedule(store.business_hours)
                                return today && isOpenNow(today) ? 'Aberto' : 'Horários'
                            })()}
                        </button>
                    )}
                </div>

                {appointmentsToday.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase text-blue-600">Agendados Hoje</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {appointmentsToday.slice(0, 4).map((appt, i) => (
                                <div
                                    key={appt.id || i}
                                    onClick={() =>
                                        appt.profiles?.profileSlug &&
                                        router.push(`/${appt.profiles.profileSlug}`)
                                    }
                                    className="group bg-white/70 backdrop-blur-sm border border-blue-100 rounded-2xl p-3 hover:border-blue-300 hover:bg-white hover:shadow-lg transition-all duration-300 cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-md ring-2 ring-blue-100">
                                                {appt.profiles?.avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(supabase, appt.profiles.avatar_url)!}
                                                        className="w-full h-full object-cover rounded-full"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <span className="text-xs font-black text-white">
                                                        {appt.profiles?.name?.charAt(0) || '?'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-orange-500 rounded-full px-1.5 py-0.5 ring-2 ring-white flex items-center">
                                                <Clock className="w-2 h-2 text-white mr-0.5" />
                                                <span className="text-[6px] font-black text-white">
                                                    {new Date(appt.start_time).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-gray-800 truncate leading-tight">
                                                {appt.profiles?.name || 'Cliente'}
                                            </p>
                                            <p className="text-[8px] font-black text-blue-500 uppercase tracking-wider">
                                                Agendado
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-2 border border-blue-100/50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                                                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                            </div>
                                            <p className="text-[9px] font-bold text-gray-700 truncate leading-tight">
                                                {appt.service_name || 'Agendamento'}
                                            </p>
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
                        className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all"
                    >
                        <Calendar className="w-4 h-4 inline mr-1" /> Agendar
                    </button>
                )}

                {/* Abas: Produtos e Avaliações */}
                <div className="flex gap-1 bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-orange-100">
                    {[
                        { key: 'products', label: 'Produtos', icon: Grid3X3 },
                        { key: 'reviews', label: 'Avaliações', icon: Star },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === tab.key
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Conteúdo das tabs */}
                {activeTab === 'products' && (
                    <>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400" />
                            <input
                                type="text"
                                placeholder="procurar..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-white border border-orange-200 rounded-xl py-2 pl-8 pr-3 text-xs text-gray-800 placeholder:text-orange-300 focus:outline-none focus:border-orange-500 transition-all"
                            />
                        </div>

                        {filteredProducts.length === 0 ? (
                            <div className="py-8 text-center rounded-xl border border-dashed border-orange-200 bg-white/50">
                                <Search className="w-6 h-6 text-orange-300 mx-auto mb-1" />
                                <p className="text-gray-400 font-bold text-[10px] uppercase">Nenhum produto</p>
                            </div>
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-2">
                                    <h4 className="text-[8px] font-black uppercase tracking-[0.3em] bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {products.map(product => {
                                            const isSelected =
                                                mounted &&
                                                cartItems.some((item: any) => item.product.id === product.id)
                                            const isHourly = product.price_type === 'hourly'
                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={() => handleProductClick(product)}
                                                    className={`relative bg-white rounded-xl overflow-hidden shadow-sm border transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${isSelected
                                                        ? 'ring-2 ring-orange-500 border-orange-500'
                                                        : 'border-orange-100 hover:border-orange-300'
                                                        }`}
                                                >
                                                    <div className="aspect-square bg-gradient-to-br from-orange-50 to-red-50 overflow-hidden">
                                                        {product.image_url ? (
                                                            <img
                                                                src={product.image_url}
                                                                className="w-full h-full object-cover"
                                                                alt=""
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-orange-300 text-xl font-black">
                                                                {product.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-2.5">
                                                        <h4 className="text-xs font-black text-gray-800 line-clamp-1">
                                                            {product.name}
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">
                                                            {product.description || 'Sem descrição'}
                                                        </p>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <div>
                                                                <span className="text-sm font-black text-orange-600">
                                                                    R${' '}
                                                                    {(product.price || 0).toLocaleString('pt-BR', {
                                                                        minimumFractionDigits: 2,
                                                                    })}
                                                                </span>
                                                                {isHourly && (
                                                                    <span className="text-[9px] font-bold text-gray-400 ml-1">
                                                                        /h
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isOwner ? (
                                                                <button
                                                                    onClick={e => {
                                                                        e.stopPropagation()
                                                                        router.push(
                                                                            `/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`
                                                                        )
                                                                    }}
                                                                    className="w-7 h-7 rounded-full bg-white border border-orange-200 text-orange-500 hover:bg-orange-500 hover:text-white transition-all flex items-center justify-center"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </button>
                                                            ) : mounted && isSelected ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={e => {
                                                                            e.stopPropagation()
                                                                            router.push('/sacola')
                                                                        }}
                                                                        className="w-7 h-7 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white flex items-center justify-center shadow-md"
                                                                    >
                                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={e => {
                                                                            e.stopPropagation()
                                                                            removeItem(storeSlug as string, product.id)
                                                                        }}
                                                                        className="w-7 h-7 rounded-full bg-red-50 border border-red-200 text-red-500 flex items-center justify-center"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={e => {
                                                                        e.stopPropagation()
                                                                        addItem(
                                                                            storeSlug as string,
                                                                            { name: store.name, logo_url: store.logo_url ?? null },
                                                                            product
                                                                        )
                                                                    }}
                                                                    className="w-7 h-7 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white flex items-center justify-center shadow-md"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 text-[7px] font-black uppercase bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded-full text-orange-500">
                                                                {product.type === 'physical'
                                                                    ? 'Produto'
                                                                    : product.type === 'service'
                                                                        ? 'Serviço'
                                                                        : 'Digital'}
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
                        {/* Resumo geral das avaliações */}
                        {ratings.length > 0 && (
                            <div className="flex items-center justify-between bg-white/50 rounded-xl p-3 border border-orange-100">
                                <div className="flex items-center gap-2">
                                    <RatingStars value={Number(store.ratings_avg || 0)} size={12} />
                                    <span className="text-xs font-black text-gray-700">
                                        {Number(store.ratings_avg || 0).toFixed(1)}
                                    </span>
                                    <span className="text-[9px] font-bold text-orange-500">
                                        ({store.ratings_count ?? 0})
                                    </span>
                                    {myRating > 0 && (
                                        <span className="text-[8px] font-black text-green-500 bg-green-50 px-1.5 py-0.5 rounded-full">
                                            ✓
                                        </span>
                                    )}
                                </div>
                                <div className="flex -space-x-1.5">
                                    {ratings.slice(0, 3).map((r, i) => (
                                        <div
                                            key={i}
                                            className="w-6 h-6 rounded-full ring-1 ring-white border border-orange-200 bg-white overflow-hidden"
                                        >
                                            {r.profiles?.avatar_url ? (
                                                <img
                                                    src={getAvatarUrl(supabase, r.profiles.avatar_url)!}
                                                    className="w-full h-full object-cover"
                                                    alt=""
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-gray-400">
                                                    {r.profiles?.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Lista de avaliações */}
                        {ratings.length === 0 ? (
                            <div className="py-12 text-center bg-white/50 rounded-2xl border border-dashed border-orange-200">
                                <Star className="w-10 h-10 text-orange-300 mx-auto mb-2" />
                                <p className="text-gray-400 font-bold text-sm">Nenhuma avaliação ainda</p>
                                <p className="text-gray-400 text-xs mt-1">Seja o primeiro a avaliar!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {ratings.map((rating: any) => {
                                    const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                                    return (
                                        <div
                                            key={rating.id}
                                            className="flex gap-3 p-4 rounded-2xl bg-white/70 backdrop-blur-sm border border-orange-100 hover:border-orange-300 transition-all"
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-orange-400 to-red-400 p-[2px] shrink-0">
                                                <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                                    {avatarUrl ? (
                                                        <img
                                                            src={avatarUrl}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                                                            <span className="font-bold text-xs text-orange-600">
                                                                {(rating.profiles?.name || '?')
                                                                    .slice(0, 1)
                                                                    .toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-900">
                                                            {rating.profiles?.name || 'Usuário'}
                                                        </p>
                                                        <p className="text-[10px] text-orange-400 font-medium">
                                                            {new Date(rating.created_at).toLocaleDateString('pt-BR', {
                                                                day: 'numeric',
                                                                month: 'long',
                                                                year: 'numeric',
                                                            })}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 border border-green-300 rounded-full">
                                                        <Shield className="w-3 h-3 text-green-600" />
                                                        <span className="text-[8px] font-black text-green-600 uppercase">
                                                            Verificada
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mb-1">
                                                    <RatingStars value={rating.rating} size={12} />
                                                    {!rating.is_anonymous && rating.products?.name && (
                                                        <span className="ml-2 text-[10px] font-black text-orange-500 uppercase tracking-wider bg-orange-100 px-2 py-0.5 rounded-full">
                                                            {rating.products.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {rating.comment && (
                                                    <p className="text-xs text-gray-600 italic leading-relaxed mt-1">
                                                        "{rating.comment}"
                                                    </p>
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

            {/* Modal de todos os horários */}
            {showAllHours && store.business_hours && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowAllHours(false)}
                >
                    <div
                        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-gray-800">Horários de Funcionamento</h3>
                            <button onClick={() => setShowAllHours(false)} className="text-2xl">&times;</button>
                        </div>
                        <div className="space-y-2">
                            {Object.entries(DAY_LABELS).map(([key, label]) => {
                                const schedule = store.business_hours![key]
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                                    >
                                        <span className="text-sm font-bold text-gray-700">{label}</span>
                                        {schedule && schedule.open && schedule.close ? (
                                            <span className="text-sm text-gray-600">
                                                {schedule.open.slice(0, 5)} - {schedule.close.slice(0, 5)}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-gray-400 italic">Fechado</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Painel de administração (StoreFlow drawer) */}
            {adminPanelOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
                    onClick={() => setAdminPanelOpen(false)}
                >
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-gray-800">Gerenciar Loja</h3>
                            <button
                                onClick={() => setAdminPanelOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-xl text-2xl"
                            >
                                &times;
                            </button>
                        </div>
                        <StoreFlow
                            store={store}
                            sales={adminSales}
                            supabase={supabase}
                            onToggleStatus={() => toast.success('Status da loja alterado')}
                            profile={{ profileSlug }}
                            onUpdateOrder={() => {
                                supabase
                                    .from('store_sales')
                                    .select('*')
                                    .eq('store_id', store.id)
                                    .order('created_at', { ascending: false })
                                    .limit(50)
                                    .then(({ data }) => setAdminSales(data || []))
                            }}
                            onAddProduct={() =>
                                router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)
                            }
                            onEditStore={() =>
                                router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)
                            }
                            onToggleScheduling={toggleScheduling}
                            storeViews={storeViews}
                            productViews={productViews}
                            onUpdateStore={(updatedFields) =>
                                setStore(prev => (prev ? { ...prev, ...updatedFields } : null))
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    )
}