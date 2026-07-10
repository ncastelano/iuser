// src/app/(main)/inicio/sections/PublicationShowcase.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Star,
    FileText,
    Eye,
    Timer,
    MessageCircle,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos ----------
interface PublicationCard {
    id: string
    name: string
    imageUrl: string | null
    description?: string
    durationMinutes: number | null
    viewCount: number
    rating: number
    reviewCount: number
    storeName: string
    storeSlug: string
    storeLogoUrl: string | null
}

// ---------- Hook de dados ----------
function usePublicationShowcase() {
    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPublications = async () => {
            setLoading(true)

            const { data: storesList, error: storesErr } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')

            if (storesErr) {
                console.error('[PublicationShowcase] Erro ao buscar lojas:', storesErr)
                setLoading(false)
                return
            }

            const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

            const { data: publicationsList, error: pubErr } = await supabase
                .from('products')
                .select('*')
                .eq('listing_type', 'publication')
                .order('view_count', { ascending: false })

            if (pubErr) {
                console.error('[PublicationShowcase] Erro ao buscar publicações:', pubErr)
                setLoading(false)
                return
            }

            if (!publicationsList || publicationsList.length === 0) {
                setPublications([])
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

            const cards: PublicationCard[] = publicationsList.map(pub => {
                const store = storeMap.get(pub.store_id)
                const logoUrl = store?.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null

                const imageUrl = pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null

                const ratingData = ratingMap.get(pub.id)
                const avg = ratingData ? ratingData.sum / ratingData.count : 0
                const count = ratingData ? ratingData.count : 0

                return {
                    id: pub.id,
                    name: pub.name,
                    imageUrl,
                    description: pub.description,
                    durationMinutes: pub.duration_minutes ?? null,
                    viewCount: pub.view_count ?? 0,
                    rating: Number(avg.toFixed(1)),
                    reviewCount: count,
                    storeName: store?.name ?? 'Loja desconhecida',
                    storeSlug: store?.storeSlug ?? '#',
                    storeLogoUrl: logoUrl,
                }
            })

            setPublications(cards)
            setLoading(false)
        }

        fetchPublications()
    }, [])

    return { publications, loading }
}

const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function PublicationShowcase() {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { publications, loading } = usePublicationShowcase()
    const totalReal = publications.length

    const loopingPubs =
        totalReal > 1
            ? [publications[totalReal - 1], ...publications, publications[0]]
            : publications

    const [activeIndex, setActiveIndex] = useState<number>(totalReal > 1 ? 1 : 0)
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    // Mostrando 3 cards por vez
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
            if (activeIndex === loopingPubs.length - 1) {
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
    }, [activeIndex, totalReal, loopingPubs.length])

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

    const realIndex = totalReal > 1 ? (activeIndex - 1 + totalReal) % totalReal : 0

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

    if (!publications.length) return null

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-4 px-1">
                <FileText size={18} style={{ color: colors.accent }} />
                <h2
                    className="text-sm font-black uppercase tracking-wider"
                    style={{ color: colors.textPrimary }}
                >
                    Publicações em destaque
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
                    {loopingPubs.map((pub, index) => {
                        const hasRating = pub.rating > 0
                        return (
                            <div
                                key={`${pub.id}-${index}`}
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
                                            router.push(`/${pub.storeSlug}?produto=${pub.id}`)
                                        }
                                    }}
                                    className="group relative h-64 sm:h-80 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02] shadow-md"
                                    style={{
                                        borderColor: colors.border,
                                        background: colors.background,
                                    }}
                                >
                                    {pub.imageUrl ? (
                                        <img
                                            src={pub.imageUrl}
                                            alt={pub.name}
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

                                    {/* Gradiente mais suave (menos blur) */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/5" />

                                    {/* Loja (top left) */}
                                    <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                                        {pub.storeLogoUrl && (
                                            <div className="w-7 h-7 rounded-full border border-white/30 overflow-hidden bg-black/30 backdrop-blur-sm">
                                                <img
                                                    src={pub.storeLogoUrl}
                                                    alt={pub.storeName}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        <span className="text-xs font-bold text-white bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                            {pub.storeName}
                                        </span>
                                    </div>

                                    {/* Views + ícone de chat (top right) */}
                                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                                        {pub.viewCount > 0 && (
                                            <div className="flex items-center gap-1 text-xs font-bold text-white bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                                <Eye size={13} />
                                                {pub.viewCount}
                                            </div>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                // Iniciar chat/WhatsApp (exemplo)
                                                window.open(`https://wa.me/55${pub.storeSlug}`, '_blank')
                                            }}
                                            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition"
                                            title="Conversar"
                                        >
                                            <MessageCircle size={14} className="text-white" />
                                        </button>
                                    </div>

                                    {/* Conteúdo inferior */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white z-10">
                                        <h3 className="text-lg sm:text-xl font-black leading-tight line-clamp-2 drop-shadow-lg mb-1">
                                            {pub.name}
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm mt-1">
                                            {hasRating && (
                                                <div className="flex items-center gap-1">
                                                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                                    <span className="font-bold">{pub.rating.toFixed(1)}</span>
                                                    <span className="text-white/70">({pub.reviewCount})</span>
                                                </div>
                                            )}
                                            {pub.durationMinutes && (
                                                <div className="flex items-center gap-1">
                                                    <Timer size={14} />
                                                    {formatDuration(pub.durationMinutes)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Botão "Saber mais" com ícone (canto inferior direito, menor) */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            router.push(`/${pub.storeSlug}?produto=${pub.id}`)
                                        }}
                                        className="absolute bottom-3 right-3 z-20 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/15 backdrop-blur-sm hover:bg-white/30 transition text-white text-xs font-medium border border-white/30 shadow"
                                        title="Saber mais"
                                    >
                                        <MessageCircle size={14} />
                                        <span className="hidden sm:inline">Saber mais</span>
                                    </button>
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
                        {publications.map((_, idx) => (
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