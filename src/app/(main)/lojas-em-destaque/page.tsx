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
    ShoppingCart,
    Coffee,
    AlertCircle,
    Megaphone,
    Search,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { RatingStars } from '@/components/ratings/RatingStars'
import {
    isStoreOpenNow,
    getStoreStatusText,
    type BusinessHours
} from '@/lib/storeHours'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import { resolveCategoria } from '@/lib/categorias'
import { StoreCard, StoreCardSkeleton, type StoreCardData } from '@/components/StoreCard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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
            filtered = filtered.filter(s => {
                const resolved = resolveCategoria(s.category)
                const key = resolved?.slug || s.category
                return key === selectedCategory
            })
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
    // stores.category vem ora como slug ("servicos"), ora como nome de
    // exibição ("Serviços") — dedupa pela Categoria resolvida (canônica),
    // não pelo texto bruto, senão a mesma categoria vira dois chips.
    const categories = useMemo(() => {
        const byKey = new Map<string, { slug: string; name: string; color: string }>()
        for (const store of allStores) {
            if (!store.category) continue
            const resolved = resolveCategoria(store.category)
            const key = resolved?.slug || store.category
            if (!byKey.has(key)) {
                byKey.set(key, {
                    slug: key,
                    name: resolved?.nome || store.category,
                    color: resolved?.color || '#f97316',
                })
            }
        }
        return Array.from(byKey.values())
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
                                className={`px-3.5 py-2 rounded-full text-xs font-black transition-all ${!selectedCategory ? 'shadow-md' : 'hover:opacity-70'
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
                                    className={`px-3.5 py-2 rounded-full text-xs font-black transition-all ${selectedCategory === cat.slug ? 'shadow-md' : 'hover:opacity-70'
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
                                        {displayedStores.map((store, index) => (
                                            <div key={`${store.id}-${index}`} className="animate-fadeIn h-full">
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
                                                <Spinner size={32} color={colors.accent} />
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