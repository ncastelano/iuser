// src/app/(main)/inicio/sections/ProductShowcase.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import {
    ChevronUp,
    ChevronDown,
    Star,
    MapPin,
    Package,
    Eye,
    Timer,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface ProductCard {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    price: number | null
    description?: string
    durationMinutes: number | null
    viewCount: number
    rating: number
    reviewCount: number
    storeName: string
    storeSlug: string
    storeAddress: string | null
    storeLogoUrl: string | null
    profileSlug?: string | null
    isProfileProduct: boolean
}

// ---------- Props ----------
interface ProductShowcaseProps {
    dragHandle?: ReactNode
}

// ---------- Função para obter URL pública do avatar ----------
function getAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) return null

    try {
        if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
            return avatarPath
        }

        let cleanPath = avatarPath
        if (cleanPath.startsWith('avatars/')) {
            cleanPath = cleanPath.replace('avatars/', '')
        }
        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1)
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(cleanPath)
        return data.publicUrl
    } catch (error) {
        console.error('[getAvatarUrl] Erro ao gerar URL do avatar:', error)
        return null
    }
}

// ---------- Embaralhamento ----------
function shuffleNoAdjacentStore(products: ProductCard[]): ProductCard[] {
    if (products.length <= 1) return products

    const storeMap = new Map<string, ProductCard[]>()
    for (const p of products) {
        const key = p.isProfileProduct ? `profile_${p.profileSlug}` : p.storeSlug
        const list = storeMap.get(key) || []
        list.push(p)
        storeMap.set(key, list)
    }

    const heap = Array.from(storeMap.entries()).map(([store, items]) => ({
        store,
        items,
    }))
    heap.sort((a, b) => b.items.length - a.items.length)

    const result: ProductCard[] = []
    let lastStore: string | null = null

    while (heap.length > 0) {
        let pickIdx = 0
        if (heap[0].store === lastStore && heap.length > 1) {
            pickIdx = 1
        }

        const picked = heap[pickIdx]
        result.push(picked.items.pop()!)
        lastStore = picked.store

        if (picked.items.length === 0) {
            heap.splice(pickIdx, 1)
        }

        heap.sort((a, b) => b.items.length - a.items.length)
    }

    return result
}

// ---------- Hook de dados ----------
function useProductShowcase() {
    const [products, setProducts] = useState<ProductCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true)

            try {
                const { data: storesList, error: storesErr } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, address, logo_url, owner_id')

                if (storesErr) {
                    console.error('[ProductShowcase] Erro ao buscar lojas:', storesErr)
                    setLoading(false)
                    return
                }

                const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

                const { data: productsList, error: prodErr } = await supabase
                    .from('products')
                    .select('*')
                    .eq('listing_type', 'sale')
                    .order('view_count', { ascending: false })

                if (prodErr) {
                    console.error('[ProductShowcase] Erro ao buscar produtos:', prodErr)
                    setLoading(false)
                    return
                }

                if (!productsList || productsList.length === 0) {
                    setProducts([])
                    setLoading(false)
                    return
                }

                const storeOwnerIds = [...new Set(storesList?.map(s => s.owner_id) || [])]
                const productOwnerIds = productsList
                    .filter(p => p.owner_id)
                    .map(p => p.owner_id)

                const uniqueProfileIds = [...new Set([...storeOwnerIds, ...productOwnerIds])]

                const { data: allProfiles, error: profileErr } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url')
                    .in('id', uniqueProfileIds)

                if (profileErr) {
                    console.error('[ProductShowcase] Erro ao buscar perfis:', profileErr)
                }

                const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || [])

                const { data: reviewsList } = await supabase
                    .from('product_reviews')
                    .select('product_id, rating')

                const ratingMap = new Map<string, { sum: number; count: number }>()
                reviewsList?.forEach(r => {
                    if (!ratingMap.has(r.product_id)) ratingMap.set(r.product_id, { sum: 0, count: 0 })
                    const cur = ratingMap.get(r.product_id)!
                    cur.sum += r.rating
                    cur.count += 1
                })

                const cards: ProductCard[] = productsList.map(prod => {
                    const isProfileProduct = !prod.store_id && !!prod.owner_id
                    const store = storeMap.get(prod.store_id)

                    let storeName = 'Loja desconhecida'
                    let storeSlug = '#'
                    let storeAddress: string | null = null
                    let storeLogoUrl: string | null = null
                    let profileSlug: string | null = null

                    const profile = profileMap.get(prod.owner_id)

                    if (profile) {
                        profileSlug = profile.profileSlug || null
                    }

                    if (prod.owner_image_url) {
                        storeLogoUrl = prod.owner_image_url
                    }

                    if (isProfileProduct) {
                        if (profile) {
                            storeName = profile.name || 'Perfil sem nome'
                            storeSlug = profile.profileSlug || '#'
                            storeAddress = null

                            if (!storeLogoUrl && profile.avatar_url) {
                                storeLogoUrl = getAvatarUrl(profile.avatar_url)
                            }
                        }
                    } else if (store) {
                        storeName = store.name
                        storeSlug = store.storeSlug
                        storeAddress = store.address ?? null

                        if (!storeLogoUrl && store.logo_url) {
                            storeLogoUrl = supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                        }

                        if (!storeLogoUrl && profile && profile.avatar_url) {
                            storeLogoUrl = getAvatarUrl(profile.avatar_url)
                        }
                    } else {
                        if (profile) {
                            storeName = profile.name || 'Perfil sem nome'
                            storeSlug = profile.profileSlug || '#'
                            storeAddress = null

                            if (!storeLogoUrl && profile.avatar_url) {
                                storeLogoUrl = getAvatarUrl(profile.avatar_url)
                            }
                        }
                    }

                    if (!storeLogoUrl && profile && profile.avatar_url) {
                        storeLogoUrl = getAvatarUrl(profile.avatar_url)
                    }

                    const imageUrl = prod.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl
                        : null

                    const ratingData = ratingMap.get(prod.id)
                    const avg = ratingData ? ratingData.sum / ratingData.count : 0
                    const count = ratingData ? ratingData.count : 0

                    return {
                        id: prod.id,
                        name: prod.name,
                        slug: prod.slug,
                        imageUrl,
                        price: prod.price ?? null,
                        description: prod.description,
                        durationMinutes: prod.duration_minutes ?? null,
                        viewCount: prod.view_count ?? 0,
                        rating: Number(avg.toFixed(1)),
                        reviewCount: count,
                        storeName,
                        storeSlug,
                        storeAddress,
                        storeLogoUrl,
                        profileSlug: profileSlug ?? null,
                        isProfileProduct: isProfileProduct || (!prod.store_id && !!prod.owner_id),
                    }
                })

                setProducts(shuffleNoAdjacentStore(cards))
            } catch (error) {
                console.error('[ProductShowcase] Erro geral:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProducts()
    }, [])

    return { products, loading }
}

// ---------- Helpers ----------
const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const formatPrice = (price: number | null) => {
    if (price == null) return null
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------- Hook para detectar breakpoint ----------
function useBreakpoint() {
    const [itemsPerPage, setItemsPerPage] = useState(3)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1120) {
                setItemsPerPage(9)
            } else if (width >= 800) {
                setItemsPerPage(6)
            } else {
                setItemsPerPage(3)
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return itemsPerPage
}

// ========== SKELETON CARD ==========
function ProductSkeleton({ colors }: { colors: any }) {
    return (
        <div
            className="h-28 rounded-xl overflow-hidden border"
            style={{
                borderColor: colors.border,
                background: colors.surface,
            }}
        >
            <div className="flex flex-row items-stretch h-full">
                {/* Imagem skeleton */}
                <div className="w-1/3 h-full flex-shrink-0" style={{ background: `${colors.border}40` }} />

                {/* Conteúdo skeleton */}
                <div className="flex-1 p-3 flex flex-col justify-center space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ background: `${colors.border}30` }} />
                        <div className="h-3 rounded w-20" style={{ background: `${colors.border}30` }} />
                    </div>
                    <div className="h-4 rounded w-3/4" style={{ background: `${colors.border}30` }} />
                    <div className="flex items-center gap-2">
                        <div className="h-3 rounded w-16" style={{ background: `${colors.border}25` }} />
                        <div className="h-3 rounded w-12" style={{ background: `${colors.border}25` }} />
                    </div>
                    <div className="h-3 rounded w-1/2" style={{ background: `${colors.border}20` }} />
                </div>
            </div>
        </div>
    )
}

// ---------- Componente ----------
// ===== URL do produto =====
function getProductUrl(product: ProductCard) {
    // Se tem storeSlug e product slug, vai para /storeSlug/productSlug
    if (product.storeSlug && product.storeSlug !== '#' && product.slug) {
        return `/${product.storeSlug}/${product.slug}`
    }
    // Fallback: se não tem storeSlug, usa o profileSlug
    if (product.profileSlug) {
        return `/${product.profileSlug}/${product.slug || product.id}`
    }
    // Fallback final
    return `/${product.storeSlug}/${product.slug || product.id}`
}

export default function ProductShowcase({ dragHandle }: ProductShowcaseProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { products, loading } = useProductShowcase()
    const itemsPerPage = useBreakpoint()
    const total = products.length

    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const goToNext = useCallback(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    useEffect(() => {
        setCurrentPage(0)
    }, [itemsPerPage])

    useEffect(() => {
        if (isHovered || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, goToNext, totalPages])

    const currentItems = useMemo(() => {
        if (total === 0) return []

        if (total <= itemsPerPage) {
            return products.slice(0, total)
        }

        const start = currentPage * itemsPerPage
        const items: ProductCard[] = []
        for (let i = start; i < start + itemsPerPage; i++) {
            const index = i % total
            items.push(products[index])
        }
        return items
    }, [products, currentPage, itemsPerPage, total])

    // Pre-carrega a rota dos produtos visiveis, pra abrir na hora ao clicar.
    useEffect(() => {
        currentItems.forEach((product) => {
            router.prefetch(getProductUrl(product))
        })
    }, [currentItems, router])

    const gridCols = itemsPerPage >= 9 ? 'grid-cols-3' : itemsPerPage >= 6 ? 'grid-cols-2' : 'grid-cols-1'

    if (loading) {
        return (
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4 px-1">
                    {dragHandle}
                    <div className="h-5 rounded w-40" style={{ background: `${colors.border}60` }} />
                </div>
                <div className={`grid ${gridCols} gap-3`}>
                    {Array.from({ length: Math.min(itemsPerPage, 6) }).map((_, i) => (
                        <ProductSkeleton key={`skeleton-${i}`} colors={colors} />
                    ))}
                </div>
            </div>
        )
    }

    if (!products.length) return null

    return (
        <div
            className="relative w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Título com dragHandle */}
            <div className="flex items-center gap-2 mb-4 px-1">
                {dragHandle}
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Produtos em destaque
                </h2>
            </div>

            <div className="flex gap-3">
                <div className={`flex-1 grid ${gridCols} gap-3`}>
                    {currentItems.map((product, idx) => {
                        const hasProductImage = !!product.imageUrl
                        const hasStoreLogo = !!product.storeLogoUrl

                        return (
                            <div
                                key={`${product.id}-${idx}`}
                                onClick={() => { startNavProgress(); router.push(getProductUrl(product)) }}
                                className="group relative h-28 rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1 shadow-md flex flex-row items-stretch cursor-pointer"
                                style={{
                                    borderColor: colors.border,
                                    background: colors.background,
                                }}
                            >
                                {/* Imagem à esquerda */}
                                <div className="w-1/3 h-full relative overflow-hidden flex-shrink-0">
                                    {hasProductImage ? (
                                        <img
                                            src={product.imageUrl!}
                                            alt={product.name}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                    ) : hasStoreLogo ? (
                                        <div className="w-full h-full">
                                            <img
                                                src={product.storeLogoUrl!}
                                                alt={product.storeName}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="w-full h-full flex items-center justify-center"
                                            style={{
                                                background: GRADIENT,
                                            }}
                                        >
                                            <Package size={32} style={{ color: '#ffffff' }} />
                                        </div>
                                    )}
                                    {product.viewCount > 0 && (
                                        <div className="absolute top-1 right-1 z-20 flex items-center gap-0.5 text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-full">
                                            <Eye size={11} />
                                            {product.viewCount}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
                                </div>

                                {/* Conteúdo à direita */}
                                <div className="flex-1 p-2 sm:p-3 flex flex-col justify-center min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        {hasStoreLogo ? (
                                            <div className="w-4 h-4 rounded-full border border-white/30 overflow-hidden bg-black/40 flex-shrink-0">
                                                <img
                                                    src={product.storeLogoUrl!}
                                                    alt={product.storeName}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                style={{ background: GRADIENT }}
                                            />
                                        )}
                                        <span
                                            className="text-[10px] font-medium truncate"
                                            style={{ color: colors.textSecondary }}
                                        >
                                            {product.storeName}
                                        </span>
                                    </div>

                                    <h3
                                        className="font-black leading-tight text-sm line-clamp-1"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        {product.name}
                                    </h3>

                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] mt-0.5">
                                        {formatPrice(product.price) && (
                                            <span className="font-black" style={{ color: '#f97316' }}>
                                                {formatPrice(product.price)}
                                            </span>
                                        )}
                                        {product.rating > 0 && (
                                            <div className="flex items-center gap-0.5">
                                                <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                                <span className="font-bold">{product.rating.toFixed(1)}</span>
                                                <span className="opacity-70">({product.reviewCount})</span>
                                            </div>
                                        )}
                                        {product.durationMinutes && (
                                            <div className="flex items-center gap-0.5 opacity-70">
                                                <Timer size={10} />
                                                {formatDuration(product.durationMinutes)}
                                            </div>
                                        )}
                                    </div>

                                    {product.storeAddress && (
                                        <div
                                            className="flex items-start gap-0.5 mt-0.5 opacity-70 text-[10px]"
                                            style={{ color: colors.textSecondary }}
                                        >
                                            <MapPin size={10} className="shrink-0 mt-0.5" />
                                            <span className="line-clamp-1">{product.storeAddress}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Barra de navegação direita */}
                <div className="flex flex-col items-center justify-center gap-1 w-10 flex-shrink-0">
                    {totalPages > 1 && (
                        <>
                            <button
                                onClick={goToPrev}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                                aria-label="Anterior"
                            >
                                <ChevronUp size={16} />
                            </button>

                            <div className="flex flex-col gap-1.5 my-1">
                                {Array.from({ length: totalPages }).map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPage(idx)}
                                        className="rounded-full transition-all duration-300"
                                        style={{
                                            width: '0.5rem',
                                            height: idx === currentPage ? '1.5rem' : '0.5rem',
                                            background: idx === currentPage ? '#f97316' : colors.border,
                                            boxShadow: idx === currentPage ? `0 0 8px #f9731650` : 'none',
                                        }}
                                        aria-label={`Ir para página ${idx + 1}`}
                                    />
                                ))}
                            </div>

                            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                {currentPage + 1}/{totalPages}
                            </span>

                            <button
                                onClick={goToNext}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                                aria-label="Próximo"
                            >
                                <ChevronDown size={16} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}