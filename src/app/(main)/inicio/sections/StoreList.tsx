'use client'

import { useEffect, useState, useCallback, useRef, ReactNode, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import {
    Store,
    MapPin,
    Clock,
    Star,
    ChevronRight,
    TrendingUp,
    Eye,
    ShoppingCart,
    Coffee,
    AlertCircle,
    ChevronLeft,
    ChevronRight as ChevronRightIcon,
    Megaphone,
    ArrowRight,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { resolveCategoria } from '@/lib/categorias'
import { RatingStars } from '@/components/ratings/RatingStars'
import {
    isStoreOpenNow,
    getStoreStatusText,
    type BusinessHours
} from '@/lib/storeHours'
import { toast } from 'sonner'
import { StoreCard, StoreCardSkeleton, type StoreCardData } from '@/components/StoreCard'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ========== TIPOS ==========
export type { StoreCardData }

type StoreListProps = {
    onStoreClick?: (storeSlug: string) => void
    maxItems?: number
    className?: string
    title?: string
    // Frase abaixo do título
    subtitle?: string
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

// ========== COMPONENTE PRINCIPAL ==========
export function StoreList({
    onStoreClick,
    maxItems = 8,
    className = '',
    title = 'As Lojas Mais Visitadas',
    subtitle,
    dragHandle,
}: StoreListProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const isMountedRef = useRef(true)
    const abortControllerRef = useRef<AbortController | null>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const [stores, setStores] = useState<StoreCardData[]>([])
    const [filteredStores, setFilteredStores] = useState<StoreCardData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    // Total de lojas (a lista só carrega as mais visitadas) — vai no badge do "ver lojas"
    const [totalStores, setTotalStores] = useState(0)

    useEffect(() => {
        supabase
            .from('stores')
            .select('id', { count: 'exact', head: true })
            .then(({ count }) => setTotalStores(count || 0))
    }, [])

    const itemsPerPage = useBreakpoint()
    const totalPages = Math.max(1, Math.ceil(filteredStores.length / itemsPerPage))

    // ===== VERIFICA SE HÁ PRODUTOS =====
    const hasAnyProduct = useMemo(() => {
        return filteredStores.some(store =>
            store.top_products && store.top_products.length > 0
        )
    }, [filteredStores])

    // ===== FUNÇÃO PARA CONVERTER business_hours =====
    const convertBusinessHours = (data: any): BusinessHours | null => {
        if (!data) return null

        if (data.weekly) {
            return data as BusinessHours
        }

        const weekly: any = {}
        const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
        DAY_KEYS.forEach(day => {
            if (data[day]) {
                weekly[day] = data[day]
            }
        })

        return {
            weekly
        }
    }

    // ===== CARREGAR LOJAS =====
    const loadStores = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        setLoading(true)
        setError(null)

        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout na requisição')), 15000)
            })

            // ✅ CORRIGIDO: Removeu nullsLast
            const storesPromise = supabase
                .from('stores')
                .select(`
                    id,
                    name,
                    storeSlug,
                    description,
                    address,
                    logo_url,
                    category,
                    ratings_avg,
                    ratings_count,
                    owner_id,
                    business_hours,
                    view_count
                `)
                .order('view_count', { ascending: false })  // ✅ Ordena por mais visitados
                .limit(50)

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

            const storesWithDetails = await Promise.all(
                storesData.map(async (store: any) => {
                    if (abortController.signal.aborted) return null

                    try {
                        const [productsResult, reviewsResult] = await Promise.all([
                            supabase
                                .from('products')
                                .select('id, name, image_url, price, listing_type')
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
                            listing_type: p.listing_type || 'sale',
                        }))

                        return {
                            ...store,
                            logo_url: store.logo_url
                                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                                : null,
                            business_hours: convertBusinessHours(store.business_hours),
                            top_products: mappedProducts,
                            recent_reviews: mappedReviews,
                        }
                    } catch (err) {
                        console.error(`Erro ao carregar detalhes da loja ${store.id}:`, err)
                        return {
                            ...store,
                            business_hours: convertBusinessHours(store.business_hours),
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

    useEffect(() => {
        isMountedRef.current = true
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
    }, [loadStores])

    // ===== FILTRAR E ORDENAR - MANTÉM A ORDEM POR VISUALIZAÇÕES =====
    useEffect(() => {
        // Mantém a ordem original (já ordenada por view_count no banco)
        // Mas ainda aplica o filtro de lojas abertas primeiro como prioridade secundária
        const sorted = [...stores].sort((a, b) => {
            // Primeiro critério: lojas abertas primeiro
            const aOpen = isStoreOpenNow(a.business_hours)
            const bOpen = isStoreOpenNow(b.business_hours)

            if (aOpen && !bOpen) return -1
            if (!aOpen && bOpen) return 1

            // Segundo critério: view_count (mais visitados primeiro)
            const aViews = a.view_count || 0
            const bViews = b.view_count || 0
            return bViews - aViews
        })

        if (maxItems && sorted.length > maxItems) {
            setFilteredStores(sorted.slice(0, maxItems))
        } else {
            setFilteredStores(sorted)
        }
    }, [stores, maxItems])

    // ===== AUTOPLAY =====
    useEffect(() => {
        if (isHovered || isAutoPlayPaused || totalPages <= 1) {
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current)
                autoPlayRef.current = null
            }
            return
        }

        autoPlayRef.current = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % totalPages)
        }, 15000)

        return () => {
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current)
                autoPlayRef.current = null
            }
        }
    }, [isHovered, isAutoPlayPaused, totalPages])

    const goToNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % totalPages)
        setIsAutoPlayPaused(true)
        setTimeout(() => setIsAutoPlayPaused(false), 3000)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + totalPages) % totalPages)
        setIsAutoPlayPaused(true)
        setTimeout(() => setIsAutoPlayPaused(false), 3000)
    }, [totalPages])

    const goToPage = useCallback((page: number) => {
        setCurrentIndex(page)
        setIsAutoPlayPaused(true)
        setTimeout(() => setIsAutoPlayPaused(false), 3000)
    }, [])

    const currentItems = useMemo(() => {
        if (filteredStores.length === 0) return []

        const start = currentIndex * itemsPerPage
        const items: StoreCardData[] = []

        for (let i = 0; i < itemsPerPage; i++) {
            const index = (start + i) % filteredStores.length
            items.push(filteredStores[index])
        }

        return items
    }, [filteredStores, currentIndex, itemsPerPage])

    const handleStoreClick = (storeSlug: string) => {
        if (onStoreClick) {
            onStoreClick(storeSlug)
        } else {
            startNavProgress()
            router.push(`/${storeSlug}`)
        }
    }

    const gridCols = itemsPerPage >= 4 ? 'grid-cols-4'
        : itemsPerPage >= 3 ? 'grid-cols-3'
            : itemsPerPage >= 2 ? 'grid-cols-2'
                : 'grid-cols-1'

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
                            <div className="h-1.5 w-6 rounded-full animate-pulse" style={{ background: '#f97316' }} />
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
                <AlertCircle className="w-12 h-12" style={{ color: '#f97316' }} />
                <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
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
                        background: GRADIENT,
                        color: '#ffffff',
                        boxShadow: `0 4px 12px #f9731640`,
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
                <Store className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: colors.textPrimary }} />
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
            <HomeSectionHeader
                title={title}
                subtitle={subtitle}
                dragHandle={dragHandle}
                action={hasAnyProduct ? (
                    <ViewServicesButton
                        label="ver lojas"
                        count={totalStores || filteredStores.length}
                        onClick={() => { startNavProgress(); router.push('/lojas') }}
                    />
                ) : <span />}
            />

            {/* Grid com altura fixa */}
            <div className="relative">
                <div
                    className={`grid ${gridCols} gap-4 items-stretch transition-all duration-500 ease-in-out`}
                >
                    {currentItems.map((store, index) => (
                        <div key={`${store.id}-${index}`} className="animate-fadeIn h-full">
                            <StoreCard
                                store={store}
                                colors={colors}
                                onClick={() => handleStoreClick(store.storeSlug)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: GRADIENT, color: '#ffffff' }}
                        aria-label="Anterior"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => goToPage(idx)}
                                className="rounded-full transition-all duration-300"
                                style={{
                                    width: idx === currentIndex ? '1.2rem' : '0.5rem',
                                    height: '0.5rem',
                                    background: idx === currentIndex ? '#f97316' : colors.border,
                                    boxShadow: idx === currentIndex ? `0 0 8px #f9731650` : 'none',
                                }}
                                aria-label={`Ir para página ${idx + 1}`}
                            />
                        ))}
                    </div>

                    <span className="text-xs font-medium px-2" style={{ color: colors.textPrimary }}>
                        {currentIndex + 1}/{totalPages}
                    </span>

                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: GRADIENT, color: '#ffffff' }}
                        aria-label="Próximo"
                    >
                        <ChevronRightIcon size={16} />
                    </button>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    )
}

export default StoreList