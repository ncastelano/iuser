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
    Timer,
    TrendingUp
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

// ---------- Hook de dados ----------
function useBannerStores(userLocation: { lat: number; lng: number } | null) {
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStores = async () => {
            setLoading(true)

            let storesList: any[] | null = null
            let error: any = null

            if (userLocation) {
                const { data, error: rpcErr } = await supabase
                    .rpc('get_stores_with_distance', {
                        user_lat: userLocation.lat,
                        user_lng: userLocation.lng
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

            if (error) {
                console.error('[BannerPago] Erro na busca:', error)
                setLoading(false)
                return
            }

            const { data: productsList } = await supabase.from('products').select('id, name, store_id, image_url, duration_minutes')
            const { data: reviewsList } = await supabase.from('product_reviews').select('store_id, rating')
            const { data: salesList } = await supabase.from('store_sales').select('product_id')

            processStores(storesList, productsList, reviewsList, salesList)
        }

        const processStores = (storesList: any[] | null, productsList: any[] | null, reviewsList: any[] | null, salesList: any[] | null) => {
            // Ratings por loja
            const ratingsMap = new Map<string, { sum: number; count: number }>()
            reviewsList?.forEach(r => {
                if (!ratingsMap.has(r.store_id)) ratingsMap.set(r.store_id, { sum: 0, count: 0 })
                const cur = ratingsMap.get(r.store_id)!
                cur.sum += r.rating
                cur.count += 1
            })

            // Vendas por produto
            const salesCount = new Map<string, number>()
            salesList?.forEach(s => {
                salesCount.set(s.product_id, (salesCount.get(s.product_id) || 0) + 1)
            })

            // Produtos agrupados por loja
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

                return {
                    slug: store.storeSlug,
                    name: store.name,
                    logoUrl,
                    coverUrl: logoUrl,
                    description: store.description,
                    rating: Number(avg.toFixed(1)),
                    ratingCount: count,
                    isOpen,
                    address: store.address,
                    todayHours,
                    viewCount: store.view_count ?? 0,
                    durationMin,
                    durationMax,
                    topProducts,
                    distanceMeters
                }
            })

            cards.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
            setStores(cards)
            setLoading(false)
        }

        fetchStores()
    }, [userLocation])

    return { stores, loading }
}

// ---------- Componente ----------
interface BannerPagoProps {
    userLocation?: { lat: number; lng: number } | null
}

export default function BannerPago({ userLocation = null }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { stores, loading } = useBannerStores(userLocation)

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

    useEffect(() => {
        if (isHovered || isDragging || totalRealSlides <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalRealSlides])

    // Drag
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

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="h-72 sm:h-96 lg:h-[30rem] bg-gray-200 rounded-2xl" />
            </div>
        )
    }

    if (!sortedStores.length) return null

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-4 px-1">
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
                        const locationInfo = store.address

                        const hasDuration = store.durationMin != null || store.durationMax != null
                        const durationText = hasDuration
                            ? store.durationMin === store.durationMax
                                ? formatDuration(store.durationMin!)
                                : `${formatDuration(store.durationMin!)} - ${formatDuration(store.durationMax!)}`
                            : null

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
                                <div
                                    onClick={() => {
                                        if (!isDragging) router.push(`/${store.slug}`)
                                    }}
                                    className="group relative h-72 sm:h-96 lg:h-[30rem] rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02]"
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

                                    {/* Badges superiores */}
                                    <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
                                        {store.isOpen !== undefined && (
                                            <div
                                                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm"
                                                style={{
                                                    background: store.isOpen ? '#10b981' : '#ef4444',
                                                    color: '#ffffff',
                                                }}
                                            >
                                                <Clock size={14} />
                                                <span>{store.isOpen ? 'Aberto' : 'Fechado'}</span>
                                                {store.todayHours && (
                                                    <span className="opacity-90 ml-1">
                                                        {store.todayHours}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {durationText && (
                                            <div
                                                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm"
                                                style={{ background: 'rgba(0,0,0,0.5)', color: '#ffffff' }}
                                            >
                                                <Timer size={14} />
                                                <span>{durationText}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="absolute top-4 right-4 z-20">
                                        {store.viewCount != null && store.viewCount > 0 && (
                                            <div
                                                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm"
                                                style={{ background: 'rgba(0,0,0,0.5)', color: '#ffffff' }}
                                            >
                                                <Eye size={14} />
                                                <span>{store.viewCount}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Conteúdo textual */}
                                    <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white z-10">
                                        <h3 className="text-2xl sm:text-4xl font-black drop-shadow-lg mb-1 leading-tight">
                                            {store.name}
                                        </h3>

                                        {store.description && (
                                            <p className="text-sm sm:text-base text-white/80 line-clamp-2 mb-4 max-w-prose">
                                                {store.description}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
                                            {store.rating != null && store.rating > 0 && (
                                                <div className="flex items-center gap-1.5">
                                                    <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                                    <span className="font-black">{store.rating.toFixed(1)}</span>
                                                    {store.ratingCount && (
                                                        <span className="text-white/70 ml-0.5">
                                                            ({store.ratingCount})
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {locationInfo && (
                                                <div className="flex items-start gap-1">
                                                    <MapPin size={16} className="text-white/70 mt-0.5 shrink-0" />
                                                    <span className="leading-tight">{locationInfo}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Produtos + distância na mesma linha */}
                                        <div className="flex items-center justify-between mt-4 gap-2">
                                            <div className="flex items-center gap-3">
                                                {store.topProducts && store.topProducts.length > 0 && (
                                                    <div className="flex -space-x-2">
                                                        {store.topProducts.slice(0, 3).map((product, i) => (
                                                            <div
                                                                key={i}
                                                                className="w-10 h-10 rounded-full border-2 border-white/30 overflow-hidden bg-black/40 backdrop-blur-sm"
                                                                title={product.name}
                                                            >
                                                                {product.imageUrl ? (
                                                                    <img
                                                                        src={product.imageUrl}
                                                                        alt={product.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-white text-sm font-black">
                                                                        {product.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {store.topProducts.length > 3 && (
                                                            <div className="w-10 h-10 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-sm flex items-center justify-center text-sm font-bold text-white">
                                                                +{store.topProducts.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {store.topProducts && store.topProducts.length > 0 && (
                                                    <TrendingUp size={16} className="text-emerald-300" />
                                                )}
                                            </div>

                                            {/* Distância (calculada via PostGIS RPC) */}
                                            {store.distanceMeters != null && (
                                                <div className="flex items-center gap-1 text-xs font-bold text-white/90 whitespace-nowrap">
                                                    <MapPin size={14} className="text-emerald-300" />
                                                    {formatDistance(store.distanceMeters)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Se não houver produtos, mas houver distância */}
                                        {(!store.topProducts || store.topProducts.length === 0) && store.distanceMeters != null && (
                                            <div className="flex items-center gap-1 mt-3 text-xs font-bold text-white/90">
                                                <MapPin size={14} className="text-emerald-300" />
                                                {formatDistance(store.distanceMeters)}
                                            </div>
                                        )}
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