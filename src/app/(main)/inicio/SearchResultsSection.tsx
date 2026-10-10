// src/app/SearchResultsSection.tsx
'use client'

import { PlanRingInset } from '@/components/PlanAvatarRing'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Star, Clock, Search, Package, ChevronRight } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import { addRecentClick } from '@/components/LastSearched'
import { useProfile } from '@/app/contexts/ProfileContext'
import MiniEntityCard from '@/components/MiniEntityCard'
import { trackProfileVisit } from '@/lib/trackProfileVisit'
import { getAvatarUrl } from '@/lib/avatar'
import { hexToRgb } from '@/lib/color'

const categoriasInfo: { titulo: string; slug: string; color: string; keywords: string[] }[] = [
    { titulo: 'Alimentação', slug: 'alimentacao', color: '#f97316', keywords: ['restaurante', 'lanchonete', 'pizzaria', 'comida', 'alimentação', 'mercado', 'supermercado', 'hortifruti', 'bebidas'] },
    { titulo: 'Saúde e Bem-estar', slug: 'saude', color: '#eab308', keywords: ['farmácia', 'drogaria', 'medicamento', 'saúde', 'fitness', 'academia', 'crossfit', 'suplemento'] },
    { titulo: 'Moda e Beleza', slug: 'moda', color: '#ec4899', keywords: ['roupa', 'moda', 'vestuário', 'calçado', 'salão', 'beleza', 'cabelo'] },
    { titulo: 'Casa e Decoração', slug: 'casa', color: '#a855f7', keywords: ['móvel', 'decoração', 'casa', 'móveis'] },
    { titulo: 'Eletrônicos e Tecnologia', slug: 'eletronicos', color: '#06b6d4', keywords: ['celular', 'smartphone', 'eletrônico', 'acessório', 'computador', 'conserto', 'manutenção'] },
    { titulo: 'Serviços', slug: 'servicos', color: '#8b5cf6', keywords: ['mecânica', 'oficina', 'conserto', 'reparo', 'serviço', 'pintura', 'limpeza'] },
    { titulo: 'Pet', slug: 'pets', color: '#84cc16', keywords: ['pet', 'cachorro', 'gato', 'veterinário'] },
    { titulo: 'Transporte e Logística', slug: 'transporte', color: '#64748b', keywords: ['entrega', 'transportadora', 'logística', 'motoqueiro', 'frete'] },
]

function getCategoryForStore(store: any): string {
    if (store.category && categoriasInfo.some(c => c.slug === store.category)) {
        return store.category
    }
    const texto = `${store.name || ''} ${store.description || ''} ${store.storeSlug || ''}`.toLowerCase()
    for (const cat of categoriasInfo) {
        if (cat.keywords.some(kw => texto.includes(kw))) {
            return cat.slug
        }
    }
    return 'outros'
}

function formatPrepTime(store: any): string {
    if (store.prep_time_min == null && store.prep_time_max == null) return 'Indisponível'
    if (store.prep_time_min != null && store.prep_time_max != null) return `${store.prep_time_min}–${store.prep_time_max} min`
    if (store.prep_time_min != null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

interface SearchResultsSectionProps {
    searchQuery: string
    onSearchSelect?: (query: string) => void
}

interface StoreWithProducts {
    store: any
    products: any[]
}

export default function SearchResultsSection({ searchQuery, onSearchSelect }: SearchResultsSectionProps) {
    const { colors } = useTheme()
    const { userId: viewerId } = useProfile()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])
    const [storesWithProducts, setStoresWithProducts] = useState<StoreWithProducts[]>([])
    const [storesByCategory, setStoresByCategory] = useState<Record<string, StoreWithProducts[]>>({})
    const [hasSearched, setHasSearched] = useState(false)
    const [displayQuery, setDisplayQuery] = useState('')

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const trimmed = searchQuery.trim()

        setDisplayQuery(trimmed)

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }

        if (!trimmed) {
            setProfiles([])
            setStoresWithProducts([])
            setStoresByCategory({})
            setHasSearched(false)
            setLoading(false)
            return
        }

        setHasSearched(true)
        setLoading(true)

        debounceTimerRef.current = setTimeout(async () => {
            const query = trimmed

            try {
                // Busca sem distinção de acento/cedilha (RPCs com unaccent() no
                // Postgres) - ILIKE puro nunca ignora acentuação, então "agua"
                // nunca encontrava "água" nem "acai" encontrava "açaí".

                // 1. Buscar perfis
                const { data: profilesData, error: profilesError } = await supabase
                    .rpc('search_profiles_unaccented', { search_term: query })

                if (profilesError) {
                    console.error('Erro ao buscar perfis:', profilesError)
                }

                const mappedProfiles = (profilesData || []).map((p: any) => ({
                    ...p,
                    avatar_url: getAvatarUrl(supabase, p.avatar_url),
                    ratings_avg: p.ratings_avg ?? null,
                    ratings_count: p.ratings_count ?? null,
                    view_count: p.view_count ?? null,
                }))
                setProfiles(mappedProfiles)

                // 2. Buscar lojas
                const { data: storesData, error: storesError } = await supabase
                    .rpc('search_stores_unaccented', { search_term: query })

                if (storesError) {
                    console.error('Erro ao buscar lojas:', storesError)
                }

                // 3. Buscar produtos
                const { data: productsData, error: productsError } = await supabase
                    .rpc('search_products_unaccented', { search_term: query })

                if (productsError) {
                    console.error('Erro ao buscar produtos:', productsError)
                }

                // 4. Mapear produtos
                const mappedProducts = (productsData || []).map((p: any) => ({
                    ...p,
                    image_url: p.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                        : null,
                }))

                // 5. Produtos por loja
                const productsByStore: Record<string, any[]> = {}
                mappedProducts.forEach((product: any) => {
                    if (!productsByStore[product.store_id]) {
                        productsByStore[product.store_id] = []
                    }
                    productsByStore[product.store_id].push(product)
                })

                // 6. Combinar lojas com produtos
                const storeIdsWithProducts = Object.keys(productsByStore)
                const storeIdsFromSearch = (storesData || []).map((s: any) => s.id)
                const allStoreIds = [...new Set([...storeIdsFromSearch, ...storeIdsWithProducts])]

                let allStores: any[] = []
                if (allStoreIds.length > 0) {
                    const { data: allStoresData } = await supabase
                        .from('stores')
                        .select('id, name, "storeSlug", description, address, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, category, owner_id, business_hours, view_count')
                        .in('id', allStoreIds)

                    if (allStoresData) {
                        allStores = allStoresData.map((s: any) => ({
                            ...s,
                            logo_url: s.logo_url
                                ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                                : null,
                        }))
                    }
                }

                const storesWithProductsList: StoreWithProducts[] = allStores.map(store => {
                    const storeProducts = (productsByStore[store.id] || []).map((p: any) => ({
                        ...p,
                        _storeName: store.name,
                        _storeImage: store.logo_url,
                    }))
                    return {
                        store,
                        products: storeProducts
                    }
                })

                const filteredStores = storesWithProductsList.filter(item =>
                    item.products.length > 0 || storesData?.some((s: any) => s.id === item.store.id)
                )

                setStoresWithProducts(filteredStores)

                // 7. Agrupar por categoria
                const grouped: Record<string, StoreWithProducts[]> = {}
                for (const item of filteredStores) {
                    const cat = getCategoryForStore(item.store)
                    if (!grouped[cat]) grouped[cat] = []
                    grouped[cat].push(item)
                }
                setStoresByCategory(grouped)

            } catch (err) {
                console.error('Erro na busca:', err)
            } finally {
                setLoading(false)
            }
        }, 300)

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
        }
    }, [searchQuery])

    const handleProfileClick = (profile: any, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        addRecentClick({
            type: 'profile',
            id: profile.id,
            name: profile.name,
            imageUrl: profile.avatar_url,
            url: `/${profile.profileSlug}`,
        })

        // Navega diretamente sem limpar a busca
        router.push(`/${profile.profileSlug}`)
    }

    const handleStoreClick = (store: any, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        addRecentClick({
            type: 'store',
            id: store.id,
            name: store.name,
            imageUrl: store.logo_url,
            url: `/${store.storeSlug}`,
        })

        // Navega diretamente sem limpar a busca
        router.push(`/${store.storeSlug}`)
    }

    const handleProductClick = (product: any, storeSlug: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        addRecentClick({
            type: 'product',
            id: product.id,
            name: product.name,
            imageUrl: product.image_url,
            url: `/${storeSlug}/${product.slug || product.id}`,
            storeName: product._storeName,
            storeImage: product._storeImage,
            price: product.price,
        })

        // Navega diretamente sem limpar a busca
        router.push(`/${storeSlug}/${product.slug || product.id}`)
    }

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const totalResults = profiles.length + storesWithProducts.length

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        const now = new Date()
        // Compara por dia de calendário (não por 24h corridas) - senão algo
        // criado hoje mesmo já podia arredondar pra "Ontem" (ver social/page.tsx).
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays <= 0) return 'Hoje'
        if (diffDays === 1) return 'Ontem'
        if (diffDays < 7) return `${diffDays} dias atrás`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`
        return `${Math.floor(diffDays / 365)} anos atrás`
    }

    if (!displayQuery) {
        return null
    }

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Resultados para "{displayQuery}"
                </h2>
                {hasSearched && !loading && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                        {totalResults} resultados
                    </span>
                )}
            </div>

            {loading && (
                <div className="flex justify-center py-12">
                    <Spinner size={24} color={colors.accent} />
                </div>
            )}

            {!loading && totalResults === 0 && (
                <div className="rounded-2xl p-6 flex flex-col items-center gap-3" style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}>
                    <Search className="w-8 h-8" style={{ color: colors.textPrimary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                        Nenhum resultado encontrado para "{displayQuery}".
                    </p>
                    <p className="text-xs" style={{ color: colors.textPrimary }}>
                        Tente buscar por outro termo ou verifique a ortografia.
                    </p>
                </div>
            )}

            {!loading && totalResults > 0 && (
                <div className="space-y-6">
                    {/* Perfis - Cards com imagem em destaque */}
                    {profiles.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                                    Perfis
                                </span>
                                <span className="text-[10px] font-bold opacity-60" style={{ color: colors.textPrimary }}>
                                    ({profiles.length})
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {profiles.map((p) => (
                                    <MiniEntityCard
                                        key={p.id}
                                        kind="profile"
                                        name={p.name || 'Usuário'}
                                        slug={p.profileSlug}
                                        imageUrl={p.avatar_url && p.avatar_url.trim() !== '' ? p.avatar_url : null}
                                        profileId={p.id}
                                        colors={colors}
                                        onClick={() => handleProfileClick(p, { preventDefault() {}, stopPropagation() {} } as unknown as React.MouseEvent)}
                                        onHover={() => { trackProfileVisit(p.id, viewerId) }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lojas com produtos - CARDS HORIZONTAIS */}
                    {Object.entries(storesByCategory).map(([slug, storesList]) => {
                        const catInfo = categoriasInfo.find(c => c.slug === slug)
                        const titulo = catInfo?.titulo || 'Outros'
                        const color = catInfo?.color || '#94a3b8'

                        return (
                            <div key={slug}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-black uppercase tracking-wider" style={{ color }}>
                                        {titulo}
                                    </span>
                                    <span className="text-[10px] font-bold opacity-60" style={{ color }}>
                                        ({storesList.length})
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {storesList.map(({ store }) => (
                                        <MiniEntityCard
                                            key={store.id}
                                            kind="store"
                                            name={store.name}
                                            slug={store.storeSlug}
                                            imageUrl={store.logo_url}
                                            colors={colors}
                                            onClick={() => handleStoreClick(store, { preventDefault() {}, stopPropagation() {} } as unknown as React.MouseEvent)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <style jsx>{`
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </section>
    )
}