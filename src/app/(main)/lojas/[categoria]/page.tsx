// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    Megaphone,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import { categoriasMap } from '@/lib/categorias'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { RatingStars } from '@/components/ratings/RatingStars'

// ===== GRADIENTE =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TIPAGEM =====
interface StoreCardData {
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
        listing_type?: 'sale' | 'publication' | null
    }[]
    recent_reviews?: {
        id: string
        rating: number
        comment?: string
        profile_name?: string
    }[]
}

// ===== COMPONENTE DE STATUS =====
function StoreStatus({ businessHours }: { businessHours: BusinessHours | null | undefined }) {
    const [statusText, setStatusText] = useState('')
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const open = isStoreOpenNow(businessHours)
        setIsOpen(open)
        setStatusText(open ? 'Aberto' : 'Fechado')
    }, [businessHours])

    const statusColor = isOpen ? '#10b981' : '#ef4444'

    return (
        <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
            <span className="text-[10px] font-medium truncate" style={{ color: statusColor }}>
                {statusText}
            </span>
        </div>
    )
}

// ===== COMPONENTE CARD =====
function StoreCard({ store, onClick, colors }: { store: StoreCardData; onClick: () => void; colors: any }) {
    const isOpen = isStoreOpenNow(store.business_hours)
    const addressShort = store.address ? store.address.split(',')[0]?.trim() || store.address : ''

    const hasProducts = store.top_products && store.top_products.length > 0
    const hasReviews = store.recent_reviews && store.recent_reviews.length > 0
    const hasRating = store.ratings_count && store.ratings_count > 0
    const hasAddress = store.address && store.address.trim().length > 0

    return (
        <div
            onClick={onClick}
            className="group w-full h-[420px] rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer flex flex-col"
            style={{ background: colors.surface, borderColor: colors.border }}
        >
            <div className="relative w-full h-48 overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                {store.logo_url ? (
                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/10">
                        <Store className="w-16 h-16 opacity-50" style={{ color: '#ffffff' }} />
                    </div>
                )}

                <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-lg flex items-center gap-1.5"
                    style={{ background: isOpen ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)', color: '#fff' }}
                >
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOpen ? 'bg-white' : 'bg-white/60'}`} />
                    {isOpen ? 'Aberto' : 'Fechado'}
                </div>

                {store.view_count && store.view_count > 0 && (
                    <div className="absolute bottom-3 left-3 px-2 py-1 rounded-full text-[9px] font-bold shadow-md flex items-center gap-1"
                        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                    >
                        <Eye className="w-3 h-3" />
                        {store.view_count}
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
                                {store.top_products!.slice(0, 2).map((product) => (
                                    <div key={product.id} className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}` }}
                                    >
                                        {product.image_url ? (
                                            <img src={product.image_url} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                                        ) : (
                                            <ShoppingBag className="w-3 h-3 flex-shrink-0 opacity-40" style={{ color: colors.textSecondary }} />
                                        )}
                                        <span className="text-[9px] font-medium truncate flex-1" style={{ color: colors.textPrimary }}>
                                            {product.name}
                                        </span>
                                        <span className="text-[8px] font-bold flex-shrink-0" style={{ color: '#f97316' }}>
                                            R$ {product.price.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
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

// ===== FUNÇÃO PARA CONVERTER business_hours =====
const convertBusinessHours = (data: any): BusinessHours | null => {
    if (!data) return null
    if (data.weekly) return data as BusinessHours
    const weekly: any = {}
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    DAY_KEYS.forEach(day => {
        if (data[day]) weekly[day] = data[day]
    })
    return { weekly }
}

// ===== COMPONENTE PRINCIPAL =====
export default function ListaCategoriaPage() {
    const params = useParams()
    const router = useRouter()
    const categoriaRaw = params.categoria
    const categoria: string | undefined = Array.isArray(categoriaRaw) ? categoriaRaw[0] : categoriaRaw

    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')
    const [stores, setStores] = useState<StoreCardData[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(0)
    const itemsPerPage = 4

    // ===== CARREGAR LOJAS =====
    const loadStores = useCallback(async () => {
        if (!categoria) return

        setLoadingData(true)
        setError(null)

        try {
            const info = categoriasMap[categoria]
            const categoryName = info?.nome || categoria

            const { data: storesData, error: storesError } = await supabase
                .from('stores')
                .select(`
                    id,
                    name,
                    "storeSlug",
                    description,
                    logo_url,
                    ratings_avg,
                    ratings_count,
                    owner_id,
                    category,
                    address,
                    business_hours,
                    view_count
                `)
                .eq('category', categoryName)
                .eq('is_active', true)
                .order('ratings_avg', { ascending: false })
                .limit(50)

            if (storesError) throw storesError

            let finalStores = storesData || []

            if (finalStores.length === 0) {
                const { data: fallbackData } = await supabase
                    .from('stores')
                    .select(`
                        id,
                        name,
                        "storeSlug",
                        description,
                        logo_url,
                        ratings_avg,
                        ratings_count,
                        owner_id,
                        category,
                        address,
                        business_hours,
                        view_count
                    `)
                    .or(`name.ilike.%${categoryName}%, description.ilike.%${categoryName}%`)
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(50)

                if (fallbackData) finalStores = fallbackData
            }

            const storesWithDetails = await Promise.all(
                finalStores.map(async (store: any) => {
                    try {
                        const [productsResult, reviewsResult] = await Promise.all([
                            supabase.from('products').select('id, name, image_url, price, listing_type').eq('store_id', store.id).order('created_at', { ascending: false }).limit(2),
                            supabase.from('product_reviews').select(`id, rating, comment, is_anonymous, profiles!inner (name)`).eq('store_id', store.id).order('created_at', { ascending: false }).limit(2)
                        ])

                        const mappedReviews = (reviewsResult.data || []).map((review: any) => ({
                            ...review,
                            profile_name: review.is_anonymous ? 'Anônimo' : review.profiles?.[0]?.name || 'Usuário',
                        }))

                        const mappedProducts = (productsResult.data || []).map((p: any) => ({
                            ...p,
                            image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null,
                            listing_type: p.listing_type || 'sale',
                        }))

                        return {
                            id: store.id,
                            name: store.name,
                            storeSlug: store.storeSlug,
                            description: store.description,
                            address: store.address,
                            logo_url: store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : null,
                            ratings_avg: store.ratings_avg,
                            ratings_count: store.ratings_count,
                            owner_id: store.owner_id,
                            business_hours: convertBusinessHours(store.business_hours),
                            view_count: store.view_count || 0,
                            top_products: mappedProducts,
                            recent_reviews: mappedReviews,
                        }
                    } catch {
                        return {
                            id: store.id,
                            name: store.name,
                            storeSlug: store.storeSlug,
                            description: store.description,
                            address: store.address,
                            logo_url: store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : null,
                            ratings_avg: store.ratings_avg,
                            ratings_count: store.ratings_count,
                            owner_id: store.owner_id,
                            business_hours: convertBusinessHours(store.business_hours),
                            view_count: store.view_count || 0,
                            top_products: [],
                            recent_reviews: [],
                        }
                    }
                })
            )

            setStores(storesWithDetails)
        } catch (err) {
            console.error('Erro ao carregar lojas:', err)
            setError('Erro ao carregar lojas')
            setStores([])
        }

        setLoadingData(false)
    }, [categoria])

    useEffect(() => { loadStores() }, [loadStores])

    // ===== FILTRO LOCAL =====
    const filteredStores = useMemo(() => {
        if (!searchQuery.trim()) return stores
        const q = searchQuery.toLowerCase()
        return stores.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q)) ||
            (s.address && s.address.toLowerCase().includes(q))
        )
    }, [stores, searchQuery])

    // ===== PAGINAÇÃO =====
    const totalPages = Math.ceil(filteredStores.length / itemsPerPage)
    const currentItems = useMemo(() => {
        const start = currentPage * itemsPerPage
        return filteredStores.slice(start, start + itemsPerPage)
    }, [filteredStores, currentPage, itemsPerPage])

    const goToPage = (page: number) => setCurrentPage(page)
    const goToPrev = () => setCurrentPage(prev => Math.max(0, prev - 1))
    const goToNext = () => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))

    // ===== HANDLE STORE CLICK - SIMPLIFICADO =====
    const handleStoreClick = useCallback((store: StoreCardData) => {
        // Agora navega diretamente com o storeSlug
        router.push(`/${store.storeSlug}`)
    }, [router])

    // ===== FALLBACK =====
    const info = categoriasMap[categoria as string]
    if (!categoria || !info) {
        return (
            <div className="relative min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                <div className="relative z-10 text-center">
                    <h1 className="text-2xl font-black mb-4" style={{ color: colors.textPrimary }}>
                        Categoria não encontrada
                    </h1>
                    <Link href="/" className="font-bold underline" style={{ color: colors.accent }}>
                        Voltar ao início
                    </Link>
                </div>
            </div>
        )
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title={info.nome}
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder="Filtrar lojas..."
                    onSearch={setSearchQuery}
                />

                <section className="px-4 md:px-6 mt-2 pb-24">
                    {loadingData && (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
                        </div>
                    )}

                    {error && !loadingData && (
                        <div className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                            style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}
                        >
                            <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{error}</p>
                            <button onClick={() => loadStores()}
                                className="px-4 py-2 rounded-xl text-xs font-bold"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {!loadingData && !error && (
                        <>
                            {filteredStores.length === 0 ? (
                                <div className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                                    style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}
                                >
                                    <Store className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {searchQuery ? 'Nenhuma loja encontrada para esta busca.' : 'Nenhuma loja disponível nesta categoria.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                                            Lojas em {info.nome}
                                        </h2>
                                        <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                            {filteredStores.length} loja(s)
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {currentItems.map((store) => (
                                            <StoreCard
                                                key={store.id}
                                                store={store}
                                                colors={colors}
                                                onClick={() => handleStoreClick(store)}
                                            />
                                        ))}
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-4 mt-6">
                                            <button onClick={goToPrev} disabled={currentPage === 0}
                                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                <ChevronLeft size={16} />
                                            </button>

                                            <div className="flex items-center gap-2">
                                                {Array.from({ length: totalPages }).map((_, idx) => (
                                                    <button key={idx} onClick={() => goToPage(idx)}
                                                        className="rounded-full transition-all duration-300"
                                                        style={{
                                                            width: idx === currentPage ? '1.2rem' : '0.5rem',
                                                            height: '0.5rem',
                                                            background: idx === currentPage ? '#f97316' : colors.border,
                                                            boxShadow: idx === currentPage ? '0 0 8px #f9731650' : 'none',
                                                        }}
                                                    />
                                                ))}
                                            </div>

                                            <span className="text-xs font-medium px-2" style={{ color: colors.textSecondary }}>
                                                {currentPage + 1}/{totalPages}
                                            </span>

                                            <button onClick={goToNext} disabled={currentPage === totalPages - 1}
                                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                <ChevronRightIcon size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}