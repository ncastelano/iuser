'use client'

import { useEffect, useState, useCallback, useRef, ReactNode, useMemo } from 'react'
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
    ChevronRight as ChevronRightIcon,
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

// ========== HOOK PARA BREAKPOINT ==========
function useBreakpoint() {
    const [itemsPerPage, setItemsPerPage] = useState(1)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1200) {
                setItemsPerPage(4)
            } else if (width >= 800) {
                setItemsPerPage(3)
            } else if (width >= 400) {
                setItemsPerPage(2)
            } else {
                setItemsPerPage(1)
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return itemsPerPage
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
            className="group w-full rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
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
        <div className="w-full rounded-2xl overflow-hidden border animate-pulse"
            style={{
                borderColor: colors.border,
                background: colors.surface,
            }}
        >
            <div className="relative w-full h-40 overflow-hidden"
                style={{ background: colors.accentLight }}
            >
                <div className="w-full h-full" style={{ background: `${colors.border}60` }} />
                <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full w-20 h-6"
                    style={{ background: `${colors.border}80` }}
                />
            </div>

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
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)
    const isMountedRef = useRef(true)
    const abortControllerRef = useRef<AbortController | null>(null)

    const [stores, setStores] = useState<StoreCardData[]>(initialStores || [])
    const [filteredStores, setFilteredStores] = useState<StoreCardData[]>(initialStores || [])
    const [loading, setLoading] = useState(!initialStores)
    const [error, setError] = useState<string | null>(null)

    const itemsPerPage = useBreakpoint()
    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    // Função para carregar lojas com controle de abort
    const loadStores = useCallback(async () => {
        // Cancela requisição anterior se existir
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        setLoading(true)
        setError(null)

        try {
            // Buscar lojas com timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout na requisição')), 15000)
            })

            const storesPromise = supabase
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
                .limit(50) // Limitar para evitar sobrecarga

            const { data: storesData, error: storesError } = await Promise.race([
                storesPromise,
                timeoutPromise.then(() => { throw new Error('Timeout') })
            ]) as any

            if (abortController.signal.aborted) return

            if (storesError) throw storesError

            if (!storesData || storesData.length === 0) {
                if (isMountedRef.current) {
                    setStores([])
                    setFilteredStores([])
                    setLoading(false)
                }
                return
            }

            // Buscar produtos e reviews em paralelo com limite
            const storesWithDetails = await Promise.all(
                storesData.map(async (store: any) => {
                    if (abortController.signal.aborted) return null

                    try {
                        // Buscar produtos em paralelo
                        const [productsResult, reviewsResult] = await Promise.all([
                            supabase
                                .from('products')
                                .select('id, name, image_url, price')
                                .eq('store_id', store.id)
                                .order('created_at', { ascending: false })
                                .limit(2),
                            supabase
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
                        ])

                        if (abortController.signal.aborted) return null

                        const mappedReviews = (reviewsResult.data || []).map((review: any) => ({
                            ...review,
                            profile_name: review.is_anonymous
                                ? 'Anônimo'
                                : review.profiles?.[0]?.name || 'Usuário',
                        }))

                        const mappedProducts = (productsResult.data || []).map((p: any) => ({
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
                    } catch (err) {
                        console.error(`Erro ao carregar detalhes da loja ${store.id}:`, err)
                        // Retorna a loja sem os detalhes em caso de erro
                        return {
                            ...store,
                            top_products: [],
                            recent_reviews: [],
                        }
                    }
                })
            )

            if (abortController.signal.aborted) return

            const validStores = storesWithDetails.filter((store): store is StoreCardData => store !== null)

            if (isMountedRef.current) {
                setStores(validStores)
                setFilteredStores(validStores)
                setLoading(false)
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'Aborted') {
                console.log('Requisição cancelada')
                return
            }

            console.error('Erro ao carregar lojas:', err)
            if (isMountedRef.current) {
                setError(err.message || 'Erro ao carregar lojas')
                toast.error('Erro ao carregar lojas')
                setLoading(false)
            }
        }
    }, [])

    // Carregar lojas se não foram passadas como prop
    useEffect(() => {
        isMountedRef.current = true

        if (initialStores) {
            setStores(initialStores)
            setFilteredStores(initialStores)
            setLoading(false)
            return
        }

        loadStores()

        return () => {
            isMountedRef.current = false
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current)
            }
        }
    }, [initialStores, loadStores])

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

    // Paginação
    const total = filteredStores.length
    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

    const goToNext = useCallback(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    useEffect(() => {
        setCurrentPage(0)
    }, [itemsPerPage])

    // Auto-play de 5 segundos
    useEffect(() => {
        if (isHovered || totalPages <= 1) return

        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, goToNext, totalPages])

    // ========== ITEMS COM LOOP INFINITO ==========
    const currentItems = useMemo(() => {
        if (total === 0) return []

        const start = currentPage * itemsPerPage
        const items: StoreCardData[] = []

        for (let i = 0; i < itemsPerPage; i++) {
            const index = (start + i) % total
            items.push(filteredStores[index])
        }

        return items
    }, [filteredStores, currentPage, itemsPerPage, total])

    // Define o grid baseado no itemsPerPage
    const gridCols = itemsPerPage >= 4 ? 'grid-cols-4'
        : itemsPerPage >= 3 ? 'grid-cols-3'
            : itemsPerPage >= 2 ? 'grid-cols-2'
                : 'grid-cols-1'

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

                <div className={`grid ${gridCols} gap-4`}>
                    {Array.from({ length: itemsPerPage }).map((_, i) => (
                        <StoreCardSkeleton key={`skeleton-${i}`} colors={colors} />
                    ))}
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: `${colors.border}60` }} />
                        <div className="flex gap-2">
                            <div className="h-1.5 w-6 rounded-full animate-pulse" style={{ background: colors.accent }} />
                            <div className="h-1.5 w-2 rounded-full animate-pulse" style={{ background: `${colors.border}60` }} />
                        </div>
                        <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: `${colors.border}60` }} />
                    </div>
                )}
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
                    onClick={() => {
                        setError(null)
                        setLoading(true)
                        loadStores()
                    }}
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
        <div
            className={`w-full ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Título com dragHandle */}
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}
                <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                    {title || 'Lojas em Destaque'}
                </h2>
            </div>

            {/* Grid com paginação */}
            <div className="relative">
                <div className={`grid ${gridCols} gap-4`}>
                    {currentItems.map((store, index) => (
                        <StoreCard
                            key={`${store.id}-${index}`}
                            store={store}
                            colors={colors}
                            onClick={() => handleStoreClick(store.storeSlug)}
                        />
                    ))}
                </div>

                {/* Paginação melhorada - sem pontos esticados */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                            onClick={goToPrev}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{ background: colors.accent, color: colors.accentText }}
                            aria-label="Anterior"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <div className="flex items-center gap-2">
                            {Array.from({ length: totalPages }).map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentPage(idx)}
                                    className="rounded-full transition-all duration-300"
                                    style={{
                                        width: idx === currentPage ? '1.2rem' : '0.5rem',
                                        height: '0.5rem',
                                        background: idx === currentPage ? colors.accent : colors.border,
                                        boxShadow: idx === currentPage ? `0 0 8px ${colors.accent}50` : 'none',
                                    }}
                                    aria-label={`Ir para página ${idx + 1}`}
                                />
                            ))}
                        </div>

                        <span className="text-xs font-medium px-2" style={{ color: colors.textSecondary }}>
                            {currentPage + 1}/{totalPages}
                        </span>

                        <button
                            onClick={goToNext}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{ background: colors.accent, color: colors.accentText }}
                            aria-label="Próximo"
                        >
                            <ChevronRightIcon size={16} />
                        </button>
                    </div>
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