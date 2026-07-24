'use client'

import { useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store,
    MapPin,
    Clock,
    Star,
    ChevronRight,
    TrendingUp,
    Eye,
    ShoppingBag,
    Coffee,
    Loader2,
    AlertCircle,
    ChevronLeft,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { RatingStars } from '@/components/ratings/RatingStars'
import {
    isStoreOpenNow,
    getStoreStatusText,
    type BusinessHours
} from '@/lib/storeHours'
import { toast } from 'sonner'

// ========== TIPOS ==========
export type StoreCardData = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    logo_url?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    business_hours?: BusinessHours | null
    view_count?: number
    top_products?: {
        id: string
        name: string
        image_url?: string | null
        price: number
    }[]
    recent_reviews?: {
        id: string
        rating: number
        comment?: string
        profile_name?: string
    }[]
}

type StoreListProps = {
    initialStores?: StoreCardData[]
    onStoreClick?: (storeSlug: string) => void
    maxItems?: number
    className?: string
    title?: string
    dragHandle?: ReactNode
}

// ========== COMPONENTE DE STATUS ==========
function StoreStatus({ businessHours }: { businessHours: BusinessHours | null | undefined }) {
    const [statusText, setStatusText] = useState('')
    const [isOpen, setIsOpen] = useState(false)

    const updateStatus = useCallback(() => {
        const open = isStoreOpenNow(businessHours)
        setIsOpen(open)
        setStatusText(getStoreStatusText(businessHours))
    }, [businessHours])

    useEffect(() => {
        updateStatus()
        const interval = setInterval(updateStatus, 30000)
        return () => clearInterval(interval)
    }, [updateStatus])

    const statusColor = isOpen ? '#10b981' : '#ef4444'
    const isLunchTime = statusText.includes('almoço')

    return (
        <div className="flex items-center gap-1.5">
            {isLunchTime ? (
                <Coffee className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
            ) : (
                <Clock className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
            )}
            <span className="text-[10px] font-medium truncate" style={{ color: statusColor }}>
                {statusText}
            </span>
        </div>
    )
}

// ========== COMPONENTE CARD ==========
function StoreCard({
    store,
    onClick,
    colors,
}: {
    store: StoreCardData
    onClick: () => void
    colors: any
}) {
    const isOpen = isStoreOpenNow(store.business_hours)
    const addressShort = store.address ? store.address.split(',')[0]?.trim() || store.address : 'Endereço não informado'

    return (
        <div
            onClick={onClick}
            className="group flex-shrink-0 w-[280px] rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
            style={{
                background: colors.surface,
                borderColor: colors.border,
            }}
        >
            {/* Logo / Imagem */}
            <div
                className="relative w-full h-40 overflow-hidden"
                style={{ background: colors.accentLight }}
            >
                {store.logo_url ? (
                    <img
                        src={store.logo_url}
                        alt={store.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Store className="w-16 h-16 opacity-30" style={{ color: colors.accent }} />
                    </div>
                )}

                {/* Badge de status */}
                <div
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-lg flex items-center gap-1.5"
                    style={{
                        background: isOpen ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
                        color: '#fff',
                    }}
                >
                    <div
                        className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOpen ? 'bg-white' : 'bg-white/60'
                            }`}
                    />
                    {isOpen ? 'Aberto' : 'Fechado'}
                </div>

                {/* Visitantes */}
                {store.view_count && store.view_count > 0 && (
                    <div className="absolute bottom-3 left-3 px-2 py-1 rounded-full text-[9px] font-bold shadow-md flex items-center gap-1"
                        style={{
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff',
                        }}
                    >
                        <Eye className="w-3 h-3" />
                        {store.view_count}
                    </div>
                )}
            </div>

            {/* Conteúdo */}
            <div className="p-4 space-y-2">
                {/* Nome e endereço */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                            {store.name}
                        </h3>
                        {store.address && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: colors.textSecondary }}>
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{addressShort}</span>
                            </div>
                        )}
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.textSecondary }} />
                </div>

                {/* Avaliações */}
                {store.ratings_count && store.ratings_count > 0 ? (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <RatingStars value={store.ratings_avg || 0} size={12} />
                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                {store.ratings_avg?.toFixed(1)}
                            </span>
                        </div>
                        <span className="text-[9px] opacity-60" style={{ color: colors.textSecondary }}>
                            ({store.ratings_count})
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 opacity-30" style={{ color: colors.textSecondary }} />
                        <span className="text-[9px] opacity-60" style={{ color: colors.textSecondary }}>
                            Sem avaliações
                        </span>
                    </div>
                )}

                {/* Status */}
                <StoreStatus businessHours={store.business_hours} />

                {/* Produtos em destaque */}
                {store.top_products && store.top_products.length > 0 && (
                    <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                        <p className="text-[9px] font-black uppercase tracking-wider mb-1.5 opacity-60" style={{ color: colors.textSecondary }}>
                            <TrendingUp className="inline w-3 h-3 mr-1" />
                            Destaques
                        </p>
                        <div className="flex gap-1.5">
                            {store.top_products.slice(0, 2).map((product) => (
                                <div
                                    key={product.id}
                                    className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    {product.image_url ? (
                                        <img
                                            src={product.image_url}
                                            alt=""
                                            className="w-5 h-5 rounded object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <ShoppingBag className="w-3 h-3 flex-shrink-0 opacity-40" style={{ color: colors.textSecondary }} />
                                    )}
                                    <span className="text-[9px] font-medium truncate flex-1" style={{ color: colors.textPrimary }}>
                                        {product.name}
                                    </span>
                                    <span className="text-[8px] font-bold flex-shrink-0" style={{ color: colors.accent }}>
                                        R$ {product.price.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Review recente */}
                {store.recent_reviews && store.recent_reviews.length > 0 && (
                    <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                        {store.recent_reviews.slice(0, 1).map((review) => (
                            <div key={review.id} className="flex items-start gap-1.5">
                                <Star className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] font-bold" style={{ color: colors.textPrimary }}>
                                            {review.profile_name}
                                        </span>
                                        <RatingStars value={review.rating} size={7} />
                                    </div>
                                    {review.comment && (
                                        <p className="text-[9px] truncate opacity-70" style={{ color: colors.textSecondary }}>
                                            "{review.comment}"
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ========== SKELETON CARD ==========
function StoreCardSkeleton({ colors }: { colors: any }) {
    return (
        <div className="flex-shrink-0 w-[280px] rounded-2xl overflow-hidden border animate-pulse"
            style={{
                borderColor: colors.border,
                background: colors.surface,
            }}
        >
            {/* Imagem skeleton */}
            <div className="relative w-full h-40 overflow-hidden"
                style={{ background: colors.accentLight }}
            >
                <div className="w-full h-full" style={{ background: `${colors.border}60` }} />

                {/* Badge de status skeleton */}
                <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full w-20 h-6"
                    style={{ background: `${colors.border}80` }}
                />
            </div>

            {/* Conteúdo skeleton */}
            <div className="p-4 space-y-3">
                <div className="h-5 rounded w-3/4" style={{ background: `${colors.border}60` }} />
                <div className="h-3 rounded w-1/2" style={{ background: `${colors.border}40` }} />
                <div className="flex items-center gap-2">
                    <div className="h-3 rounded w-20" style={{ background: `${colors.border}40` }} />
                    <div className="h-2 rounded w-10" style={{ background: `${colors.border}30` }} />
                </div>
                <div className="h-3 rounded w-24" style={{ background: `${colors.border}40` }} />
                <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                    <div className="h-3 rounded w-16 mb-1.5" style={{ background: `${colors.border}40` }} />
                    <div className="flex gap-1.5">
                        <div className="flex-1 h-8 rounded-lg" style={{ background: `${colors.border}30` }} />
                        <div className="flex-1 h-8 rounded-lg" style={{ background: `${colors.border}30` }} />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ========== COMPONENTE PRINCIPAL ==========
export function StoreList({
    initialStores,
    onStoreClick,
    maxItems,
    className = '',
    title,
    dragHandle,
}: StoreListProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const [stores, setStores] = useState<StoreCardData[]>(initialStores || [])
    const [filteredStores, setFilteredStores] = useState<StoreCardData[]>(initialStores || [])
    const [loading, setLoading] = useState(!initialStores)
    const [error, setError] = useState<string | null>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)
    const dragDistance = useRef(0)

    // Carregar lojas se não foram passadas como prop
    useEffect(() => {
        if (initialStores) {
            setStores(initialStores)
            setFilteredStores(initialStores)
            setLoading(false)
            return
        }

        const loadStores = async () => {
            setLoading(true)
            setError(null)

            try {
                const { data: storesData, error: storesError } = await supabase
                    .from('stores')
                    .select(`
                        id,
                        name,
                        storeSlug,
                        description,
                        address,
                        logo_url,
                        ratings_avg,
                        ratings_count,
                        owner_id,
                        business_hours,
                        view_count
                    `)
                    .order('created_at', { ascending: false })

                if (storesError) throw storesError

                if (!storesData || storesData.length === 0) {
                    setStores([])
                    setFilteredStores([])
                    setLoading(false)
                    return
                }

                const storesWithDetails = await Promise.all(
                    storesData.map(async (store) => {
                        const { data: products } = await supabase
                            .from('products')
                            .select('id, name, image_url, price')
                            .eq('store_id', store.id)
                            .order('created_at', { ascending: false })
                            .limit(2)

                        const { data: reviews } = await supabase
                            .from('product_reviews')
                            .select(`
                                id,
                                rating,
                                comment,
                                is_anonymous,
                                profiles!inner (
                                    name
                                )
                            `)
                            .eq('store_id', store.id)
                            .order('created_at', { ascending: false })
                            .limit(2)

                        const mappedReviews = (reviews || []).map((review: any) => ({
                            ...review,
                            profile_name: review.is_anonymous
                                ? 'Anônimo'
                                : review.profiles?.[0]?.name || 'Usuário',
                        }))

                        const mappedProducts = (products || []).map((p: any) => ({
                            ...p,
                            image_url: p.image_url
                                ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                                : null,
                        }))

                        return {
                            ...store,
                            logo_url: store.logo_url
                                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                                : null,
                            top_products: mappedProducts,
                            recent_reviews: mappedReviews,
                        }
                    })
                )

                setStores(storesWithDetails)
                setFilteredStores(storesWithDetails)
            } catch (err: any) {
                console.error('Erro ao carregar lojas:', err)
                setError(err.message || 'Erro ao carregar lojas')
                toast.error('Erro ao carregar lojas')
            } finally {
                setLoading(false)
            }
        }

        loadStores()
    }, [initialStores])

    // Ordenar: abertos primeiro, depois fechados
    useEffect(() => {
        const sorted = [...stores].sort((a, b) => {
            const aOpen = isStoreOpenNow(a.business_hours)
            const bOpen = isStoreOpenNow(b.business_hours)

            if (aOpen && !bOpen) return -1
            if (!aOpen && bOpen) return 1

            const aRating = a.ratings_avg || 0
            const bRating = b.ratings_avg || 0
            return bRating - aRating
        })

        if (maxItems && sorted.length > maxItems) {
            setFilteredStores(sorted.slice(0, maxItems))
        } else {
            setFilteredStores(sorted)
        }
    }, [stores, maxItems])

    // Verificar scroll
    const checkScroll = useCallback(() => {
        const container = scrollContainerRef.current
        if (!container) return

        setCanScrollLeft(container.scrollLeft > 10)
        setCanScrollRight(
            container.scrollLeft < container.scrollWidth - container.clientWidth - 10
        )
    }, [])

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return

        checkScroll()
        container.addEventListener('scroll', checkScroll)
        window.addEventListener('resize', checkScroll)

        return () => {
            container.removeEventListener('scroll', checkScroll)
            window.removeEventListener('resize', checkScroll)
        }
    }, [checkScroll])

    const scroll = (direction: 'left' | 'right') => {
        const container = scrollContainerRef.current
        if (!container) return

        const scrollAmount = container.clientWidth * 0.8
        const target = direction === 'left'
            ? container.scrollLeft - scrollAmount
            : container.scrollLeft + scrollAmount

        container.scrollTo({
            left: target,
            behavior: 'smooth',
        })
    }

    // Drag handlers
    const handleDragStart = (clientX: number) => {
        setIsDragging(true)
        setDragStartX(clientX)
        setDragOffset(0)
        dragDistance.current = 0
    }

    const handleDragMove = (clientX: number) => {
        if (isDragging) {
            const offset = clientX - dragStartX
            setDragOffset(offset)
            dragDistance.current = Math.abs(offset)
        }
    }

    const handleDragEnd = () => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragDistance.current > 50) {
            if (dragOffset > 0) scroll('left')
            else scroll('right')
        }
        setDragOffset(0)
    }

    const handleStoreClick = (storeSlug: string) => {
        if (onStoreClick) {
            onStoreClick(storeSlug)
        } else {
            router.push(`/${storeSlug}`)
        }
    }

    // ========== RENDER SKELETON ==========
    if (loading) {
        return (
            <div className={`w-full ${className}`}>
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-7 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>

                <div className="relative">
                    <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <StoreCardSkeleton key={`skeleton-${i}`} colors={colors} />
                        ))}
                    </div>
                </div>

                <style jsx>{`
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <AlertCircle className="w-12 h-12" style={{ color: colors.accent }} />
                <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                    {error}
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition hover:scale-105"
                    style={{
                        background: colors.accent,
                        color: colors.accentText,
                    }}
                >
                    Tentar novamente
                </button>
            </div>
        )
    }

    if (filteredStores.length === 0) {
        return (
            <div className="py-12 text-center">
                <Store className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: colors.textSecondary }} />
                <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                    Nenhuma loja disponível no momento
                </p>
            </div>
        )
    }

    return (
        <div className={`w-full ${className}`}>
            {/* Título com dragHandle */}
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}
                <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                    {title || 'Lojas em Destaque'}
                </h2>
            </div>

            {/* Lista horizontal com scroll - estilo BannerPago */}
            <div
                className="relative"
                onMouseDown={e => { e.preventDefault(); handleDragStart(e.clientX) }}
                onMouseMove={e => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientX) } }}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={e => handleDragStart(e.touches[0].clientX)}
                onTouchMove={e => { if (isDragging) handleDragMove(e.touches[0].clientX) }}
                onTouchEnd={handleDragEnd}
            >
                {/* Seta esquerda */}
                {canScrollLeft && (
                    <button
                        onClick={() => scroll('left')}
                        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
                        style={{
                            background: `${colors.accent}15`,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}30`,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}

                {/* Container scroll */}
                <div
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto pb-4 scroll-smooth hide-scrollbar"
                    style={{
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        transform: isDragging ? `translateX(${dragOffset / (scrollContainerRef.current?.clientWidth || 1) * 100}px)` : 'none',
                        transition: isDragging ? 'none' : 'transform 0.3s ease',
                        cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                >
                    {filteredStores.map((store) => (
                        <StoreCard
                            key={store.id}
                            store={store}
                            colors={colors}
                            onClick={() => {
                                if (dragDistance.current < 10) handleStoreClick(store.storeSlug)
                            }}
                        />
                    ))}
                </div>

                {/* Seta direita */}
                {canScrollRight && (
                    <button
                        onClick={() => scroll('right')}
                        className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
                        style={{
                            background: `${colors.accent}15`,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}30`,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        <ChevronLeft className="w-4 h-4 rotate-180" />
                    </button>
                )}
            </div>

            <style jsx>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
        </div>
    )
}

export default StoreList