// src/app/(main)/inicio/sections/ProductShowcase.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronUp,
    ChevronDown,
    Star,
    MapPin,
    ShoppingBag,
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
    const trackRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { products, loading } = useProductShowcase()
    const totalReal = products.length

    // Loop infinito: clonamos o último e o primeiro
    const loopingProducts =
        totalReal > 1
            ? [products[totalReal - 1], ...products, products[0]]
            : products

    const [activeIndex, setActiveIndex] = useState<number>(totalReal > 1 ? 1 : 0)
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartY, setDragStartY] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    const CARD_GAP = 8 // gap-2 = 0.5rem = 8px

    useEffect(() => {
        if (totalReal > 1) {
            setActiveIndex(1)
            setIsTransitioning(true)
        } else if (totalReal === 1) {
            setActiveIndex(0)
            setIsTransitioning(true)
        }
    }, [totalReal])

    const goToNext = useCallback(() => {
        if (totalReal <= 1 || !isTransitioning) return
        setActiveIndex(prev => prev + 1)
    }, [totalReal, isTransitioning])

    const goToPrev = useCallback(() => {
        if (totalReal <= 1 || !isTransitioning) return
        setActiveIndex(prev => prev - 1)
    }, [totalReal, isTransitioning])

    useEffect(() => {
        if (totalReal <= 1) return
        const handleTransitionEnd = () => {
            if (activeIndex === 0) {
                setIsTransitioning(false)
                setActiveIndex(totalReal)
            } else if (activeIndex === loopingProducts.length - 1) {
                setIsTransitioning(false)
                setActiveIndex(1)
            }
        }
        const track = trackRef.current
        track?.addEventListener('transitionend', handleTransitionEnd)
        return () => track?.removeEventListener('transitionend', handleTransitionEnd)
    }, [activeIndex, totalReal, loopingProducts.length])

    useEffect(() => {
        if (!isTransitioning) {
            const timeout = setTimeout(() => setIsTransitioning(true), 50)
            return () => clearTimeout(timeout)
        }
    }, [isTransitioning])

    useEffect(() => {
        if (isHovered || isDragging || totalReal <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalReal])

    const handleDragStart = useCallback((clientY: number) => {
        setIsDragging(true)
        setDragStartY(clientY)
        setDragOffset(0)
    }, [])
    const handleDragMove = useCallback((clientY: number) => {
        if (!isDragging) return
        setDragOffset(clientY - dragStartY)
    }, [isDragging, dragStartY])
    const handleDragEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragOffset > 50) goToPrev()
        else if (dragOffset < -50) goToNext()
        setDragOffset(0)
    }, [isDragging, dragOffset, goToPrev, goToNext])

    const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientY) }
    const onMouseMove = (e: React.MouseEvent) => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientY) } }
    const onMouseUp = () => handleDragEnd()
    const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientY)
    const onTouchMove = (e: React.TouchEvent) => { if (isDragging) handleDragMove(e.touches[0].clientY) }
    const onTouchEnd = () => handleDragEnd()

    // Altura do container e cálculo de cada card
    const containerHeight = containerRef.current?.clientHeight ?? 1
    const cardHeight = (containerHeight - CARD_GAP * 2) / 3
    const baseTranslate = -activeIndex * (cardHeight + CARD_GAP)
    const totalTranslate = baseTranslate + dragOffset

    const realIndex = totalReal > 1
        ? (activeIndex - 1 + totalReal) % totalReal
        : 0

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="flex gap-4">
                    <div className="flex-1 h-[30rem] sm:h-[36rem] bg-gray-200 rounded-2xl" />
                    <div className="w-10 h-[30rem] sm:h-[36rem] bg-gray-200 rounded-2xl" />
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
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2
                    className="text-sm font-black uppercase tracking-wider"
                    style={{ color: colors.textPrimary }}
                >
                    Produtos em destaque
                </h2>
            </div>

            <div className="flex gap-2">
                {/* Carrossel (sem card externo) */}
                <div
                    ref={containerRef}
                    className="flex-1 relative overflow-hidden select-none h-[30rem] sm:h-[36rem]"
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <div
                        ref={trackRef}
                        className="flex flex-col gap-2"
                        style={{
                            transform: `translateY(${totalTranslate}px)`,
                            transition: isTransitioning && !isDragging
                                ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                                : 'none',
                            willChange: 'transform',
                        }}
                    >
                        {loopingProducts.map((product, index) => (
                            <div
                                key={`${product.id}-${index}`}
                                className="flex-shrink-0 px-2"
                                style={{ height: `${cardHeight}px` }}
                            >
                                <div
                                    onClick={() => {
                                        if (!isDragging) {
                                            router.push(`/${product.storeSlug}?produto=${product.id}`)
                                        }
                                    }}
                                    className="group relative h-full rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1 shadow-md flex flex-row items-stretch"
                                    style={{
                                        borderColor: colors.border,
                                        background: colors.background,
                                    }}
                                >
                                    {/* Imagem à esquerda (preenche todo o espaço, sem cortes) */}
                                    <div className="w-2/5 sm:w-1/3 h-full relative overflow-hidden flex-shrink-0">
                                        {product.imageUrl ? (
                                            <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div
                                                className="w-full h-full"
                                                style={{
                                                    background: `linear-gradient(135deg, ${colors.accent}66, ${colors.background})`,
                                                }}
                                            />
                                        )}
                                        {product.viewCount > 0 && (
                                            <div className="absolute top-2 right-2 z-20 flex items-center gap-1 text-xs font-bold text-white bg-black/40 px-2 py-0.5 rounded-full">
                                                <Eye size={13} />
                                                {product.viewCount}
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
                                    </div>

                                    {/* Conteúdo à direita */}
                                    <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {product.storeLogoUrl ? (
                                                <div className="w-5 h-5 rounded-full border border-white/30 overflow-hidden bg-black/40 flex-shrink-0">
                                                    <img
                                                        src={product.storeLogoUrl}
                                                        alt={product.storeName}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div
                                                    className="w-5 h-5 rounded-full flex-shrink-0"
                                                    style={{ background: colors.accent }}
                                                />
                                            )}
                                            <span
                                                className="text-xs font-medium truncate"
                                                style={{ color: colors.textSecondary }}
                                            >
                                                {product.storeName}
                                            </span>
                                        </div>

                                        <h3
                                            className="font-black leading-tight text-sm sm:text-base line-clamp-2 mb-1"
                                            style={{ color: colors.textPrimary }}
                                        >
                                            {product.name}
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-auto">
                                            {formatPrice(product.price) && (
                                                <span className="font-black text-emerald-600 dark:text-emerald-400">
                                                    {formatPrice(product.price)}
                                                </span>
                                            )}
                                            {product.rating > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                                                    <span className="font-bold">{product.rating.toFixed(1)}</span>
                                                    <span className="opacity-70">({product.reviewCount})</span>
                                                </div>
                                            )}
                                            {product.durationMinutes && (
                                                <div className="flex items-center gap-1 opacity-70">
                                                    <Timer size={12} />
                                                    {formatDuration(product.durationMinutes)}
                                                </div>
                                            )}
                                        </div>

                                        {product.storeAddress && (
                                            <div
                                                className="flex items-start gap-1 mt-1 opacity-70 text-xs"
                                                style={{ color: colors.textSecondary }}
                                            >
                                                <MapPin size={11} className="shrink-0 mt-0.5" />
                                                <span className="line-clamp-1">{product.storeAddress}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Barra de navegação direita */}
                <div className="flex flex-col items-center justify-center gap-1 w-10 flex-shrink-0">
                    {totalReal > 1 && (
                        <>
                            <button
                                onClick={goToPrev}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                style={{ background: colors.accent, color: colors.accentText }}
                                aria-label="Anterior"
                            >
                                <ChevronUp size={16} />
                            </button>

                            <div className="flex flex-col gap-2 my-1">
                                {products.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            if (totalReal <= 1) return
                                            setIsTransitioning(true)
                                            setActiveIndex(idx + 1)
                                        }}
                                        className="rounded-full transition-all duration-300"
                                        style={{
                                            width: '0.5rem',
                                            height: idx === realIndex ? '1.5rem' : '0.5rem',
                                            background: idx === realIndex ? colors.accent : colors.border,
                                        }}
                                        aria-label={`Ir para slide ${idx + 1}`}
                                    />
                                ))}
                            </div>

                            <span
                                className="text-xs font-bold"
                                style={{ color: colors.textSecondary }}
                            >
                                {realIndex + 1}/{totalReal}
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