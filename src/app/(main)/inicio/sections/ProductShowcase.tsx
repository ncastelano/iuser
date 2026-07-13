'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos ----------
interface ProductCard {
    id: string
    name: string
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
}

// ---------- Embaralhamento ----------
function shuffleNoAdjacentStore(products: ProductCard[]): ProductCard[] {
    if (products.length <= 1) return products

    const storeMap = new Map<string, ProductCard[]>()
    for (const p of products) {
        const list = storeMap.get(p.storeSlug) || []
        list.push(p)
        storeMap.set(p.storeSlug, list)
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

            const { data: storesList, error: storesErr } = await supabase
                .from('stores')
                .select('id, name, storeSlug, address, logo_url')

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
                const store = storeMap.get(prod.store_id)
                const logoUrl = store?.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null

                const imageUrl = prod.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl
                    : null

                const ratingData = ratingMap.get(prod.id)
                const avg = ratingData ? ratingData.sum / ratingData.count : 0
                const count = ratingData ? ratingData.count : 0

                return {
                    id: prod.id,
                    name: prod.name,
                    imageUrl,
                    price: prod.price ?? null,
                    description: prod.description,
                    durationMinutes: prod.duration_minutes ?? null,
                    viewCount: prod.view_count ?? 0,
                    rating: Number(avg.toFixed(1)),
                    reviewCount: count,
                    storeName: store?.name ?? 'Loja desconhecida',
                    storeSlug: store?.storeSlug ?? '#',
                    storeAddress: store?.address ?? null,
                    storeLogoUrl: logoUrl,
                }
            })

            setProducts(shuffleNoAdjacentStore(cards))
            setLoading(false)
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

// ---------- Componente ----------
export default function ProductShowcase() {
    const router = useRouter()
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { products, loading } = useProductShowcase()
    const total = products.length

    // 3 cards por página (3 linhas, 1 coluna)
    const ITEMS_PER_PAGE = 3
    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    // Navegação circular
    const goToNext = useCallback(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    // Autoplay
    useEffect(() => {
        if (isHovered || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, goToNext, totalPages])

    // Itens da página atual com loop infinito (sempre 3 cards)
    const currentItems = useMemo(() => {
        if (total === 0) return []

        // Se total for menor que ITEMS_PER_PAGE, exibe todos (1 página)
        if (total <= ITEMS_PER_PAGE) {
            return products.slice(0, total)
        }

        // Caso contrário, pega 3 itens circularmente a partir da página atual
        const start = currentPage * ITEMS_PER_PAGE
        const items: ProductCard[] = []
        for (let i = start; i < start + ITEMS_PER_PAGE; i++) {
            const index = i % total
            items.push(products[index])
        }
        return items
    }, [products, currentPage, total])

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-28 bg-gray-200 rounded-xl" />
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
            <div className="flex items-center gap-2 mb-4 px-1">
                <Package size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Produtos em destaque
                </h2>
            </div>

            {/* Grid vertical: 3 cards por página */}
            <div className="flex gap-3">
                <div className="flex-1 space-y-3">
                    {currentItems.map((product, idx) => (
                        <div
                            key={`${product.id}-${idx}`}
                            onClick={() => router.push(`/${product.storeSlug}?produto=${product.id}`)}
                            className="group relative h-28 rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1 shadow-md flex flex-row items-stretch cursor-pointer"
                            style={{
                                borderColor: colors.border,
                                background: colors.background,
                            }}
                        >
                            {/* Imagem à esquerda */}
                            <div className="w-1/3 h-full relative overflow-hidden flex-shrink-0">
                                {product.imageUrl ? (
                                    <img
                                        src={product.imageUrl}
                                        alt={product.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                ) : (
                                    <div
                                        className="w-full h-full flex items-center justify-center"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accentLight}30)`,
                                        }}
                                    >
                                        <Package size={32} style={{ color: colors.accent }} />
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
                                    {product.storeLogoUrl ? (
                                        <div className="w-4 h-4 rounded-full border border-white/30 overflow-hidden bg-black/40 flex-shrink-0">
                                            <img
                                                src={product.storeLogoUrl}
                                                alt={product.storeName}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ background: colors.accent }}
                                        />
                                    )}
                                    <span className="text-[10px] font-medium truncate" style={{ color: colors.textSecondary }}>
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
                                        <span className="font-black text-emerald-600 dark:text-emerald-400">
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
                    ))}
                </div>

                {/* Barra de navegação direita */}
                <div className="flex flex-col items-center justify-center gap-1 w-10 flex-shrink-0">
                    {totalPages > 1 && (
                        <>
                            <button
                                onClick={goToPrev}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                style={{ background: colors.accent, color: colors.accentText }}
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
                                            background: idx === currentPage ? colors.accent : colors.border,
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
                                style={{ background: colors.accent, color: colors.accentText }}
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