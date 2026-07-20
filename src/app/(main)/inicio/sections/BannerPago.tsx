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
import { getStatusIntervalText } from '@/lib/storeHours'

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
    isOpen: boolean
    statusText: string
    address?: string
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

// ---------- Helpers ----------
function extractStreetAddress(fullAddress?: string): string {
    if (!fullAddress) return ''
    const parts = fullAddress.split(',').map(p => p.trim())
    let street = parts[0] || ''
    if (parts.length > 1 && !/\d/.test(street)) {
        street += ', ' + parts[1]
    }
    return street
}

const CACHE_KEY = 'banner_stores_cache_v2'
const CACHE_TTL = 5 * 60 * 1000

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

// ---------- Hook para detectar breakpoint ----------
function useBreakpoint() {
    const [slidesPerView, setSlidesPerView] = useState(1)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1120) {
                setSlidesPerView(3) // xl: 3 slides
            } else if (width >= 800) {
                setSlidesPerView(2) // md: 2 slides
            } else {
                setSlidesPerView(1) // default: 1 slide
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return slidesPerView
}

// ---------- Componente Skeleton ----------
function BannerSkeleton({ slidesPerView = 1 }: { slidesPerView?: number }) {
    const { colors } = useTheme()
    const visibleSlides = Math.min(slidesPerView, 3)

    return (
        <div className="relative w-full">
            <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-4 h-4 rounded-full animate-pulse" style={{ background: colors.border }} />
                <div className="h-5 w-40 rounded animate-pulse" style={{ background: colors.border }} />
            </div>

            <div className="relative overflow-hidden">
                <div className="flex gap-3">
                    {Array.from({ length: visibleSlides }).map((_, index) => (
                        <div
                            key={index}
                            className="flex-shrink-0"
                            style={{
                                width: `${100 / visibleSlides}%`,
                            }}
                        >
                            <div className="relative h-72 sm:h-96 lg:h-[30rem]">
                                <div
                                    className="absolute inset-0 rounded-2xl overflow-hidden border"
                                    style={{
                                        borderColor: colors.border,
                                        background: colors.surface,
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 animate-pulse"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.border}40, ${colors.border}20)`,
                                        }}
                                    />

                                    <div className="absolute top-3 left-3 z-20">
                                        <div
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                                            style={{
                                                background: colors.border,
                                                width: 80,
                                                height: 26,
                                            }}
                                        >
                                            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-12 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                    </div>

                                    <div className="absolute top-12 left-3 z-20">
                                        <div
                                            className="flex items-center gap-2 px-2 py-1 rounded-full"
                                            style={{
                                                background: colors.surface,
                                                opacity: 0.6,
                                                height: 26,
                                            }}
                                        >
                                            <div className="w-4 h-4 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-16 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-4 h-4 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-16 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 z-10">
                                        <div className="w-3/4 h-8 sm:h-10 rounded animate-pulse mb-1" style={{ background: colors.border }} />
                                        <div className="flex flex-col gap-1 mb-2">
                                            <div className="w-1/2 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-1/3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                <div className="w-24 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                <div className="w-12 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex -space-x-2">
                                                {[1, 2, 3].map((_, i) => (
                                                    <div
                                                        key={i}
                                                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 overflow-hidden animate-pulse"
                                                        style={{ background: colors.border }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                    <div className="w-8 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                    <div className="w-10 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-4">
                <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: colors.border }} />
                <div className="flex gap-2">
                    {[1, 2, 3].map((_, idx) => (
                        <div
                            key={idx}
                            className="h-2 rounded-full animate-pulse"
                            style={{
                                width: idx === 1 ? '1.5rem' : '0.5rem',
                                background: colors.border,
                            }}
                        />
                    ))}
                </div>
                <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: colors.border }} />
            </div>
        </div>
    )
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
                    setEffectiveLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    })
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

                const status = getStatusIntervalText(store.business_hours)

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
                    isOpen: status.isOpen,
                    statusText: status.text,
                    address: streetAddress,
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
        if (cached && cached.length > 0) {
            setStores(cached)
            setLoading(false)
        }

        fetchFreshData()
            .then((freshCards) => {
                if (!cancelled && freshCards) {
                    setStores(freshCards)
                    saveCache(freshCards)
                }
            })
            .catch((err) => {
                console.error("Error fetching banner stores:", err)
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => { cancelled = true }
    }, [effectiveLocation])

    return { stores, loading }
}

// ---------- Componente Principal ----------
interface BannerPagoProps {
    savedLocation?: { lat: number; lng: number } | null
}

export default function BannerPago({ savedLocation = null }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { stores, loading } = useBannerStores(savedLocation)
    const slidesPerView = useBreakpoint() // NOVO: hook de responsividade
    const sortedStores = stores
    const totalRealSlides = sortedStores.length

    // Divide os stores em grupos baseado no slidesPerView
    const totalPages = Math.max(1, Math.ceil(totalRealSlides / slidesPerView))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)
    const [isTransitioning, setIsTransitioning] = useState(true)

    // Reset página quando mudar o breakpoint
    useEffect(() => {
        setCurrentPage(0)
    }, [slidesPerView])

    const goToNext = useCallback(() => {
        if (totalPages <= 1) return
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        if (totalPages <= 1) return
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    // Autoplay
    useEffect(() => {
        if (isHovered || isDragging || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalPages])

    // Calcular os itens da página atual
    const currentItems = useCallback(() => {
        if (totalRealSlides === 0) return []
        const start = currentPage * slidesPerView
        const end = Math.min(start + slidesPerView, totalRealSlides)
        return sortedStores.slice(start, end)
    }, [sortedStores, currentPage, slidesPerView, totalRealSlides])

    const items = currentItems()

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

    const translateX = dragOffset / (trackRef.current?.clientWidth || 1) * 100

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

    // Mostra skeleton se estiver carregando
    if (loading) {
        return <BannerSkeleton slidesPerView={slidesPerView} />
    }

    if (!sortedStores.length) return null

    // Grid responsivo baseado no slidesPerView
    const gridCols = slidesPerView === 3 ? 'grid-cols-3' : slidesPerView === 2 ? 'grid-cols-2' : 'grid-cols-1'

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
                    className={`grid ${gridCols} gap-3`}
                    style={{
                        transform: isDragging ? `translateX(${translateX}px)` : 'none',
                        transition: isDragging ? 'none' : 'transform 0.3s ease',
                    }}
                >
                    {items.map((store) => {
                        const backgroundImage = store.coverUrl || store.logoUrl

                        return (
                            <div
                                key={store.slug}
                                className="relative h-72 sm:h-96 lg:h-[30rem]"
                            >
                                <div
                                    onClick={() => router.push(`/${store.slug}`)}
                                    className="group absolute inset-0 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02]"
                                    style={{
                                        borderColor: colors.border,
                                        boxShadow: colors.shadow,
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

                                    {/* Badge de status */}
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
                                            <span>{store.statusText}</span>
                                        </div>
                                    </div>

                                    {/* Badge de duração + entrega */}
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

                                        {/* Produtos + métricas */}
                                        <div className="flex items-center justify-between mt-2">
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

                                            <div className="flex items-center gap-3 ml-auto">
                                                {store.viewCount != null && store.viewCount > 0 && (
                                                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/90">
                                                        <Eye size={12} />
                                                        <span>{store.viewCount}</span>
                                                    </div>
                                                )}
                                                {store.rating != null && store.rating > 0 && (
                                                    <div className="flex items-center gap-1.5 text-xs font-bold">
                                                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                                                        <span className="text-white/90">{store.rating.toFixed(1)}</span>
                                                        {store.ratingCount && (
                                                            <span className="text-[10px] text-white/60">
                                                                ({store.ratingCount})
                                                            </span>
                                                        )}
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

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentPage(idx)}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === currentPage ? '1.5rem' : '0.5rem',
                                    background: idx === currentPage ? colors.accent : colors.border,
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