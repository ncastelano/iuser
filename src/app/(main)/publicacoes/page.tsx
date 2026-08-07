// app/(main)/publicacoes-de-lojas/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store,
    Search,
    Grid,
    List,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    Eye,
    Clock,
    Heart,
    Share2,
    Calendar,
    User,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ========== TIPOS ==========
interface PublicationCard {
    id: string
    imageUrl: string | null
    storeName: string
    storeSlug: string
    storeLogoUrl: string | null
    title: string
    description?: string | null
    view_count?: number
    created_at?: string
    price?: number
    listing_type?: string
}

// ========== COMPONENTE CARD - ESTILO BLOG ==========
function PublicationCardComponent({
    pub,
    onClick,
    colors,
}: {
    pub: PublicationCard
    onClick: () => void
    colors: any
}) {
    const formattedDate = pub.created_at
        ? new Date(pub.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
        : ''

    return (
        <div
            onClick={onClick}
            className="group rounded-2xl overflow-hidden border transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 cursor-pointer flex flex-col"
            style={{
                background: colors.surface,
                borderColor: colors.border,
            }}
        >
            {/* Imagem com overlay */}
            <div
                className="relative w-full overflow-hidden flex-shrink-0"
                style={{ aspectRatio: '4/3' }}
            >
                {pub.imageUrl ? (
                    <>
                        <img
                            src={pub.imageUrl}
                            alt={pub.title || pub.storeName}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            loading="lazy"
                        />
                        {/* Overlay gradiente */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center"
                        style={{ background: GRADIENT, opacity: 0.3 }}>
                        <Store className="w-16 h-16 opacity-50" style={{ color: colors.textPrimary }} />
                    </div>
                )}

                {/* Badge de visualizações */}
                {pub.view_count && pub.view_count > 0 && (
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-medium shadow-md flex items-center gap-1.5 backdrop-blur-sm"
                        style={{
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                        }}
                    >
                        <Eye className="w-3 h-3" />
                        {pub.view_count}
                    </div>
                )}

                {/* Data no canto superior */}
                {formattedDate && (
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[8px] font-medium backdrop-blur-sm flex items-center gap-1.5"
                        style={{
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                        }}
                    >
                        <Calendar className="w-3 h-3" />
                        {formattedDate}
                    </div>
                )}
            </div>

            {/* Conteúdo */}
            <div className="p-4 space-y-3 flex-1 flex flex-col">
                {/* Loja */}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border-2"
                        style={{ borderColor: colors.border }}>
                        {pub.storeLogoUrl ? (
                            <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center"
                                style={{ background: colors.border }}>
                                <Store size={14} style={{ color: colors.textSecondary }} />
                            </div>
                        )}
                    </div>
                    <span className="text-xs font-medium truncate" style={{ color: colors.textSecondary }}>
                        {pub.storeName}
                    </span>
                </div>

                {/* Título */}
                <h3 className="text-base font-bold leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>
                    {pub.title || 'Sem título'}
                </h3>

                {/* Descrição */}
                {pub.description && (
                    <p className="text-xs line-clamp-2 flex-1" style={{ color: colors.textSecondary }}>
                        {pub.description}
                    </p>
                )}

                {/* Rodapé do card */}
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: colors.border }}>
                    <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: colors.textSecondary }}>
                        <User className="w-3 h-3" />
                        {pub.storeName}
                    </span>

                    <div className="flex items-center gap-3">
                        <button
                            className="p-1 rounded-full transition-all hover:scale-110"
                            style={{ color: colors.textSecondary }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Heart className="w-4 h-4" />
                        </button>
                        <button
                            className="p-1 rounded-full transition-all hover:scale-110"
                            style={{ color: colors.textSecondary }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ========== SKELETON CARD ==========
function PublicationCardSkeleton({ colors }: { colors: any }) {
    return (
        <div className="rounded-2xl overflow-hidden border flex flex-col"
            style={{
                borderColor: colors.border,
                background: colors.surface,
            }}
        >
            <div className="relative w-full aspect-[4/3] overflow-hidden flex-shrink-0"
                style={{ background: `${colors.border}50` }} />
            <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full" style={{ background: `${colors.border}30` }} />
                    <div className="h-3 rounded w-24" style={{ background: `${colors.border}30` }} />
                </div>
                <div className="h-5 rounded w-3/4" style={{ background: `${colors.border}40` }} />
                <div className="h-3 rounded w-full" style={{ background: `${colors.border}25` }} />
                <div className="h-3 rounded w-2/3" style={{ background: `${colors.border}25` }} />
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: colors.border }}>
                    <div className="h-3 rounded w-20" style={{ background: `${colors.border}25` }} />
                    <div className="flex gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ background: `${colors.border}25` }} />
                        <div className="w-4 h-4 rounded-full" style={{ background: `${colors.border}25` }} />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ========== PÁGINA PRINCIPAL ==========
export default function AllPublicationsPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement>(null)

    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [displayedPublications, setDisplayedPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [hasMore, setHasMore] = useState(true)
    const [page, setPage] = useState(0)

    const ITEMS_PER_LOAD = 12

    // ===== CARREGAR PUBLICAÇÕES =====
    const loadPublications = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const { data: storesList, error: storesErr } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')

            if (storesErr) throw new Error('Erro ao buscar lojas: ' + storesErr.message)

            const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

            const { data: publicationsList, error: pubErr } = await supabase
                .from('products')
                .select(`
                    id,
                    name,
                    image_url,
                    store_id,
                    description,
                    view_count,
                    created_at,
                    price,
                    listing_type
                `)
                .eq('listing_type', 'publication')
                .eq('is_active', true)
                .order('view_count', { ascending: false })
                .limit(200)

            if (pubErr) throw new Error('Erro ao buscar publicações: ' + pubErr.message)

            if (!publicationsList || publicationsList.length === 0) {
                setPublications([])
                setDisplayedPublications([])
                setHasMore(false)
                setLoading(false)
                return
            }

            const cards: PublicationCard[] = publicationsList.map(pub => {
                const store = storeMap.get(pub.store_id)
                const logoUrl = store?.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null
                const imageUrl = pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null

                return {
                    id: pub.id,
                    imageUrl,
                    storeName: store?.name ?? 'Loja desconhecida',
                    storeSlug: store?.storeSlug ?? '#',
                    storeLogoUrl: logoUrl,
                    title: pub.name || 'Sem título',
                    description: pub.description,
                    view_count: pub.view_count || 0,
                    created_at: pub.created_at,
                    price: pub.price,
                    listing_type: pub.listing_type,
                }
            })

            setPublications(cards)
            setDisplayedPublications(cards.slice(0, ITEMS_PER_LOAD))
            setHasMore(cards.length > ITEMS_PER_LOAD)
            setPage(1)
        } catch (err: any) {
            console.error('Erro ao carregar publicações:', err)
            setError(err.message || 'Erro ao carregar publicações')
            toast.error('Erro ao carregar publicações')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadPublications()
    }, [loadPublications])

    // ===== FILTROS =====
    const filteredPublications = useMemo(() => {
        let filtered = [...publications]

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(
                p =>
                    p.title.toLowerCase().includes(q) ||
                    p.storeName.toLowerCase().includes(q) ||
                    (p.description && p.description.toLowerCase().includes(q))
            )
        }

        return filtered
    }, [publications, searchQuery])

    // ===== RESETAR DISPLAY =====
    useEffect(() => {
        setDisplayedPublications(filteredPublications.slice(0, ITEMS_PER_LOAD))
        setHasMore(filteredPublications.length > ITEMS_PER_LOAD)
        setPage(1)
    }, [filteredPublications])

    // ===== CARREGAR MAIS =====
    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore) return

        const nextPage = page + 1
        const start = nextPage * ITEMS_PER_LOAD
        const end = start + ITEMS_PER_LOAD
        const newItems = filteredPublications.slice(start, end)

        if (newItems.length === 0) {
            setHasMore(false)
            return
        }

        setLoadingMore(true)
        setTimeout(() => {
            setDisplayedPublications(prev => [...prev, ...newItems])
            setPage(nextPage)
            setHasMore(end < filteredPublications.length)
            setLoadingMore(false)
        }, 300)
    }, [loadingMore, hasMore, page, filteredPublications])

    // ===== OBSERVADOR DE SCROLL =====
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

    // ===== HANDLE PUBLICATION CLICK =====
    // ===== HANDLE PUBLICATION CLICK - VAI PARA /publicacoes/{slug} =====
    const handlePublicationClick = (pub: PublicationCard) => {
        // Busca o slug da publicação
        const publicationSlug = pub.id // fallback: usa o ID se não tiver slug

        // Tenta buscar o slug real da publicação
        const fetchSlug = async () => {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('slug')
                    .eq('id', pub.id)
                    .single()

                if (!error && data?.slug) {
                    router.push(`/publicacoes/${data.slug}`)
                } else {
                    router.push(`/publicacoes/${pub.id}`)
                }
            } catch {
                router.push(`/publicacoes/${pub.id}`)
            }
        }

        fetchSlug()
    }

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Publicações em destaque"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder="Buscar publicações..."
                    onSearch={setSearchQuery}
                />

                <section className="px-4 md:px-6 mt-2 pb-24 max-w-7xl mx-auto">
                    {/* CONTROLES DE VISUALIZAÇÃO */}
                    <div className="flex items-center justify-end gap-2 mb-6">
                        <span className="text-xs font-medium mr-auto" style={{ color: colors.textSecondary }}>
                            {filteredPublications.length} publicações
                        </span>

                        <button
                            onClick={() => setViewMode('grid')}
                            className="p-2 rounded-lg transition-all hover:scale-105"
                            style={{
                                background: viewMode === 'grid' ? (colors.accent || '#f97316') : 'transparent',
                                color: viewMode === 'grid' ? '#ffffff' : colors.textSecondary,
                            }}
                        >
                            <Grid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className="p-2 rounded-lg transition-all hover:scale-105"
                            style={{
                                background: viewMode === 'list' ? (colors.accent || '#f97316') : 'transparent',
                                color: viewMode === 'list' ? '#ffffff' : colors.textSecondary,
                            }}
                        >
                            <List size={18} />
                        </button>
                    </div>

                    {/* LOADING */}
                    {loading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <PublicationCardSkeleton key={`skeleton-${i}`} colors={colors} />
                            ))}
                        </div>
                    )}

                    {/* ERROR */}
                    {error && !loading && (
                        <div
                            className="rounded-2xl p-12 flex flex-col items-center gap-4"
                            style={{
                                background: `${colors.surface}66`,
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <AlertCircle className="w-12 h-12" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                                {error}
                            </p>
                            <button
                                onClick={() => {
                                    setError(null)
                                    loadPublications()
                                }}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition hover:scale-105"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* LISTA DE PUBLICAÇÕES */}
                    {!loading && !error && (
                        <>
                            {displayedPublications.length === 0 ? (
                                <div
                                    className="rounded-2xl p-12 flex flex-col items-center gap-4"
                                    style={{
                                        background: `${colors.surface}66`,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <Store className="w-12 h-12 opacity-30" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                                        {searchQuery ? 'Nenhuma publicação encontrada para esta busca.' : 'Nenhuma publicação disponível no momento.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className={`grid ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'} gap-6`}>
                                        {displayedPublications.map((pub, index) => (
                                            <div key={`${pub.id}-${index}`} className="animate-fadeIn">
                                                {viewMode === 'grid' ? (
                                                    <PublicationCardComponent
                                                        pub={pub}
                                                        colors={colors}
                                                        onClick={() => handlePublicationClick(pub)}
                                                    />
                                                ) : (
                                                    // ===== VISUALIZAÇÃO LISTA (estilo blog) =====
                                                    <div
                                                        onClick={() => handlePublicationClick(pub)}
                                                        className="group rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                                                        style={{
                                                            background: colors.surface,
                                                            borderColor: colors.border,
                                                        }}
                                                    >
                                                        <div className="flex flex-col sm:flex-row gap-4 p-4">
                                                            {/* Imagem */}
                                                            <div className="w-full sm:w-48 h-48 sm:h-32 rounded-xl overflow-hidden flex-shrink-0"
                                                                style={{ background: colors.border }}>
                                                                {pub.imageUrl ? (
                                                                    <img
                                                                        src={pub.imageUrl}
                                                                        alt={pub.title}
                                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center"
                                                                        style={{ background: GRADIENT, opacity: 0.3 }}>
                                                                        <Store size={32} style={{ color: colors.textSecondary }} />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Info */}
                                                            <div className="flex-1 min-w-0 flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border"
                                                                        style={{ borderColor: colors.border }}>
                                                                        {pub.storeLogoUrl ? (
                                                                            <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center"
                                                                                style={{ background: colors.border }}>
                                                                                <Store size={12} style={{ color: colors.textSecondary }} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-xs font-medium truncate" style={{ color: colors.textSecondary }}>
                                                                        {pub.storeName}
                                                                    </span>
                                                                    {pub.created_at && (
                                                                        <span className="text-[10px] flex items-center gap-1 ml-auto"
                                                                            style={{ color: colors.textSecondary }}>
                                                                            <Calendar className="w-3 h-3" />
                                                                            {new Date(pub.created_at).toLocaleDateString('pt-BR')}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <h3 className="text-base font-bold mt-1 truncate" style={{ color: colors.textPrimary }}>
                                                                    {pub.title}
                                                                </h3>

                                                                {pub.description && (
                                                                    <p className="text-sm line-clamp-2 flex-1" style={{ color: colors.textSecondary }}>
                                                                        {pub.description}
                                                                    </p>
                                                                )}

                                                                <div className="flex items-center gap-4 mt-2">
                                                                    {pub.view_count && pub.view_count > 0 && (
                                                                        <span className="text-[10px] flex items-center gap-1"
                                                                            style={{ color: colors.textSecondary }}>
                                                                            <Eye className="w-3 h-3" />
                                                                            {pub.view_count}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[10px] flex items-center gap-1"
                                                                        style={{ color: colors.textSecondary }}>
                                                                        <User className="w-3 h-3" />
                                                                        {pub.storeName}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* LOADER DE CARREGAMENTO */}
                                    {hasMore && (
                                        <div
                                            ref={loadMoreRef}
                                            className="flex justify-center py-8 mt-6"
                                        >
                                            {loadingMore ? (
                                                <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
                                            ) : (
                                                <div className="h-8" />
                                            )}
                                        </div>
                                    )}

                                    {/* FIM DA LISTA */}
                                    {!hasMore && displayedPublications.length > 0 && (
                                        <div className="text-center py-8">
                                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                                🎉 Você já viu todas as publicações disponíveis
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
                        transform: translateY(20px);
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