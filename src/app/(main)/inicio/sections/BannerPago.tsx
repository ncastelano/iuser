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
    distance?: string
    address?: string
    todayHours?: string
    viewCount?: number
    durationMin?: number | null
    durationMax?: number | null
    topProducts?: TopProduct[]
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
function useBannerStores() {
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStores = async () => {
            setLoading(true)

            const [
                { data: storesList, error: sErr },
                { data: productsList },
                { data: reviewsList },
                { data: salesList }
            ] = await Promise.all([
                supabase.from('stores').select('*'),
                supabase.from('products').select('id, name, store_id, image_url, duration_minutes'),
                supabase.from('product_reviews').select('store_id, rating'),
                supabase.from('store_sales').select('product_id')
            ])

            if (sErr) {
                console.error('[BannerPago] Erro ao buscar lojas:', sErr)
                setLoading(false)
                return
            }

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

            // Monta cards
            const cards: StoreCard[] = (storesList || []).map(store => {
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

                return {
                    slug: store.storeSlug,
                    name: store.name,
                    logoUrl,
                    description: store.description,
                    rating: Number(avg.toFixed(1)),
                    ratingCount: count,
                    isOpen,
                    address: store.address,
                    todayHours,
                    viewCount: store.view_count ?? 0,
                    durationMin,
                    durationMax,
                    topProducts
                }
            })

            // Ordena por viewCount decrescente
            cards.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
            setStores(cards)
            setLoading(false)
        }

        fetchStores()
    }, [])

    return { stores, loading }
}

// ---------- Componente ----------
export default function BannerPago() {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { stores, loading } = useBannerStores()

    const sortedStores = stores // já ordenadas no hook
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

    // Reinicia quando totalRealSlides mudar (ex.: dados carregados)
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
            {/* Cabeçalho */}
            <div className="flex items-center gap-2 mb-4 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2
                    className="text-sm font-black uppercase tracking-wider"
                    style={{ color: colors.textPrimary }}
                >
                    Lojas em destaque
                </h2>
            </div>

            {/* Container da faixa de slides */}
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

                        const backgroundImage = store.logoUrl
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
                                    {/* Imagem de fundo */}
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

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20" />

                                    {/* Badges superiores */}
                                    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
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
                                                    <span className="opacity-90 ml-1 truncate max-w-[80px]">
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
                                    <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-8 text-white">
                                        <div className="flex items-center gap-3 mb-3">
                                            {store.logoUrl && (
                                                <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white/30 flex-shrink-0">
                                                    <img
                                                        src={store.logoUrl}
                                                        alt={store.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            <h3 className="text-xl sm:text-3xl font-black drop-shadow-lg">
                                                {store.name}
                                            </h3>
                                        </div>

                                        {store.description && (
                                            <p className="text-xs sm:text-sm text-white/80 line-clamp-2 mb-3">
                                                {store.description}
                                            </p>
                                        )}

                                        {/* Rodapé: avaliação, localização, top produtos */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                {store.rating != null && store.rating > 0 && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                                        <span className="text-sm font-black">
                                                            {store.rating.toFixed(1)}
                                                        </span>
                                                        {store.ratingCount && (
                                                            <span className="text-xs text-white/70">
                                                                ({store.ratingCount})
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {locationInfo && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-white/80">
                                                        <MapPin size={14} className="text-white/70" />
                                                        <span className="whitespace-normal break-words">
                                                            {locationInfo}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>

                                            {store.topProducts && store.topProducts.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex -space-x-2">
                                                        {store.topProducts.slice(0, 3).map((product, i) => (
                                                            <div
                                                                key={i}
                                                                className="w-8 h-8 rounded-full border-2 border-white/30 overflow-hidden bg-black/40 backdrop-blur-sm"
                                                                title={product.name}
                                                            >
                                                                {product.imageUrl ? (
                                                                    <img
                                                                        src={product.imageUrl}
                                                                        alt={product.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-white text-xs font-black">
                                                                        {product.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {store.topProducts.length > 3 && (
                                                            <div className="w-8 h-8 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-sm flex items-center justify-center text-xs font-bold text-white">
                                                                +{store.topProducts.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <TrendingUp size={14} className="text-emerald-300" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Controles e dots */}
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