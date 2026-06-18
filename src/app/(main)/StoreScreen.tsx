// components/StoreScreen.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    AlertTriangle,
    Calendar,
    Search,
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
    Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleModal } from '@/components/ScheduleModal'
import { getAvatarUrl } from '@/lib/avatar'
import AnimatedBackground from '@/components/AnimatedBackground'
import { RatingStars } from '@/components/ratings/RatingStars'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useCartStore } from '@/store/useCartStore'
import { useTheme } from '@/app/theme'
import { StoreFlow } from './eu/components/StoreFlow'

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
    products?: { name: string } | null
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
    products?: { name: string } | null
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
            if (!/^[A-Z]{2}$/.test(part) && part.toLowerCase() !== 'brasil' && part.length > 2 && !part.includes('CEP')) {
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
    return businessHours[getTodayKey()] || null
}

function isOpenNow(schedule: { open: string; close: string } | null | undefined): boolean {
    if (!schedule || !schedule.open || !schedule.close) return false
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [openH, openM] = schedule.open.split(':').map(Number)
    let [closeH, closeM] = schedule.close.split(':').map(Number)
    if (closeH === 0 && closeM === 0) closeH = 24
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
}

type TabType = 'products' | 'reviews'

interface StoreScreenProps {
    profileSlug: string | null   // agora aceita null para compatibilidade com o contexto
    storeSlug: string
    onBack?: () => void
    embedded?: boolean            // NOVO: evita duplicar o fundo quando embutido
}

export default function StoreScreen({ profileSlug, storeSlug, onBack, embedded = false }: StoreScreenProps) {
    const router = useRouter()
    const { colors } = useTheme()

    // Se não houver profileSlug, não renderiza nada (isso ocorre apenas enquanto o contexto carrega)
    if (!profileSlug) return null

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
        if (error) console.warn('[StoreScreen] Erro ao registrar visita:', error.message)
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
        if (error) console.warn('[StoreScreen] Erro ao registrar view do produto:', error.message)
    }, [supabase, getAnonymousId, getSessionId, getDeviceType])

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(p => p.name?.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query))
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
        if (todaySchedule) return isOpenNow(todaySchedule)
        return store.is_open
    }, [store])

    const toggleScheduling = async () => {
        if (!store) return
        const newStatus = !store.allow_scheduling
        const { error } = await supabase.from('stores').update({ allow_scheduling: newStatus }).eq('id', store.id)
        if (error) {
            toast.error('Erro ao atualizar permissão de agendamentos.')
            return
        }
        setStore(prev => (prev ? { ...prev, allow_scheduling: newStatus } : null))
        toast.success(newStatus ? 'Agendamentos permitidos!' : 'Agendamentos cancelados.')
    }

    useEffect(() => { setMounted(true) }, [])

    const loadRatings = useCallback(async (storeId: string, userId: string | null) => {
        const { data, error: ratingsError } = await supabase
            .from('product_reviews')
            .select('id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
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
            setStore((prev: StoreType | null) => prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null)
        }
        const myLatest = rows.find(rating => rating.profile_id === userId)
        setMyRating(myLatest?.rating ?? 0)
    }, [supabase])

    const loadStore = useCallback(async () => {
        if (!storeSlug || !profileSlug) return
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

        if (userId !== foundStore.owner_id) await captureVisit(foundStore.id, userId)

        const { data: viewsData } = await supabase.from('store_views').select('viewer_id, anonymous_id').eq('store_id', foundStore.id)
        const uniqueLogados = new Set(viewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
        const uniqueAnonimos = new Set(viewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
        setTotalVisitors(uniqueLogados.size + uniqueAnonimos.size)

        const { data: productsData } = await supabase.from('products').select('*').eq('store_id', foundStore.id).order('created_at', { ascending: false })
        const mappedProducts = (productsData || []).map(product => ({
            ...product,
            image_url: product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null,
        }))

        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase.from('profiles').select('whatsapp').eq('id', foundStore.owner_id).single()
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
        setAppointmentsToday((todayData || []).map((item: any) => ({
            ...item,
            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
        })))

        setLoading(false)
    }, [loadRatings, storeSlug, profileSlug, supabase, captureVisit])

    useEffect(() => { loadStore() }, [loadStore])

    useEffect(() => {
        if (!adminPanelOpen || !store) return
        const loadAdminData = async () => {
            const { data: salesData } = await supabase.from('store_sales').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(50)
            setAdminSales(salesData || [])

            const { data: adminViewsData } = await supabase.from('store_views').select('viewer_id, anonymous_id').eq('store_id', store.id)
            const uniqueAdminLogados = new Set(adminViewsData?.filter(v => v.viewer_id).map(v => v.viewer_id))
            const uniqueAdminAnonimos = new Set(adminViewsData?.filter(v => v.anonymous_id).map(v => v.anonymous_id))
            setStoreViews(uniqueAdminLogados.size + uniqueAdminAnonimos.size)

            const { count: prodViewsCount } = await supabase.from('product_views').select('*', { count: 'exact', head: true }).eq('store_id', store.id)
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
                if (lat !== null && lng !== null) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
            } catch (e) { console.error('Erro ao extrair coordenadas:', e) }
        }
        if (!url && store.address) url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
        if (url) window.open(url, '_blank')
        else toast.error('Localização não disponível')
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
            <div className="min-h-screen flex items-center justify-center px-4 text-center" style={{ background: colors.background }}>
                {!embedded && <AnimatedBackground />}
                <div className="relative z-10 flex flex-col gap-4 max-w-sm items-center">
                    {error ? <AlertTriangle className="w-12 h-12 text-red-500" /> : <Search className="w-12 h-12" style={{ color: colors.accent }} />}
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error ? 'Erro ao carregar' : 'Loja não encontrada'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {error || `Nenhuma loja com /${storeSlug} foi encontrada.`}
                    </p>
                    <button onClick={() => (onBack ? onBack() : router.push('/'))} className="font-bold mt-2" style={{ color: colors.accent }}>
                        Voltar
                    </button>
                </div>
            </div>
        )

    return (
        <div className="relative flex flex-col min-h-screen pb-28" style={{ background: colors.background }}>
            {/* Fundo animado condicional: não renderiza se estiver embutido */}
            {!embedded && <AnimatedBackground />}
            <style jsx global>{`@keyframes float{0%,100%{transform:translateY(0px) rotate(0deg)}50%{transform:translateY(-15px) rotate(5deg)}}`}</style>

            {store && (
                <ScheduleModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    onSuccess={loadStore}
                    store={{ id: store.id, name: store.name, storeSlug: store.storeSlug }}
                />
            )}

            {/* Barra de ferramentas */}
            <div className="relative z-10 flex items-center gap-2 px-4 py-2 overflow-x-auto"
                style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
                <button onClick={openGoogleMaps} className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold"
                    style={{ background: 'transparent', borderColor: colors.border, color: colors.textSecondary }}>
                    <Navigation size={14} /> Rota
                </button>
                {store.allow_scheduling && (
                    <button onClick={() => setIsScheduleModalOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: colors.accent, color: colors.accentText }}>
                        <Calendar size={14} /> Agendar
                    </button>
                )}
                {store.business_hours && Object.keys(store.business_hours).length > 0 && (
                    <button onClick={() => setShowAllHours(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold"
                        style={{ background: 'transparent', borderColor: colors.border, color: colors.textSecondary }}>
                        <Clock size={14} /> {(() => {
                            const today = getTodaySchedule(store.business_hours)
                            return today && isOpenNow(today) ? 'Aberto' : 'Horários'
                        })()}
                    </button>
                )}
                {isOwner && (
                    <button onClick={() => setAdminPanelOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold"
                        style={{ background: 'transparent', borderColor: colors.border, color: colors.textSecondary }}>
                        <Settings size={14} /> Gerenciar
                    </button>
                )}
            </div>

            <main className="relative z-10 px-4 py-4 flex flex-col gap-4">
                {/* Perfil da loja simplificado */}
                <div className="flex gap-4 items-center">
                    <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full p-[2px] shadow-md"
                            style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                            <div className="w-full h-full rounded-full overflow-hidden" style={{ background: colors.surface }}>
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
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <div className="flex items-center gap-1">
                                <Eye size={12} />
                                <span className="font-medium">{totalVisitors} visitantes</span>
                            </div>
                            <span>·</span>
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
                    <div className="relative">
                        <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                            {expandedDesc || (store.description?.length ?? 0) <= DESC_LIMIT
                                ? store.description
                                : store.description!.slice(0, DESC_LIMIT) + '...'}
                        </p>
                        {(store.description?.length ?? 0) > DESC_LIMIT && (
                            <button
                                onClick={() => setExpandedDesc(!expandedDesc)}
                                className="text-xs font-bold mt-1"
                                style={{ color: colors.accent }}
                            >
                                {expandedDesc ? 'Ver menos' : 'Ver mais'}
                            </button>
                        )}
                    </div>
                )}

                {/* Abas de produtos / avaliações */}
                <div className="flex gap-4 border-b" style={{ borderColor: colors.border }}>
                    {(['products', 'reviews'] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-2 text-sm font-black uppercase transition-colors relative ${activeTab === tab ? 'text-white' : ''
                                }`}
                            style={{ color: activeTab === tab ? colors.accent : colors.textSecondary }}
                        >
                            {tab === 'products' ? 'Produtos' : 'Avaliações'}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: colors.accent }} />
                            )}
                        </button>
                    ))}
                </div>

                {/* Conteúdo das abas (produtos e avaliações) */}
                {activeTab === 'products' && (
                    <div className="space-y-6">
                        {Object.keys(groupedProducts).length === 0 && (
                            <p className="text-center text-sm py-10" style={{ color: colors.textSecondary }}>
                                Nenhum produto cadastrado ainda.
                            </p>
                        )}
                        {Object.entries(groupedProducts).map(([category, items]) => (
                            <div key={category}>
                                <h3 className="font-black text-xs uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                                    {category}
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {items.map((product) => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleProductClick(product)}
                                            className="rounded-2xl p-3 bg-black/20 backdrop-blur-sm border border-white/10 text-left"
                                        >
                                            {product.image_url && (
                                                <img src={product.image_url} alt={product.name} className="w-full h-24 object-cover rounded-xl mb-2" />
                                            )}
                                            <h4 className="font-bold text-sm" style={{ color: colors.textPrimary }}>
                                                {product.name}
                                            </h4>
                                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                                {Number(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'reviews' && (
                    <div className="space-y-4">
                        {ratings.length === 0 && (
                            <p className="text-center text-sm py-10" style={{ color: colors.textSecondary }}>
                                Nenhuma avaliação ainda.
                            </p>
                        )}
                        {ratings.map((rating) => (
                            <div key={rating.id} className="flex gap-3 items-start p-3 rounded-xl" style={{ background: colors.surface }}>
                                <RatingStars value={rating.rating} size={14} />
                                <div className="flex-1">
                                    <p className="text-xs" style={{ color: colors.textPrimary }}>{rating.comment || 'Sem comentário'}</p>
                                    <span className="text-[10px] mt-1 block" style={{ color: colors.textSecondary }}>
                                        {rating.is_anonymous ? 'Anônimo' : rating.profiles?.name || 'Usuário'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Modal de horários */}
            {showAllHours && store.business_hours && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllHours(false)}>
                    <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Horários de Funcionamento</h3>
                            <button onClick={() => setShowAllHours(false)} className="text-2xl" style={{ color: colors.textSecondary }}>&times;</button>
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

            {/* Painel de administração */}
            {adminPanelOpen && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={() => setAdminPanelOpen(false)}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Gerenciar Loja</h3>
                            <button onClick={() => setAdminPanelOpen(false)} className="p-2 rounded-xl text-2xl" style={{ color: colors.textSecondary }}>&times;</button>
                        </div>
                        <StoreFlow
                            store={store}
                            sales={adminSales}
                            supabase={supabase}
                            onToggleStatus={() => toast.success('Status da loja alterado')}
                            profile={{ profileSlug }}
                            onUpdateOrder={() => {
                                supabase.from('store_sales').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(50)
                                    .then(({ data }) => setAdminSales(data || []))
                            }}
                            onAddProduct={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                            onEditStore={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                            onToggleScheduling={toggleScheduling}
                            storeViews={storeViews}
                            productViews={productViews}
                            onUpdateStore={(updatedFields) => setStore(prev => (prev ? { ...prev, ...updatedFields } : null))}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}