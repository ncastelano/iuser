// src/app/(main)/inicio/sections/PublicationShowcase.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronUp, ChevronDown, FileText, Store } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

// ---------- Tipos ----------
interface PublicationCard {
    id: string
    imageUrl: string | null
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
                .select('id, image_url, store_id')
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
                }
            })

            setPublications(cards)
            setLoading(false)
        }
        fetchPublications()
    }, [])

    return { publications, loading }
}

// ---------- Componente ----------
export default function PublicationShowcase() {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { publications, loading } = usePublicationShowcase()
    const totalReal = publications.length

    // Modo vertical infinito para 5+ publicações
    const isVerticalLoop = totalReal >= 5
    const cardsPerView = isVerticalLoop ? 4 : totalReal <= 4 ? totalReal : totalReal === 3 ? 2 : 4
    const isStatic = totalReal <= 4 && totalReal !== 3

    const [activeIndex, setActiveIndex] = useState(isVerticalLoop ? cardsPerView : 0)
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartY, setDragStartY] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    // Construir array com clones para o loop infinito
    const displayPublications = useMemo(() => {
        if (!isVerticalLoop) return publications
        const clonesStart = publications.slice(-cardsPerView)
        const clonesEnd = publications.slice(0, cardsPerView)
        return [...clonesStart, ...publications, ...clonesEnd]
    }, [publications, isVerticalLoop, cardsPerView])

    // Cálculo de dimensões
    const getContainerHeight = () => containerRef.current?.clientHeight ?? 600
    const gapPx = 12
    const cardHeightPx = (getContainerHeight() - gapPx * (cardsPerView - 1)) / cardsPerView

    const goToNext = useCallback(() => {
        if (!isVerticalLoop || !isTransitioning) return
        setActiveIndex(prev => prev + 1)
    }, [isVerticalLoop, isTransitioning])

    const goToPrev = useCallback(() => {
        if (!isVerticalLoop || !isTransitioning) return
        setActiveIndex(prev => prev - 1)
    }, [isVerticalLoop, isTransitioning])

    // Reset para loop infinito
    useEffect(() => {
        if (!isVerticalLoop) return
        const handleTransitionEnd = () => {
            if (activeIndex >= totalReal + cardsPerView) {
                setIsTransitioning(false)
                setActiveIndex(cardsPerView)
            } else if (activeIndex < cardsPerView) {
                setIsTransitioning(false)
                setActiveIndex(totalReal + cardsPerView - 1)
            }
        }
        const track = trackRef.current
        track?.addEventListener('transitionend', handleTransitionEnd)
        return () => track?.removeEventListener('transitionend', handleTransitionEnd)
    }, [activeIndex, isVerticalLoop, totalReal, cardsPerView])

    useEffect(() => {
        if (!isTransitioning) {
            const timeout = setTimeout(() => setIsTransitioning(true), 50)
            return () => clearTimeout(timeout)
        }
    }, [isTransitioning])

    // Autoplay
    useEffect(() => {
        if (isHovered || isDragging || !isVerticalLoop) return
        autoPlayRef.current = setInterval(goToNext, 4000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, isVerticalLoop])

    // Drag vertical
    const handleDragStart = useCallback((clientY: number) => {
        if (!isVerticalLoop) return
        setIsDragging(true)
        setDragStartY(clientY)
        setDragOffset(0)
    }, [isVerticalLoop])

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

    const onPointerDown = (e: React.PointerEvent) => {
        e.preventDefault()
        handleDragStart(e.clientY)
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (isDragging) handleDragMove(e.clientY)
    }
    const onPointerUp = () => handleDragEnd()

    // Translação vertical
    const translateY = useMemo(() => {
        if (!isVerticalLoop) return 0
        return -activeIndex * (cardHeightPx + gapPx) + dragOffset
    }, [isVerticalLoop, activeIndex, cardHeightPx, gapPx, dragOffset])

    // Índice real (0 a totalReal-1)
    const realIndex = useMemo(() => {
        if (!isVerticalLoop) return 0
        if (activeIndex < cardsPerView) return totalReal - 1
        if (activeIndex >= totalReal + cardsPerView) return 0
        return activeIndex - cardsPerView
    }, [isVerticalLoop, activeIndex, totalReal, cardsPerView])

    // Grid para layout estático
    const gridClass = totalReal === 1
        ? 'grid-cols-1'
        : totalReal === 2
            ? 'grid-cols-2'
            : totalReal === 3
                ? 'grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-4'

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
                <div className="flex gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex-1 h-72 sm:h-80 bg-gray-200 rounded-2xl" />
                    ))}
                </div>
            </div>
        )
    }

    if (!publications.length) return null

    return (
        <div
            className="relative w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-4 px-1">
                <FileText size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Publicações em destaque
                </h2>
            </div>

            <div
                ref={containerRef}
                className={`relative overflow-hidden select-none ${isVerticalLoop ? 'h-[36rem]' : ''}`}
                onPointerDown={isVerticalLoop ? onPointerDown : undefined}
                onPointerMove={isVerticalLoop ? onPointerMove : undefined}
                onPointerUp={isVerticalLoop ? onPointerUp : undefined}
                onPointerLeave={isVerticalLoop ? onPointerUp : undefined}
            >
                {isVerticalLoop ? (
                    <div
                        ref={trackRef}
                        className="flex flex-col gap-3 absolute left-0 right-0 px-2"
                        style={{
                            transform: `translateY(${translateY}px)`,
                            transition: isTransitioning && !isDragging
                                ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                                : 'none',
                            willChange: 'transform',
                        }}
                    >
                        {displayPublications.map((pub, index) => (
                            <div
                                key={`${pub.id}-${index}`}
                                className="flex-shrink-0 rounded-2xl overflow-hidden border shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer relative"
                                style={{
                                    height: `${cardHeightPx}px`,
                                    borderColor: colors.border,
                                    background: colors.background,
                                }}
                                onClick={() => {
                                    if (!isDragging) router.push(`/${pub.storeSlug}?produto=${pub.id}`)
                                }}
                            >
                                {pub.imageUrl ? (
                                    <img
                                        src={pub.imageUrl}
                                        alt={pub.storeName}
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-background" />
                                )}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                                <div className="absolute bottom-0 left-0 right-0 p-4 z-10 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 flex-shrink-0">
                                        {pub.storeLogoUrl ? (
                                            <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/80">
                                                <Store size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-white font-bold text-sm sm:text-base leading-tight truncate">
                                        {pub.storeName}
                                    </h3>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={`grid ${gridClass} gap-3`}>
                        {publications.map(pub => (
                            <div
                                key={pub.id}
                                onClick={() => router.push(`/${pub.storeSlug}?produto=${pub.id}`)}
                                className="group relative h-72 sm:h-80 rounded-2xl overflow-hidden border shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                                style={{ borderColor: colors.border, background: colors.background }}
                            >
                                {pub.imageUrl ? (
                                    <img src={pub.imageUrl} alt={pub.storeName} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-background" />
                                )}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                                <div className="absolute bottom-0 left-0 right-0 p-4 z-10 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 flex-shrink-0">
                                        {pub.storeLogoUrl ? (
                                            <img src={pub.storeLogoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/80">
                                                <Store size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-white font-bold text-sm sm:text-base leading-tight truncate">
                                        {pub.storeName}
                                    </h3>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isVerticalLoop && totalReal > 0 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                        aria-label="Anterior"
                    >
                        <ChevronUp size={16} />
                    </button>
                    <div className="flex gap-2">
                        {publications.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    setIsTransitioning(true)
                                    setActiveIndex(idx + cardsPerView)
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
                        aria-label="Próximo"
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}