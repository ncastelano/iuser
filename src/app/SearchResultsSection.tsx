// src/app/SearchResultsSection.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Star, Clock, ChevronRight, Search, Loader2, MapPin, User, Store } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { addRecentClick } from '@/components/LastSearched'
import { getAvatarUrl } from '@/lib/avatar'

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
    const [loading, setLoading] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])
    const [storesWithProducts, setStoresWithProducts] = useState<StoreWithProducts[]>([])
    const [storesByCategory, setStoresByCategory] = useState<Record<string, StoreWithProducts[]>>({})
    const [hasSearched, setHasSearched] = useState(false)
    const [displayQuery, setDisplayQuery] = useState('')

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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
                // 1. Buscar perfis
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select(`
                        id,
                        name,
                        avatar_url,
                        "profileSlug",
                        description,
                        bio,
                        address,
                        whatsapp,
                        instagram,
                        ratings_avg,
                        ratings_count,
                        is_seller,
                        is_active,
                        category,
                        view_count,
                        created_at
                    `)
                    .or(`name.ilike.%${query}%,profileSlug.ilike.%${query}%,description.ilike.%${query}%,bio.ilike.%${query}%,address.ilike.%${query}%`)
                    .eq('is_active', true)
                    .limit(20)

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
                    .from('stores')
                    .select('id, name, "storeSlug", description, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, category')
                    .or(`name.ilike.%${query}%,description.ilike.%${query}%,"storeSlug".ilike.%${query}%,category.ilike.%${query}%`)
                    .limit(30)

                if (storesError) {
                    console.error('Erro ao buscar lojas:', storesError)
                }

                // 3. Buscar produtos
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('id, name, description, price, image_url, slug, store_id, category, type')
                    .eq('listing_type', 'sale')
                    .ilike('name', `%${query}%`)
                    .limit(50)

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
                mappedProducts.forEach(product => {
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
                        .select('id, name, "storeSlug", description, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, category')
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
                    const storeProducts = productsByStore[store.id] || []
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

    const handleProfileClick = (profile: any) => {
        addRecentClick({
            type: 'profile',
            id: profile.id,
            name: profile.name,
            imageUrl: profile.avatar_url,
            url: `/${profile.profileSlug}`,
        })
        if (onSearchSelect) {
            onSearchSelect('')
        }
    }

    const handleStoreClick = (store: any) => {
        addRecentClick({
            type: 'store',
            id: store.id,
            name: store.name,
            imageUrl: store.logo_url,
            url: `/${store.storeSlug}`,
        })
        if (onSearchSelect) {
            onSearchSelect('')
        }
    }

    const handleProductClick = (product: any, storeSlug: string) => {
        addRecentClick({
            type: 'product',
            id: product.id,
            name: product.name,
            imageUrl: product.image_url,
            url: `/${storeSlug}/${product.slug || product.id}`,
        })
        if (onSearchSelect) {
            onSearchSelect('')
        }
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const num = parseInt(clean, 16)
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const totalResults = profiles.length + storesWithProducts.length

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'Hoje'
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
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.accent }} />
                </div>
            )}

            {!loading && totalResults === 0 && (
                <div className="rounded-2xl p-6 flex flex-col items-center gap-3" style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}>
                    <Search className="w-8 h-8" style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                        Nenhum resultado encontrado para "{displayQuery}".
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
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
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                    Perfis
                                </span>
                                <span className="text-[10px] font-bold opacity-60" style={{ color: colors.textSecondary }}>
                                    ({profiles.length})
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {profiles.map((profile) => (
                                    <Link
                                        key={profile.id}
                                        href={`/${profile.profileSlug}`}
                                        onClick={() => handleProfileClick(profile)}
                                        className="group"
                                    >
                                        <div
                                            className="rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                                            style={{
                                                background: cardBg,
                                                backdropFilter: 'blur(12px)',
                                                borderColor: colors.border,
                                                boxShadow: colors.shadow,
                                            }}
                                        >
                                            <div className="w-full aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                {profile.avatar_url && profile.avatar_url.trim() !== '' ? (
                                                    <img
                                                        src={profile.avatar_url}
                                                        alt={profile.name || 'Perfil'}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                        <span className="text-4xl font-black text-white/70">
                                                            {profile.name?.charAt(0).toUpperCase() || '?'}
                                                        </span>
                                                    </div>
                                                )}
                                                {profile.is_seller && (
                                                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                                                        Vendedor
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-2 text-center">
                                                <h3 className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {profile.name || 'Usuário'}
                                                </h3>
                                                <p className="text-[9px]" style={{ color: colors.accent }}>
                                                    @{profile.profileSlug}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lojas com produtos - Cards com imagem em destaque */}
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
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {storesList.map(({ store, products }) => {
                                        const storeUrl = `/${store.storeSlug}`
                                        const hasProducts = products.length > 0

                                        return (
                                            <div key={store.id} className="rounded-xl border overflow-hidden" style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}>
                                                <Link
                                                    href={storeUrl}
                                                    onClick={() => handleStoreClick(store)}
                                                    className="block group"
                                                >
                                                    <div className="w-full aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {store.logo_url ? (
                                                            <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                                <span className="text-4xl font-black text-white/70">
                                                                    {store.name?.charAt(0) || '?'}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {hasProducts && (
                                                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-bold backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                                                                {products.length}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="p-2">
                                                        <h3 className="text-xs font-bold truncate text-center" style={{ color: colors.textPrimary }}>{store.name}</h3>
                                                        <div className="flex items-center justify-center gap-2 mt-1">
                                                            <div className="flex items-center gap-0.5">
                                                                <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                                                <span className="text-[10px] font-bold" style={{ color: colors.textPrimary }}>{store.ratings_avg?.toFixed(1) || '0.0'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-0.5">
                                                                <Clock size={10} style={{ color: colors.accent }} />
                                                                <span className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>{formatPrepTime(store)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>

                                                {/* Produtos da Loja - miniaturas */}
                                                {hasProducts && (
                                                    <div className="px-2 pb-2">
                                                        <div className="border-t pt-1.5" style={{ borderColor: colors.border }}>
                                                            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                                                                {products.slice(0, 3).map((product) => (
                                                                    <Link
                                                                        key={product.id}
                                                                        href={`/${store.storeSlug}/${product.slug || product.id}`}
                                                                        onClick={() => handleProductClick(product, store.storeSlug)}
                                                                        className="group/product flex-shrink-0 w-16"
                                                                    >
                                                                        <div className="rounded-lg border overflow-hidden transition-all hover:scale-105" style={{ borderColor: colors.border, background: `rgba(255,255,255,0.03)` }}>
                                                                            <div className="w-full aspect-square overflow-hidden" style={{ background: colors.accentLight }}>
                                                                                {product.image_url ? (
                                                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover/product:scale-110 transition-transform duration-300" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                                                        <span className="text-[10px] font-black text-white/50">
                                                                                            {product.name?.charAt(0) || '?'}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="p-1">
                                                                                <p className="text-[8px] font-bold truncate text-center" style={{ color: colors.textPrimary }}>
                                                                                    {product.name}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </Link>
                                                                ))}
                                                                {products.length > 3 && (
                                                                    <Link
                                                                        href={storeUrl}
                                                                        className="flex-shrink-0 w-16 rounded-lg border-2 border-dashed flex items-center justify-center aspect-square transition-all hover:bg-white/5"
                                                                        style={{ borderColor: colors.border }}
                                                                    >
                                                                        <span className="text-[8px] font-bold text-center leading-tight" style={{ color: colors.textSecondary }}>
                                                                            +{products.length - 3}
                                                                        </span>
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
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