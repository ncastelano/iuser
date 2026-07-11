// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Star,
    MapPin,
    Clock,
    ShoppingBag,
    Eye,
    Spline,
    Timer,
    Bike,
    PackageCheck,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos ----------
interface TopProduct {
    imageUrl: string | null
    name: string
}

interface StoreCard {
    slug: string
    name: string
    logoUrl: string | null
    coverUrl?: string | null
    description?: string
    rating?: number
    ratingCount?: number
    isOpen?: boolean
    address?: string
    todayHours?: string
    viewCount?: number
    durationMin?: number | null
    durationMax?: number | null
    topProducts?: TopProduct[]
    distanceMeters?: number | null
    deliveryType?: string | null
    deliveryFee?: number | null
    acceptsDelivery?: boolean
    acceptsPickup?: boolean
}

// ---------- Helpers de horário ----------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function getTodayKey() {
    return DAY_KEYS[new Date().getDay()]
}

function getTodaySchedule(businessHours: Record<string, { open: string; close: string }> | null) {
    if (!businessHours) return null
    const todayKey = getTodayKey()
    return businessHours[todayKey] || null
}

function isOpenNow(schedule: { open: string; close: string } | null): boolean {
    if (!schedule || !schedule.open || !schedule.close) return false
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [oh, om] = schedule.open.split(':').map(Number)
    let [ch, cm] = schedule.close.split(':').map(Number)
    if (ch === 0 && cm === 0) ch = 24
    const openMin = oh * 60 + om
    const closeMin = ch * 60 + cm
    return currentMinutes >= openMin && currentMinutes <= closeMin
}

function extractStreetAddress(fullAddress?: string): string {
    if (!fullAddress) return ''
    const parts = fullAddress.split(',').map(p => p.trim())
    let street = parts[0] || ''
    if (parts.length > 1 && !/\d/.test(street)) {
        street += ', ' + parts[1]
    }
    return street
}

// Cache helpers
const CACHE_KEY = 'banner_stores_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

function loadCache(): StoreCard[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const { data, timestamp } = JSON.parse(raw)
        if (Date.now() - timestamp < CACHE_TTL) {
            return data as StoreCard[]
        }
    } catch { }
    return null
}

function saveCache(stores: StoreCard[]) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: stores,
            timestamp: Date.now()
        }))
    } catch { }
}

// ---------- Hook de dados ----------
function useBannerStores(savedLocation?: { lat: number; lng: number } | null) {
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)
    const [effectiveLocation, setEffectiveLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [locationAttempted, setLocationAttempted] = useState(false)

    useEffect(() => {
        if (savedLocation) {
            setEffectiveLocation(savedLocation)
            setLocationAttempted(true)
        } else if (!locationAttempted && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setEffectiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                    setLocationAttempted(true)
                },
                () => {
                    setEffectiveLocation(null)
                    setLocationAttempted(true)
                }
            )
        }
    }, [savedLocation, locationAttempted])

    useEffect(() => {
        let cancelled = false

        const fetchFreshData = async () => {
            let storesList: any[] | null = null
            let error: any = null

            if (effectiveLocation) {
                const { data, error: rpcErr } = await supabase
                    .rpc('get_stores_with_distance', {
                        user_lat: effectiveLocation.lat,
                        user_lng: effectiveLocation.lng
                    })
                storesList = data
                error = rpcErr
            } else {
                const { data, error: queryErr } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(20)
                storesList = data
                error = queryErr
            }

            if (error || cancelled) return

            const storeIds = storesList?.map((s: any) => s.id) || []
            let deliveryFieldsMap = new Map<string, any>()
            if (storeIds.length > 0) {
                const { data: deliveryData } = await supabase
                    .from('stores')
                    .select('id, accepts_delivery, accepts_pickup, delivery_type, delivery_fee')
                    .in('id', storeIds)
                if (deliveryData) {
                    deliveryData.forEach((d: any) => deliveryFieldsMap.set(d.id, d))
                }
            }

            const { data: productsList } = await supabase
                .from('products')
                .select('id, name, store_id, image_url, duration_minutes')
            const { data: reviewsList } = await supabase
                .from('product_reviews')
                .select('store_id, rating')
            const { data: paidOrderItems } = await supabase
                .from('order_items')
                .select('product_id, orders!inner(status)')
                .eq('orders.status', 'paid')

            if (cancelled) return

            const ratingsMap = new Map<string, { sum: number; count: number }>()
            reviewsList?.forEach(r => {
                if (!ratingsMap.has(r.store_id)) ratingsMap.set(r.store_id, { sum: 0, count: 0 })
                const cur = ratingsMap.get(r.store_id)!
                cur.sum += r.rating
                cur.count += 1
            })

            const salesCount = new Map<string, number>()
            paidOrderItems?.forEach((item: any) => {
                salesCount.set(item.product_id, (salesCount.get(item.product_id) || 0) + 1)
            })

            const storeProds = new Map<string, typeof productsList>()
            productsList?.forEach(p => {
                if (!storeProds.has(p.store_id)) storeProds.set(p.store_id, [])
                storeProds.get(p.store_id)!.push(p)
            })

            const cards: StoreCard[] = (storesList || []).map((store: any) => {
                const logoUrl = store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null

                const ratingData = ratingsMap.get(store.id)
                const avg = ratingData ? ratingData.sum / ratingData.count : store.ratings_avg ?? 0
                const count = ratingData ? ratingData.count : store.ratings_count ?? 0

                const todaySchedule = getTodaySchedule(store.business_hours)
                const isOpen = todaySchedule ? isOpenNow(todaySchedule) : (store.is_open ?? true)
                const todayHours = todaySchedule
                    ? `${todaySchedule.open.slice(0, 5)} - ${todaySchedule.close.slice(0, 5)}`
                    : undefined

                const prods = storeProds.get(store.id) || []
                const durations = prods
                    .map(p => p.duration_minutes)
                    .filter((d): d is number => d != null)
                const durationMin = durations.length ? Math.min(...durations) : null
                const durationMax = durations.length ? Math.max(...durations) : null

                const topProducts: TopProduct[] = prods
                    .sort((a, b) => (salesCount.get(b.id) || 0) - (salesCount.get(a.id) || 0))
                    .slice(0, 3)
                    .map(p => ({
                        imageUrl: p.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                            : null,
                        name: p.name
                    }))

                const distanceMeters = store.distance_meters ?? null
                const streetAddress = extractStreetAddress(store.address)

                const deliveryFields = deliveryFieldsMap.get(store.id) || {}
                const acceptsDelivery = deliveryFields.accepts_delivery ?? store.accepts_delivery ?? false
                const acceptsPickup = deliveryFields.accepts_pickup ?? store.accepts_pickup ?? false
                const deliveryType = deliveryFields.delivery_type ?? store.delivery_type ?? null
                const deliveryFee = deliveryFields.delivery_fee ?? store.delivery_fee ?? null

                return {
                    slug: store.storeSlug,
                    name: store.name,
                    logoUrl,
                    coverUrl: logoUrl,
                    description: store.description,
                    rating: Number(avg.toFixed(1)),
                    ratingCount: count,
                    isOpen,
                    address: streetAddress,
                    todayHours,
                    viewCount: store.view_count ?? 0,
                    durationMin,
                    durationMax,
                    topProducts,
                    distanceMeters,
                    deliveryType,
                    deliveryFee,
                    acceptsDelivery,
                    acceptsPickup,
                }
            })

            cards.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
            return cards
        }

        const cached = loadCache()
        if (cached) {
            setStores(cached)
            setLoading(false)
        }

        fetchFreshData().then((freshCards) => {
            if (!cancelled && freshCards) {
                setStores(freshCards)
                saveCache(freshCards)
                setLoading(false)
            }
        })

        return () => { cancelled = true }
    }, [effectiveLocation])

    return { stores, loading }
}

// ---------- Componente ----------
interface BannerPagoProps {
    savedLocation?: { lat: number; lng: number } | null
}

export default function BannerPago({ savedLocation = null }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)
    const isPageVisibleRef = useRef(true)

    const { stores, loading } = useBannerStores(savedLocation)
    const sortedStores = stores
    const totalRealSlides = sortedStores.length

    const loopingStores =
        totalRealSlides > 1
            ? [sortedStores[totalRealSlides - 1], ...sortedStores, sortedStores[0]]
            : sortedStores

    const [activeIndex, setActiveIndex] = useState<number>(totalRealSlides > 1 ? 1 : 0)
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    const slideWidthPercent = 80
    const sideSpacingPercent = (100 - slideWidthPercent) / 2
    const gapPercent = 2
    const unitPercent = slideWidthPercent + gapPercent

    useEffect(() => {
        if (totalRealSlides > 1) {
            setActiveIndex(1)
            setIsTransitioning(true)
        } else if (totalRealSlides === 1) {
            setActiveIndex(0)
            setIsTransitioning(true)
        }
    }, [totalRealSlides])

    const goToNext = useCallback(() => {
        if (totalRealSlides <= 1 || !isTransitioning) return
        setActiveIndex(prev => prev + 1)
    }, [totalRealSlides, isTransitioning])

    const goToPrev = useCallback(() => {
        if (totalRealSlides <= 1 || !isTransitioning) return
        setActiveIndex(prev => prev - 1)
    }, [totalRealSlides, isTransitioning])

    useEffect(() => {
        if (totalRealSlides <= 1) return
        const handleTransitionEnd = () => {
            if (activeIndex === 0) {
                setIsTransitioning(false)
                setActiveIndex(totalRealSlides)
            } else if (activeIndex === loopingStores.length - 1) {
                setIsTransitioning(false)
                setActiveIndex(1)
            }
        }
        const track = trackRef.current
        track?.addEventListener('transitionend', handleTransitionEnd)
        return () => track?.removeEventListener('transitionend', handleTransitionEnd)
    }, [activeIndex, totalRealSlides, loopingStores.length])

    useEffect(() => {
        if (!isTransitioning) {
            const timeout = setTimeout(() => setIsTransitioning(true), 50)
            return () => clearTimeout(timeout)
        }
    }, [isTransitioning])

    // Visibilidade da página (evita sumiço)
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible'
            isPageVisibleRef.current = isVisible

            if (isVisible && totalRealSlides > 1) {
                if (activeIndex === 0 || activeIndex === loopingStores.length - 1) {
                    setIsTransitioning(false)
                    setActiveIndex(activeIndex === 0 ? totalRealSlides : 1)
                }
                requestAnimationFrame(() => {
                    setIsTransitioning(true)
                })
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [activeIndex, totalRealSlides, loopingStores.length])

    useEffect(() => {
        if (isHovered || isDragging || totalRealSlides <= 1) return
        if (!isPageVisibleRef.current) return

        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalRealSlides])

    const handleDragStart = useCallback((clientX: number) => {
        setIsDragging(true)
        setDragStartX(clientX)
        setDragOffset(0)
    }, [])
    const handleDragMove = useCallback((clientX: number) => {
        if (!isDragging) return
        setDragOffset(clientX - dragStartX)
    }, [isDragging, dragStartX])
    const handleDragEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragOffset > 50) goToPrev()
        else if (dragOffset < -50) goToNext()
        setDragOffset(0)
    }, [isDragging, dragOffset, goToPrev, goToNext])

    const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientX) }
    const onMouseMove = (e: React.MouseEvent) => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientX) } }
    const onMouseUp = () => handleDragEnd()
    const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX)
    const onTouchMove = (e: React.TouchEvent) => { if (isDragging) handleDragMove(e.touches[0].clientX) }
    const onTouchEnd = () => handleDragEnd()

    const baseTranslate = -activeIndex * unitPercent + sideSpacingPercent
    const totalTranslate = baseTranslate + dragOffset / (trackRef.current?.clientWidth || 1) * 100

    const realIndex =
        totalRealSlides > 1
            ? activeIndex === 0
                ? totalRealSlides - 1
                : activeIndex === loopingStores.length - 1
                    ? 0
                    : activeIndex - 1
            : 0

    const formatDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes}min`
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return m > 0 ? `${h}h ${m}min` : `${h}h`
    }

    const formatDistance = (meters: number) =>
        meters < 1000
            ? `${Math.round(meters)} m`
            : `${(meters / 1000).toFixed(1)} km`

    const renderDeliveryBadge = (store: StoreCard) => {
        if (!store.acceptsDelivery) return null
        if (store.deliveryType === 'free' || (store.deliveryFee != null && store.deliveryFee === 0)) {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>Grátis</span>
                </span>
            )
        } else if (store.deliveryType === 'fixed' && store.deliveryFee != null) {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>R$ {store.deliveryFee.toFixed(2)}</span>
                </span>
            )
        } else if (store.deliveryType === 'distance') {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>a calcular</span>
                </span>
            )
        }
        return null
    }

    if (loading && stores.length === 0) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-2" />
                <div className="h-72 sm:h-96 lg:h-[30rem] bg-gray-200 rounded-2xl" />
            </div>
        )
    }

    if (!sortedStores.length) return null

    return (
        <div
            className="relative w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-2 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Lojas em destaque
                </h2>
            </div>

            <div
                className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div
                    ref={trackRef}
                    className="flex"
                    style={{
                        transform: `translateX(${totalTranslate}%)`,
                        transition: isTransitioning && !isDragging
                            ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                            : 'none',
                        willChange: 'transform'
                    }}
                >
                    {loopingStores.map((store, index) => {
                        const distance = index - activeIndex
                        const isActive = distance === 0
                        const isNear = Math.abs(distance) === 1

                        const scale = isActive ? 1 : isNear ? 0.92 : 0.85
                        const opacity = isActive ? 1 : isNear ? 0.8 : 0
                        const zIndex = isActive ? 10 : isNear ? 5 : 1
                        const brightness = isActive ? 'brightness(1)' : 'brightness(0.7)'

                        const backgroundImage = store.coverUrl || store.logoUrl

                        return (
                            <div
                                key={`${store.slug}-${index}`}
                                className="flex-shrink-0 px-[1%]"
                                style={{
                                    width: `${slideWidthPercent}%`,
                                    transition: 'transform 0.5s ease, opacity 0.5s ease, filter 0.5s ease',
                                    transform: `scale(${scale})`,
                                    opacity,
                                    zIndex,
                                    filter: brightness,
                                }}
                            >
                                <div className="relative h-72 sm:h-96 lg:h-[30rem]">
                                    <div
                                        onClick={() => {
                                            if (!isDragging) router.push(`/${store.slug}`)
                                        }}
                                        className="group absolute inset-0 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02]"
                                        style={{
                                            borderColor: colors.border,
                                            boxShadow: isActive
                                                ? `0 20px 40px ${colors.accent}33`
                                                : colors.shadow,
                                        }}
                                    >
                                        {backgroundImage ? (
                                            <img
                                                src={backgroundImage}
                                                alt={store.name}
                                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div
                                                className="absolute inset-0"
                                                style={{
                                                    background: `linear-gradient(135deg, ${colors.accent}66, ${colors.background})`,
                                                }}
                                            />
                                        )}

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

                                        {/* Badge de status no canto superior esquerdo */}
                                        <div className="absolute top-3 left-3 z-20">
                                            <div
                                                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                                style={{
                                                    background: store.isOpen ? '#10b981' : '#ef4444',
                                                    color: '#ffffff',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                                }}
                                            >
                                                <Clock size={12} />
                                                <span>{store.isOpen ? 'Aberto' : 'Fechado'}</span>
                                                {store.isOpen && store.todayHours && (
                                                    <span className="opacity-90 ml-0.5 text-[10px]">
                                                        {store.todayHours}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Badge de avaliação no canto superior direito */}
                                        <div className="absolute top-3 right-3 z-20">
                                            {store.rating != null && store.rating > 0 && (
                                                <div
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                                    style={{
                                                        background: 'rgba(0,0,0,0.75)',
                                                        color: '#ffffff',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                                    }}
                                                >
                                                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                                                    <span>{store.rating.toFixed(1)}</span>
                                                    {store.ratingCount && (
                                                        <span className="text-[10px] text-white/80">
                                                            ({store.ratingCount})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Container único abaixo do status: duração + entrega/retirada */}
                                        <div className="absolute top-12 left-3 z-20">
                                            <div
                                                className="flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                                style={{
                                                    background: 'rgba(0,0,0,0.75)',
                                                    color: '#ffffff',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                                }}
                                            >
                                                {store.durationMin != null && store.durationMax != null && (
                                                    <span className="flex items-center gap-1">
                                                        <Timer size={12} />
                                                        <span>
                                                            {formatDuration(store.durationMin)}
                                                            {store.durationMin !== store.durationMax && ` - ${formatDuration(store.durationMax)}`}
                                                        </span>
                                                    </span>
                                                )}
                                                {store.durationMin != null && store.durationMax != null && (
                                                    <span className="opacity-50 mx-0.5">•</span>
                                                )}
                                                {store.acceptsDelivery ? (
                                                    renderDeliveryBadge(store)
                                                ) : store.acceptsPickup ? (
                                                    <span className="flex items-center gap-1">
                                                        <PackageCheck size={12} />
                                                        <span>Retirada</span>
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Conteúdo inferior */}
                                        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white z-10">
                                            <h3 className="text-xl sm:text-3xl lg:text-4xl font-black drop-shadow-lg mb-0.5 leading-tight">
                                                {store.name}
                                            </h3>

                                            {store.description && (
                                                <p className="text-xs sm:text-sm text-white/80 line-clamp-2 mb-2 max-w-prose">
                                                    {store.description}
                                                </p>
                                            )}

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs mb-2">
                                                {store.address && (
                                                    <div className="flex items-center gap-1">
                                                        <MapPin size={14} className="text-white/70 shrink-0" />
                                                        <span className="leading-tight opacity-90">{store.address}</span>
                                                    </div>
                                                )}
                                                {store.distanceMeters != null && (
                                                    <div className="flex items-center gap-1">
                                                        <Spline size={14} className="text-emerald-300" />
                                                        <span className="font-bold">{formatDistance(store.distanceMeters)}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 mt-2">
                                                {store.topProducts && store.topProducts.length > 0 && (
                                                    <div className="flex -space-x-2">
                                                        {store.topProducts.slice(0, 3).map((product, i) => (
                                                            <div
                                                                key={i}
                                                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 overflow-hidden bg-black/40 backdrop-blur-sm"
                                                                title={product.name}
                                                            >
                                                                {product.imageUrl ? (
                                                                    <img
                                                                        src={product.imageUrl}
                                                                        alt={product.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-white text-[10px] sm:text-sm font-black">
                                                                        {product.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {store.topProducts.length > 3 && (
                                                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-sm flex items-center justify-center text-[10px] sm:text-sm font-bold text-white">
                                                                +{store.topProducts.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {store.viewCount != null && store.viewCount > 0 && (
                                                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/90">
                                                        <Eye size={12} />
                                                        <span>{store.viewCount}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {totalRealSlides > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {sortedStores.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (totalRealSlides <= 1) return
                                    setIsTransitioning(true)
                                    setActiveIndex(idx + 1)
                                }}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === realIndex ? '1.5rem' : '0.5rem',
                                    background: idx === realIndex ? colors.accent : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}