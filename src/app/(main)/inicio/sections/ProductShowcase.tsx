// src/app/(main)/inicio/sections/ProductShowcase.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronLeft,
    ChevronRight,
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

// ---------- Embaralhamento que evita lojas consecutivas ----------
function shuffleNoAdjacentStore(products: ProductCard[]): ProductCard[] {
    if (products.length <= 1) return products

    // Agrupa por storeSlug
    const storeMap = new Map<string, ProductCard[]>()
    for (const p of products) {
        const list = storeMap.get(p.storeSlug) || []
        list.push(p)
        storeMap.set(p.storeSlug, list)
    }

    // Max-heap (array ordenado) baseado no número de produtos de cada loja
    const heap = Array.from(storeMap.entries()).map(([store, items]) => ({
        store,
        items,
    }))
    heap.sort((a, b) => b.items.length - a.items.length) // decrescente

    const result: ProductCard[] = []
    let lastStore: string | null = null

    while (heap.length > 0) {
        // Escolhe a loja com mais itens, mas evita a última utilizada se houver alternativa
        let pickIdx = 0
        if (heap[0].store === lastStore && heap.length > 1) {
            pickIdx = 1
        }

        const picked = heap[pickIdx]
        result.push(picked.items.pop()!)
        lastStore = picked.store

        // Remove loja se não houver mais produtos
        if (picked.items.length === 0) {
            heap.splice(pickIdx, 1)
        }

        // Reordena a heap (pode ser pequena, não há problema de performance)
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

            // 1. Lojas
            const { data: storesList, error: storesErr } = await supabase
                .from('stores')
                .select('id, name, storeSlug, address, logo_url')

            if (storesErr) {
                console.error('[ProductShowcase] Erro ao buscar lojas:', storesErr)
                setLoading(false)
                return
            }

            const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

            // 2. Apenas produtos à venda (exclui publicações)
            const { data: productsList, error: prodErr } = await supabase
                .from('products')
                .select('*')
                .eq('listing_type', 'sale') // <-- agora só vendas
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

            // 3. Avaliações
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

            // 4. Montagem dos cards
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

            // Embaralha garantindo que lojas não se repitam consecutivamente
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
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { products, loading } = useProductShowcase()
    const totalReal = products.length

    const loopingProducts =
        totalReal > 1
            ? [products[totalReal - 1], ...products, products[0]]
            : products

    const [activeIndex, setActiveIndex] = useState<number>(totalReal > 1 ? 1 : 0)
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    // Três cards por vez (ajustado para consistência)
    const cardWidthPercent = 100 / 3
    const unitPercent = cardWidthPercent

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
            if (activeIndex === loopingProducts.length - 1) {
                setIsTransitioning(false)
                setActiveIndex(1)
            } else if (activeIndex === 0) {
                setIsTransitioning(false)
                setActiveIndex(totalReal)
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

    const handleDragStart = useCallback((clientX: number) => {
        setIsDragging(true)
        setDragStartX(clientX)
        setDragOffset(0)
    }, [])
    const handleDragMove = useCallback((clientX: number) => {
        if (!isDragging) return
        setDragOffset(clientX - dragStartX)
    }, [isDragging, dragStartX])
    const handleDragEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragOffset > 50) goToPrev()
        else if (dragOffset < -50) goToNext()
        setDragOffset(0)
    }, [isDragging, dragOffset, goToPrev, goToNext])

    const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientX) }
    const onMouseMove = (e: React.MouseEvent) => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientX) } }
    const onMouseUp = () => handleDragEnd()
    const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX)
    const onTouchMove = (e: React.TouchEvent) => { if (isDragging) handleDragMove(e.touches[0].clientX) }
    const onTouchEnd = () => handleDragEnd()

    const trackWidth = trackRef.current?.clientWidth || 1
    const baseTranslate = -activeIndex * unitPercent
    const totalTranslate = baseTranslate + (dragOffset / trackWidth) * 100

    const realIndex = totalReal > 1
        ? (activeIndex - 1 + totalReal) % totalReal
        : 0

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="flex gap-4">
                    <div className="w-1/3 h-64 sm:h-80 bg-gray-200 rounded-2xl" />
                    <div className="w-1/3 h-64 sm:h-80 bg-gray-200 rounded-2xl" />
                    <div className="w-1/3 h-64 sm:h-80 bg-gray-200 rounded-2xl" />
                </div>
            </div>
        )
    }

    if (!products.length) return null

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl"
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

            <div
                className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
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
                    className="flex"
                    style={{
                        transform: `translateX(${totalTranslate}%)`,
                        transition: isTransitioning && !isDragging
                            ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                            : 'none',
                        willChange: 'transform',
                    }}
                >
                    {loopingProducts.map((product, index) => {
                        const priceFormatted = formatPrice(product.price)
                        const hasRating = product.rating > 0
                        const storeAddress = product.storeAddress

                        return (
                            <div
                                key={`${product.id}-${index}`}
                                className="flex-shrink-0"
                                style={{
                                    width: `${cardWidthPercent}%`,
                                    padding: '0 6px',
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    onClick={() => {
                                        if (!isDragging) {
                                            router.push(`/${product.storeSlug}?produto=${product.id}`)
                                        }
                                    }}
                                    className="group relative h-64 sm:h-80 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02] shadow-md"
                                    style={{
                                        borderColor: colors.border,
                                        background: colors.background,
                                    }}
                                >
                                    {product.imageUrl ? (
                                        <img
                                            src={product.imageUrl}
                                            alt={product.name}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                    ) : (
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                background: `linear-gradient(135deg, ${colors.accent}66, ${colors.background})`,
                                            }}
                                        />
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

                                    {/* Badge da loja */}
                                    <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                                        {product.storeLogoUrl && (
                                            <div className="w-7 h-7 rounded-full border border-white/30 overflow-hidden bg-black/30">
                                                <img
                                                    src={product.storeLogoUrl}
                                                    alt={product.storeName}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        <span className="text-xs font-bold text-white bg-black/40 px-2 py-0.5 rounded-full">
                                            {product.storeName}
                                        </span>
                                    </div>

                                    {/* Views */}
                                    {product.viewCount > 0 && (
                                        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 text-xs font-bold text-white bg-black/40 px-2 py-0.5 rounded-full">
                                            <Eye size={13} />
                                            {product.viewCount}
                                        </div>
                                    )}

                                    {/* Conteúdo inferior */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white z-10">
                                        <h3 className="text-lg sm:text-xl font-black leading-tight line-clamp-2 drop-shadow-lg mb-1">
                                            {product.name}
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm mt-2">
                                            {priceFormatted && (
                                                <span className="font-black text-emerald-300">
                                                    {priceFormatted}
                                                </span>
                                            )}
                                            {hasRating && (
                                                <div className="flex items-center gap-1">
                                                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                                    <span className="font-bold">{product.rating.toFixed(1)}</span>
                                                    <span className="text-white/70">
                                                        ({product.reviewCount})
                                                    </span>
                                                </div>
                                            )}
                                            {product.durationMinutes && (
                                                <div className="flex items-center gap-1">
                                                    <Timer size={14} />
                                                    {formatDuration(product.durationMinutes)}
                                                </div>
                                            )}
                                        </div>

                                        {storeAddress && (
                                            <div className="flex items-start gap-1 mt-2 text-xs text-white/80">
                                                <MapPin size={13} className="shrink-0 mt-0.5" />
                                                <span className="line-clamp-1">{storeAddress}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {totalReal > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {products.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (totalReal <= 1) return
                                    setIsTransitioning(true)
                                    setActiveIndex(idx + 1)
                                }}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === realIndex ? '1.5rem' : '0.5rem',
                                    background: idx === realIndex ? colors.accent : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}