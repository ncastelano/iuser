// app/(main)/lojas-em-destaque/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
    Megaphone,
    Search,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { RatingStars } from '@/components/ratings/RatingStars'
import {
    isStoreOpenNow,
    getStoreStatusText,
    type BusinessHours
} from '@/lib/storeHours'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import { categoriasMap } from '@/lib/categorias'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ========== TIPOS ==========
type StoreCardData = {
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
    category?: string | null
    whatsapp?: string | null
    top_products?: {
        id: string
        name: string
        image_url?: string | null
        price: number
        listing_type?: 'sale' | 'publication' | null
    }[]
    recent_reviews?: {
        id: string
        rating: number
        comment?: string
        profile_name?: string
    }[]
    profiles?: {
        profileSlug: string
    } | null
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

    const hasProducts = store.top_products && store.top_products.length > 0
    const hasReviews = store.recent_reviews && store.recent_reviews.length > 0
    const hasRating = store.ratings_count && store.ratings_count > 0
    const hasAddress = store.address && store.address.trim().length > 0

    const isProductPublication = (product: any) => {
        return product.listing_type === 'publication'
    }

    const categoryInfo = store.category ? categoriasMap[store.category] : null
    const categoryColor = categoryInfo?.color || '#f97316'
    const categoryName = categoryInfo?.nome || store.category || 'Categoria'

    return (
        <div
            onClick={onClick}
            className="group w-full rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer flex flex-col h-[420px]"
            style={{
                background: colors.surface,
                borderColor: colors.border,
            }}
        >
            <div
                className="relative w-full h-48 overflow-hidden flex-shrink-0"
                style={{ background: GRADIENT }}
            >
                {store.logo_url ? (
                    <img
                        src={store.logo_url}
                        alt={store.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/10">
                        <Store className="w-16 h-16 opacity-50" style={{ color: '#ffffff' }} />
                    </div>
                )}

                <div
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-lg flex items-center gap-1.5"
                    style={{
                        background: isOpen ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
                        color: '#fff',
                    }}
                >
                    <div
                        className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOpen ? 'bg-white' : 'bg-white/60'}`}
                    />
                    {isOpen ? 'Aberto' : 'Fechado'}
                </div>

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

                {store.category && (
                    <div className="absolute bottom-3 right-3">
                        <span
                            className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider backdrop-blur-sm"
                            style={{
                                background: `${categoryColor}dd`,
                                color: '#fff',
                                boxShadow: `0 2px 8px ${categoryColor}40`,
                            }}
                        >
                            {categoryName}
                        </span>
                    </div>
                )}
            </div>

            <div className="p-4 space-y-2 flex-1 flex flex-col min-h-[180px] overflow-hidden">
                <div className="flex items-start justify-between gap-2 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                            {store.name}
                        </h3>
                        {hasAddress && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: colors.textSecondary }}>
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{addressShort}</span>
                            </div>
                        )}
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: colors.textSecondary }} />
                </div>

                <div className="flex-shrink-0">
                    {hasRating ? (
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
                </div>

                <div className="flex-shrink-0">
                    <StoreStatus businessHours={store.business_hours} />
                </div>

                <div className="flex-1 min-h-0">
                    {hasProducts && (
                        <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                            <p className="text-[9px] font-black uppercase tracking-wider mb-1.5 opacity-60" style={{ color: colors.textSecondary }}>
                                <TrendingUp className="inline w-3 h-3 mr-1" style={{ color: '#f97316' }} />
                                Destaques
                            </p>
                            <div className="flex gap-1.5">
                                {store.top_products!.slice(0, 2).map((product) => {
                                    const isPublication = isProductPublication(product)
                                    return (
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
                                            {!isPublication ? (
                                                <span className="text-[8px] font-bold flex-shrink-0" style={{ color: '#f97316' }}>
                                                    R$ {product.price.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-[8px] font-bold flex-shrink-0 flex items-center gap-0.5" style={{ color: '#8b5cf6' }}>
                                                    <Megaphone className="w-2.5 h-2.5" />
                                                    <span>PUB</span>
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 min-h-[40px]">
                    {hasReviews && (
                        <div className="pt-2 border-t" style={{ borderColor: colors.border }}>
                            {store.recent_reviews!.slice(0, 1).map((review) => (
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
        </div>
    )
}

// ========== SKELETON CARD ==========
function StoreCardSkeleton({ colors }: { colors: any }) {
    return (
        <div className="w-full rounded-2xl overflow-hidden border flex flex-col h-[420px]"
            style={{
                borderColor: colors.border,
                background: colors.surface,
            }}
        >
            <div className="relative w-full h-48 overflow-hidden flex-shrink-0" style={{ background: `${colors.border}50` }}>
                <div className="w-full h-full" style={{ background: `${colors.border}30` }} />
            </div>

            <div className="p-4 space-y-3 flex-1 flex flex-col min-h-[180px] overflow-hidden">
                <div className="flex items-start justify-between flex-shrink-0">
                    <div className="flex-1">
                        <div className="h-5 rounded w-3/4" style={{ background: `${colors.border}40` }} />
                        <div className="h-3 rounded w-1/2 mt-1.5" style={{ background: `${colors.border}30` }} />
                    </div>
                    <div className="w-4 h-4 rounded" style={{ background: `${colors.border}30` }} />
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                        <div className="h-3 rounded w-16" style={{ background: `${colors.border}30` }} />
                        <div className="h-2 rounded w-6" style={{ background: `${colors.border}25` }} />
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-3 h-3 rounded-full" style={{ background: `${colors.border}30` }} />
                    <div className="h-3 rounded w-20" style={{ background: `${colors.border}30` }} />
                </div>

                <div className="flex-1 min-h-0 pt-2 border-t" style={{ borderColor: colors.border }}>
                    <div className="h-3 rounded w-16 mb-1.5" style={{ background: `${colors.border}30` }} />
                    <div className="flex gap-1.5">
                        <div className="flex-1 h-8 rounded-lg" style={{ background: `${colors.border}25` }} />
                        <div className="flex-1 h-8 rounded-lg" style={{ background: `${colors.border}25` }} />
                    </div>
                </div>

                <div className="flex-shrink-0 min-h-[40px] pt-2 border-t" style={{ borderColor: colors.border }}>
                    <div className="flex items-start gap-1.5">
                        <div className="w-3 h-3 rounded-full mt-0.5" style={{ background: `${colors.border}30` }} />
                        <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                                <div className="h-2 rounded w-12" style={{ background: `${colors.border}30` }} />
                                <div className="h-2 rounded w-10" style={{ background: `${colors.border}25` }} />
                            </div>
                            <div className="h-2 rounded w-3/4 mt-1" style={{ background: `${colors.border}25` }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ========== PÁGINA PRINCIPAL COM SCROLL INFINITO ==========
export default function AllStoreList() {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    // Observador de scroll
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement>(null)

    const [allStores, setAllStores] = useState<StoreCardData[]>([])
    const [displayedStores, setDisplayedStores] = useState<StoreCardData[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(true)
    const [page, setPage] = useState(0)

    const ITEMS_PER_LOAD = 12

    // ===== CARREGAR LOJAS =====
    const loadStores = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            // ✅ CORRIGIDO: Ordena por view_count (mais visitados primeiro)
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
                    view_count,
                    category,
                    whatsapp
                `)
                .eq('is_active', true)
                .order('view_count', { ascending: false })  // ✅ Mais visitados primeiro
                .limit(200)

            if (storesError) throw storesError

            if (!storesData || storesData.length === 0) {
                setAllStores([])
                setDisplayedStores([])
                setHasMore(false)
                setLoading(false)
                return
            }

            // Busca profileSlug dos donos
            const ownerIds = [...new Set(storesData.map(s => s.owner_id).filter(Boolean))]
            let profilesMap: Record<string, string> = {}
            if (ownerIds.length) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, "profileSlug"')
                    .in('id', ownerIds)

                if (profilesData) {
                    profilesMap = Object.fromEntries(profilesData.map(p => [p.id, p.profileSlug]))
                }
            }

            // Busca produtos e reviews para cada loja
            const storesWithDetails = await Promise.all(
                storesData.map(async (store: any) => {
                    try {
                        const [productsResult, reviewsResult] = await Promise.all([
                            supabase
                                .from('products')
                                .select('id, name, image_url, price, listing_type')
                                .eq('store_id', store.id)
                                .eq('is_active', true)
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
                            top_products: mappedProducts,
                            recent_reviews: mappedReviews,
                            profiles: { profileSlug: profilesMap[store.owner_id] || null },
                        }
                    } catch (err) {
                        console.error(`Erro ao carregar detalhes da loja ${store.id}:`, err)
                        return {
                            ...store,
                            logo_url: store.logo_url
                                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                                : null,
                            top_products: [],
                            recent_reviews: [],
                            profiles: { profileSlug: profilesMap[store.owner_id] || null },
                        }
                    }
                })
            )

            // ✅ GARANTE QUE A ORDENAÇÃO POR VIEW_COUNT SEJA MANTIDA
            const sortedStores = storesWithDetails.sort((a, b) => {
                const aViews = a.view_count || 0
                const bViews = b.view_count || 0
                return bViews - aViews
            })

            setAllStores(sortedStores)
            setDisplayedStores(sortedStores.slice(0, ITEMS_PER_LOAD))
            setHasMore(sortedStores.length > ITEMS_PER_LOAD)
            setPage(1)
        } catch (err: any) {
            console.error('Erro ao carregar lojas:', err)
            setError(err.message || 'Erro ao carregar lojas')
            toast.error('Erro ao carregar lojas')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStores()
    }, [loadStores])

    // ===== FILTROS =====
    const filteredStores = useMemo(() => {
        let filtered = [...allStores]

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(
                s =>
                    s.name.toLowerCase().includes(q) ||
                    (s.description && s.description.toLowerCase().includes(q)) ||
                    (s.address && s.address.toLowerCase().includes(q))
            )
        }

        if (selectedCategory) {
            filtered = filtered.filter(s => s.category === selectedCategory)
        }

        // ✅ ORDENAÇÃO FINAL: Lojas abertas primeiro, depois por view_count (maior para menor)
        filtered.sort((a, b) => {
            const aOpen = isStoreOpenNow(a.business_hours)
            const bOpen = isStoreOpenNow(b.business_hours)
            if (aOpen && !bOpen) return -1
            if (!aOpen && bOpen) return 1
            const aViews = a.view_count || 0
            const bViews = b.view_count || 0
            return bViews - aViews
        })

        return filtered
    }, [allStores, searchQuery, selectedCategory])

    // ===== RESETAR DISPLAY QUANDO FILTRO MUDA =====
    useEffect(() => {
        setDisplayedStores(filteredStores.slice(0, ITEMS_PER_LOAD))
        setHasMore(filteredStores.length > ITEMS_PER_LOAD)
        setPage(1)
    }, [filteredStores])

    // ===== CARREGAR MAIS =====
    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore) return

        const nextPage = page + 1
        const start = nextPage * ITEMS_PER_LOAD
        const end = start + ITEMS_PER_LOAD
        const newItems = filteredStores.slice(start, end)

        if (newItems.length === 0) {
            setHasMore(false)
            return
        }

        setLoadingMore(true)
        setTimeout(() => {
            setDisplayedStores(prev => [...prev, ...newItems])
            setPage(nextPage)
            setHasMore(end < filteredStores.length)
            setLoadingMore(false)
        }, 300)
    }, [loadingMore, hasMore, page, filteredStores])

    // ===== OBSERVADOR DE SCROLL INFINITO =====
    useEffect(() => {
        if (loading) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore) {
                    loadMore()
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        )

        observerRef.current = observer

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current)
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [loading, hasMore, loadingMore, loadMore])

    // ===== HANDLE STORE CLICK =====
    const handleStoreClick = (storeSlug: string) => {
        router.push(`/${storeSlug}`)
    }

    // ===== CATEGORIAS PARA FILTRO =====
    const categories = useMemo(() => {
        const uniqueCategories = new Set(allStores.map(s => s.category).filter(Boolean))
        return Array.from(uniqueCategories).map(cat => ({
            slug: cat as string,
            name: categoriasMap[cat as string]?.nome || cat as string,
            color: categoriasMap[cat as string]?.color || '#f97316',
        }))
    }, [allStores])

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Todas as Lojas"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder="Buscar lojas..."
                    onSearch={setSearchQuery}
                />

                <section className="px-4 md:px-6 mt-2 pb-24">
                    {/* FILTROS POR CATEGORIA */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${!selectedCategory ? 'shadow-md' : 'hover:opacity-70'
                                    }`}
                                style={{
                                    background: !selectedCategory ? GRADIENT : `${colors.surface}66`,
                                    color: !selectedCategory ? '#ffffff' : colors.textSecondary,
                                    border: `1px solid ${!selectedCategory ? 'transparent' : colors.border}`,
                                }}
                            >
                                Todas
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat.slug}
                                    onClick={() => setSelectedCategory(cat.slug)}
                                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${selectedCategory === cat.slug ? 'shadow-md' : 'hover:opacity-70'
                                        }`}
                                    style={{
                                        background: selectedCategory === cat.slug ? cat.color : `${colors.surface}66`,
                                        color: selectedCategory === cat.slug ? '#ffffff' : colors.textSecondary,
                                        border: `1px solid ${selectedCategory === cat.slug ? 'transparent' : colors.border}`,
                                    }}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* LOADING INICIAL */}
                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <StoreCardSkeleton key={`skeleton-${i}`} colors={colors} />
                            ))}
                        </div>
                    )}

                    {/* ERROR */}
                    {error && !loading && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                            style={{
                                background: `${colors.surface}66`,
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                {error}
                            </p>
                            <button
                                onClick={() => {
                                    setError(null)
                                    loadStores()
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-bold"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* LISTA DE LOJAS */}
                    {!loading && !error && (
                        <>
                            {displayedStores.length === 0 ? (
                                <div
                                    className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                                    style={{
                                        background: `${colors.surface}66`,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <Store className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {searchQuery ? 'Nenhuma loja encontrada para esta busca.' : 'Nenhuma loja disponível no momento.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {displayedStores.map((store, index) => (
                                            <div key={`${store.id}-${index}`} className="animate-fadeIn">
                                                <StoreCard
                                                    store={store}
                                                    colors={colors}
                                                    onClick={() => handleStoreClick(store.storeSlug)}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* LOADER DE CARREGAMENTO - SCROLL INFINITO */}
                                    {hasMore && (
                                        <div
                                            ref={loadMoreRef}
                                            className="flex justify-center py-8 mt-4"
                                        >
                                            {loadingMore ? (
                                                <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
                                            ) : (
                                                <div className="h-8" />
                                            )}
                                        </div>
                                    )}

                                    {/* FIM DA LISTA */}
                                    {!hasMore && displayedStores.length > 0 && (
                                        <div className="text-center py-8">
                                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                Você já viu todas as lojas disponíveis 🎉
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </section>
            </main>

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