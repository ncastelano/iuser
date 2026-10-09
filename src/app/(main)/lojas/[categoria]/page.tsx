// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'
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
    PlusCircle,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import { categoriasMap } from '@/lib/categorias'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { StoreCard } from '@/components/StoreCard'
import CreatePublicationDialog from '@/components/CreatePublicationDialog'

// ===== GRADIENTE =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Incentivo mostrado só até a 3ª publicação da categoria - da 4ª em diante o
// botão "Nova" já é auto-explicativo, igual em Store.tsx.
const PUBLICATION_INCENTIVE = ['seja a primeira publicação', 'seja a segunda publicação', 'seja a terceira publicação']

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
    whatsapp?: string | null
    show_whatsapp?: boolean | null
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

// ===== PUBLICAÇÃO (das lojas desta categoria) =====
interface CategoryPublication {
    id: string
    name: string
    slug: string
    image_url: string | null
    storeSlug: string
}

// ===== COMPONENTE CARD PARA CRIAR LOJA =====
function CreateStoreCard({ colors, category }: { colors: any; category: string }) {
    const router = useRouter()
    const { userId } = useProfile()

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const handleCreateStore = () => {
        if (userId) {
            router.push('/criar-loja')
        } else {
            router.push(`/login?redirect=/criar-loja&category=${encodeURIComponent(category)}`)
        }
    }

    return (
        <div
            onClick={handleCreateStore}
            className="group w-full h-full min-h-[420px] rounded-3xl overflow-hidden border-2 border-dashed transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer flex flex-col items-center justify-center p-8 text-center"
            style={{
                background: cardBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderColor: colors.border,
                boxShadow: colors.shadow,
            }}
        >
            <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{
                    background: GRADIENT,
                    color: '#ffffff',
                    boxShadow: `0 4px 20px #f9731640`,
                }}
            >
                <PlusCircle size={32} />
            </div>

            <h3 className="text-lg font-bold mb-2" style={{ color: colors.textPrimary }}>
                Cadastrar Loja
            </h3>

            <p className="text-sm mb-4 max-w-xs" style={{ color: colors.textSecondary }}>
                Adicione sua loja aqui também e comece a vender seus produtos!
            </p>

            <div
                className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{
                    background: GRADIENT,
                    color: '#ffffff',
                    boxShadow: `0 4px 14px #f9731660`,
                }}
            >
                <Store size={16} />
                Criar Loja Agora
            </div>

            <p className="text-[10px] mt-3 opacity-50" style={{ color: colors.textSecondary }}>
                Demora apenas alguns minutos 🚀
            </p>
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

// ===== FUNÇÃO HEX TO RGB =====

// ===== COMPONENTE PRINCIPAL =====
export default function ListaCategoriaPage() {
    const params = useParams()
    const router = useRouter()
    const categoriaRaw = params.categoria
    const categoria: string | undefined = Array.isArray(categoriaRaw) ? categoriaRaw[0] : categoriaRaw

    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')
    const [stores, setStores] = useState<StoreCardData[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [publications, setPublications] = useState<CategoryPublication[]>([])
    const [loadingPublications, setLoadingPublications] = useState(false)
    const [currentPage, setCurrentPage] = useState(0)
    const itemsPerPage = 4

    // Identifica a chamada mais recente de loadStores, pra descartar
    // respostas atrasadas de uma categoria anterior (evita flash de dados
    // errados se o usuário trocar de categoria rápido).
    const loadIdRef = useRef(0)

    // ===== CARREGAR LOJAS =====
    const loadStores = useCallback(async () => {
        if (!categoria) return
        const requestId = ++loadIdRef.current

        setLoadingData(true)
        setError(null)
        setPublications([])

        try {
            const info = categoriasMap[categoria]
            const categoryName = info?.nome || categoria
            // stores.category vem às vezes como slug ("saude"), às vezes como
            // nome de exibição ("Saúde e Bem-estar") - dependendo de qual
            // tela criou a loja (mesma inconsistência do badge de
            // categorias na home, ver lib/categorias.ts:resolveCategoria).
            // Comparar só com o nome deixava lojas ativas de verdade
            // invisíveis aqui, mesmo contando no badge.
            const categorySlug = info?.slug || categoria

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
                    view_count,
                    whatsapp,
                    show_whatsapp
                `)
                .in('category', [categoryName, categorySlug])
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
                        view_count,
                        whatsapp,
                        show_whatsapp
                    `)
                    .or(`name.ilike.%${categoryName}%, description.ilike.%${categoryName}%`)
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(50)

                if (fallbackData) finalStores = fallbackData
            }

            if (requestId !== loadIdRef.current) return

            const storeIds = finalStores.map((s: any) => s.id)

            // Publicações das lojas da categoria: dispara em paralelo com os
            // detalhes de cada loja logo abaixo, em vez de esperar eles
            // terminarem primeiro (eram 2 estágios em série antes).
            if (storeIds.length > 0) {
                setLoadingPublications(true)
                const storeSlugById = new Map(finalStores.map((s: any) => [s.id, s.storeSlug]))
                supabase
                    .from('products')
                    .select('id, name, slug, image_url, store_id')
                    .in('store_id', storeIds)
                    .eq('listing_type', 'publication')
                    .order('created_at', { ascending: false })
                    .limit(20)
                    .then(({ data, error: pubError }) => {
                        if (requestId !== loadIdRef.current) return
                        if (pubError) {
                            console.error('Erro ao carregar publicações da categoria:', pubError)
                            setPublications([])
                            setLoadingPublications(false)
                            return
                        }
                        const mapped: CategoryPublication[] = (data || [])
                            .map((p: any) => {
                                const storeSlug = storeSlugById.get(p.store_id)
                                if (!storeSlug) return null
                                return {
                                    id: p.id,
                                    name: p.name,
                                    slug: p.slug,
                                    image_url: p.image_url
                                        ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                                        : null,
                                    storeSlug,
                                }
                            })
                            .filter((p): p is CategoryPublication => p !== null)
                        setPublications(mapped)
                        setLoadingPublications(false)
                    })
            }

            if (storeIds.length === 0) {
                setStores([])
                return
            }

            // Detalhes (top 2 produtos + top 2 avaliações) de todas as lojas
            // em 2 consultas em lote, em vez de 2 consultas por loja (N+1) -
            // antes eram até ~100 requisições pra uma categoria com 50 lojas.
            const [productsResult, reviewsResult] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, image_url, price, listing_type, store_id')
                    .in('store_id', storeIds)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('product_reviews')
                    .select('id, rating, comment, is_anonymous, store_id, profiles!inner (name)')
                    .in('store_id', storeIds)
                    .order('created_at', { ascending: false }),
            ])

            if (requestId !== loadIdRef.current) return

            const productsByStore = new Map<string, any[]>()
            for (const p of productsResult.data || []) {
                const list = productsByStore.get(p.store_id)
                if (!list) productsByStore.set(p.store_id, [p])
                else if (list.length < 2) list.push(p)
            }

            const reviewsByStore = new Map<string, any[]>()
            for (const r of reviewsResult.data || []) {
                const list = reviewsByStore.get(r.store_id)
                if (!list) reviewsByStore.set(r.store_id, [r])
                else if (list.length < 2) list.push(r)
            }

            const storesWithDetails: StoreCardData[] = finalStores.map((store: any) => {
                const mappedProducts = (productsByStore.get(store.id) || []).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null,
                    price: p.price,
                    listing_type: p.listing_type || 'sale',
                }))

                const mappedReviews = (reviewsByStore.get(store.id) || []).map((review: any) => ({
                    id: review.id,
                    rating: review.rating,
                    comment: review.comment,
                    profile_name: review.is_anonymous ? 'Anônimo' : review.profiles?.[0]?.name || 'Usuário',
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
                    whatsapp: store.whatsapp,
                    show_whatsapp: store.show_whatsapp,
                    top_products: mappedProducts,
                    recent_reviews: mappedReviews,
                }
            })

            setStores(storesWithDetails)
        } catch (err) {
            if (requestId !== loadIdRef.current) return
            console.error('Erro ao carregar lojas:', err)
            setError('Erro ao carregar lojas')
            setStores([])
        } finally {
            if (requestId === loadIdRef.current) setLoadingData(false)
        }
    }, [categoria])

    useEffect(() => { loadStores() }, [loadStores])

    // Loja de quem está olhando, dentro desta mesma categoria - dono de
    // loja aqui é quem pode publicar pra ela (botão "Nova" das Publicações).
    const myStoreInCategory = useMemo(() => stores.find((s) => s.owner_id === userId) || null, [stores, userId])
    const [isCreatingPublication, setIsCreatingPublication] = useState(false)

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

    // ===== HANDLE STORE CLICK =====
    const handleStoreClick = useCallback((store: StoreCardData) => {
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
                            <Spinner size={32} color={colors.accent} />
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
                            {/* Publicações das lojas desta categoria - mesmo estilo
                                "stories" usado em Store.tsx, acima do "Lojas em X".
                                Continua aparecendo (com o botão de criar) mesmo com
                                zero publicações quando quem está olhando tem uma
                                loja aqui - senão a seção só existia pra quem via
                                publicação alheia, nunca pra criar a própria. */}
                            {(publications.length > 0 || loadingPublications || myStoreInCategory) && (
                                <div className="mt-4">
                                    <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: colors.textPrimary }}>
                                        Publicações
                                    </h3>

                                    {loadingPublications ? (
                                        <div className="flex justify-center py-4">
                                            <Spinner size={20} color={colors.accent} />
                                        </div>
                                    ) : (
                                        <>
                                            <div className={`flex items-start gap-3 overflow-x-auto pb-1 scrollbar-hide ${publications.length + (myStoreInCategory ? 1 : 0) <= 4 ? 'justify-center' : ''}`}>
                                                {myStoreInCategory && (
                                                    <button
                                                        onClick={() => setIsCreatingPublication(true)}
                                                        className="flex flex-col items-center gap-1 flex-shrink-0 w-20"
                                                    >
                                                        <div
                                                            className="w-20 aspect-[3/5] rounded-2xl border-2 border-dashed flex items-center justify-center transition-all hover:scale-105"
                                                            style={{ borderColor: colors.border }}
                                                        >
                                                            <PlusCircle size={20} style={{ color: '#f97316' }} />
                                                        </div>
                                                        <span className="text-[10px] font-bold truncate w-full text-center" style={{ color: colors.textSecondary }}>
                                                            Nova
                                                        </span>
                                                    </button>
                                                )}

                                                {publications.map((pub) => (
                                                    <button
                                                        key={pub.id}
                                                        onClick={() => router.push(`/${pub.storeSlug}/${pub.slug || pub.id}`)}
                                                        className="flex flex-col items-center gap-1 flex-shrink-0 w-20"
                                                    >
                                                        <div className="w-20 aspect-[3/5] rounded-2xl p-[2px]" style={{ background: GRADIENT }}>
                                                            <div className="w-full h-full rounded-[14px] overflow-hidden bg-white flex items-center justify-center">
                                                                {pub.image_url ? (
                                                                    <img src={pub.image_url} className="w-full h-full object-cover" alt={pub.name} />
                                                                ) : (
                                                                    <Megaphone size={20} style={{ color: '#f97316' }} />
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-medium truncate w-full text-center" style={{ color: colors.textSecondary }}>
                                                            {pub.name}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Incentivo só até a 3ª publicação da categoria - a partir
                                                daí o botão "Nova" acima já fala por si, igual em Store.tsx. */}
                                            {myStoreInCategory && publications.length < 3 && (
                                                <p className="text-[11px] text-center mt-2" style={{ color: colors.textSecondary }}>
                                                    Você tem uma loja em <strong style={{ color: colors.textPrimary }}>{info.nome}</strong> —{' '}
                                                    {PUBLICATION_INCENTIVE[publications.length]} da categoria e apareça pra quem visita ela.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {myStoreInCategory && (
                                <CreatePublicationDialog
                                    open={isCreatingPublication}
                                    onClose={() => setIsCreatingPublication(false)}
                                    storeId={myStoreInCategory.id}
                                    storeWhatsapp={myStoreInCategory.whatsapp}
                                    showWhatsapp={myStoreInCategory.show_whatsapp !== false}
                                    onCreated={loadStores}
                                />
                            )}

                            {filteredStores.length === 0 ? (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                                            Lojas
                                        </h2>
                                        <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                            0 loja(s)
                                        </span>
                                    </div>

                                    {/* Mensagem de nenhuma loja + Botão Criar Loja */}
                                    <div
                                        className="rounded-2xl p-12 flex flex-col items-center gap-6 mt-2"
                                        style={{
                                            background: cardBg,
                                            backdropFilter: 'blur(12px)',
                                            WebkitBackdropFilter: 'blur(12px)',
                                            border: `2px dashed ${colors.border}`,
                                        }}
                                    >
                                        <div
                                            className="w-20 h-20 rounded-full flex items-center justify-center"
                                            style={{
                                                background: GRADIENT,
                                                color: '#ffffff',
                                                boxShadow: `0 4px 20px #f9731640`,
                                            }}
                                        >
                                            <Store size={32} />
                                        </div>

                                        <div className="text-center">
                                            <h3 className="text-xl font-bold mb-2" style={{ color: colors.textPrimary }}>
                                                {stores.length === 0 ? 'Nenhuma loja nesta categoria' : 'Nenhuma loja encontrada'}
                                            </h3>
                                            <p className="text-sm max-w-md" style={{ color: colors.textSecondary }}>
                                                {stores.length === 0 ? (
                                                    <>Seja o primeiro a cadastrar uma loja em <strong style={{ color: colors.textPrimary }}>{info.nome}</strong> e comece a vender seus produtos!</>
                                                ) : (
                                                    <>Nenhuma loja em <strong style={{ color: colors.textPrimary }}>{info.nome}</strong> bate com "{searchQuery}". Que tal adicionar a sua aqui também?</>
                                                )}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => {
                                                if (userId) {
                                                    router.push('/criar-loja')
                                                } else {
                                                    router.push(`/login?redirect=/criar-loja&category=${encodeURIComponent(categoria)}`)
                                                }
                                            }}
                                            className="px-8 py-4 rounded-full font-bold text-sm flex items-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-xl"
                                            style={{
                                                background: GRADIENT,
                                                color: '#ffffff',
                                                boxShadow: `0 4px 20px #f9731660`,
                                            }}
                                        >
                                            <PlusCircle size={20} />
                                            {stores.length === 0 ? 'Cadastrar Loja Agora' : 'Cadastrar Minha Loja'}
                                        </button>

                                        <p className="text-[10px] opacity-50 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                            <span>🚀 Demora apenas alguns minutos</span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                                            Lojas
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

                                        {/* Card "Cadastrar Loja" no final - apenas se tiver menos que 4 itens na página */}
                                        {currentItems.length < 4 && (
                                            <CreateStoreCard colors={colors} category={categoria} />
                                        )}
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