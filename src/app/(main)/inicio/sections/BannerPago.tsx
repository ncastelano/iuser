// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Star,
    MapPin,
    Clock,
    ShoppingBag,
    Eye
} from 'lucide-react'
import { useTheme } from '@/app/theme' // ajuste conforme necessário
import { useRouter } from 'next/navigation'

interface StoreCard {
    slug: string
    name: string
    logoUrl: string | null
    coverUrl?: string | null
    description?: string
    rating?: number
    ratingCount?: number
    isOpen?: boolean
    distance?: string
    address?: string
    todayHours?: string
    featuredImages?: string[]
    viewCount?: number
}

interface BannerPagoProps {
    stores: StoreCard[]
}

export default function BannerPago({ stores }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    // Ordena lojas por viewCount decrescente (mais vistas primeiro)
    const sortedStores = [...stores].sort(
        (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)
    )

    const totalRealSlides = sortedStores.length

    // Array com clones para loop infinito (somente se houver mais de 1)
    const loopingStores =
        totalRealSlides > 1
            ? [
                sortedStores[totalRealSlides - 1], // clone do último
                ...sortedStores,
                sortedStores[0] // clone do primeiro
            ]
            : sortedStores

    // Índice do slide ativo (começa no primeiro real, índice 1 se >1)
    const [activeIndex, setActiveIndex] = useState<number>(
        totalRealSlides > 1 ? 1 : 0
    )
    const [isTransitioning, setIsTransitioning] = useState(true)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    // ---- Configurações do carrossel ----
    const slideWidthPercent = 80 // largura de cada slide em % do container
    const sideSpacingPercent = (100 - slideWidthPercent) / 2 // margem lateral para centralizar (10%)
    // Espaço total ocupado por um slide (incluindo margens laterais)
    const slideUnitPercent = slideWidthPercent + sideSpacingPercent * 2 // 100% ? Na verdade, vamos usar 80% de largura + 2% de gap = 82% de unidade. Vou simplificar: cada slide terá 80% de largura e um gap de 2% (1% de cada lado). Unidade = 82%.
    const gapPercent = 2
    const unitPercent = slideWidthPercent + gapPercent // 82%

    // ---- Navegação ----
    const goToNext = useCallback(() => {
        if (totalRealSlides <= 1 || !isTransitioning) return
        setActiveIndex((prev) => prev + 1)
    }, [totalRealSlides, isTransitioning])

    const goToPrev = useCallback(() => {
        if (totalRealSlides <= 1 || !isTransitioning) return
        setActiveIndex((prev) => prev - 1)
    }, [totalRealSlides, isTransitioning])

    // ---- Loop infinito: reset ao atingir clones ----
    useEffect(() => {
        if (totalRealSlides <= 1) return

        const handleTransitionEnd = () => {
            if (activeIndex === 0) {
                // clone do último → pular para o último real sem animação
                setIsTransitioning(false)
                setActiveIndex(totalRealSlides)
            } else if (activeIndex === loopingStores.length - 1) {
                // clone do primeiro → pular para o primeiro real
                setIsTransitioning(false)
                setActiveIndex(1)
            }
        }

        const track = trackRef.current
        track?.addEventListener('transitionend', handleTransitionEnd)
        return () => track?.removeEventListener('transitionend', handleTransitionEnd)
    }, [activeIndex, totalRealSlides, loopingStores.length])

    // Reativar transição após o reset (pequeno delay)
    useEffect(() => {
        if (!isTransitioning) {
            const timeout = setTimeout(() => setIsTransitioning(true), 50)
            return () => clearTimeout(timeout)
        }
    }, [isTransitioning])

    // ---- Autoplay ----
    useEffect(() => {
        if (isHovered || isDragging || totalRealSlides <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalRealSlides])

    // ---- Drag manual (arrastar) ----
    const handleDragStart = useCallback(
        (clientX: number) => {
            setIsDragging(true)
            setDragStartX(clientX)
            setDragOffset(0)
        },
        []
    )

    const handleDragMove = useCallback(
        (clientX: number) => {
            if (!isDragging) return
            setDragOffset(clientX - dragStartX)
        },
        [isDragging, dragStartX]
    )

    const handleDragEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
        // Se arrastou mais de 50px, avança/retrocede
        if (dragOffset > 50) {
            goToPrev()
        } else if (dragOffset < -50) {
            goToNext()
        }
        setDragOffset(0)
    }, [isDragging, dragOffset, goToPrev, goToNext])

    // Eventos de mouse e touch
    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        handleDragStart(e.clientX)
    }
    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        e.preventDefault()
        handleDragMove(e.clientX)
    }
    const onMouseUp = () => handleDragEnd()

    const onTouchStart = (e: React.TouchEvent) => {
        handleDragStart(e.touches[0].clientX)
    }
    const onTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return
        handleDragMove(e.touches[0].clientX)
    }
    const onTouchEnd = () => handleDragEnd()

    // ---- Cálculo do translateX ----
    const baseTranslate = -activeIndex * unitPercent + sideSpacingPercent
    const totalTranslate = baseTranslate + dragOffset / (trackRef.current?.clientWidth || 1) * 100

    // Índice real para dots (ignora clones)
    const realIndex =
        totalRealSlides > 1
            ? activeIndex === 0
                ? totalRealSlides - 1
                : activeIndex === loopingStores.length - 1
                    ? 0
                    : activeIndex - 1
            : 0

    if (!sortedStores.length) return null

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Cabeçalho */}
            <div className="flex items-center gap-2 mb-4 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2
                    className="text-sm font-black uppercase tracking-wider"
                    style={{ color: colors.textPrimary }}
                >
                    Lojas em destaque
                </h2>
            </div>

            {/* Container da faixa de slides */}
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
                        willChange: 'transform'
                    }}
                >
                    {loopingStores.map((store, index) => {
                        const distance = index - activeIndex
                        const isActive = distance === 0
                        const isNear = Math.abs(distance) === 1

                        // Estilos dinâmicos baseados na posição
                        const scale = isActive ? 1 : isNear ? 0.92 : 0.85
                        const opacity = isActive ? 1 : isNear ? 0.8 : 0
                        const zIndex = isActive ? 10 : isNear ? 5 : 1
                        const brightness = isActive ? 'brightness(1)' : 'brightness(0.7)'

                        const backgroundImage = store.coverUrl || store.logoUrl
                        const locationInfo = store.distance || store.address

                        return (
                            <div
                                key={`${store.slug}-${index}`}
                                className="flex-shrink-0 px-[1%]"
                                style={{
                                    width: `${slideWidthPercent}%`,
                                    transition: 'transform 0.5s ease, opacity 0.5s ease, filter 0.5s ease',
                                    transform: `scale(${scale})`,
                                    opacity,
                                    zIndex,
                                    filter: brightness,
                                }}
                            >
                                <div
                                    onClick={() => {
                                        if (!isDragging) router.push(`/${store.slug}`)
                                    }}
                                    className="group relative h-72 sm:h-96 lg:h-[30rem] rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02]"
                                    style={{
                                        borderColor: colors.border,
                                        boxShadow: isActive
                                            ? `0 20px 40px ${colors.accent}33`
                                            : colors.shadow,
                                    }}
                                >
                                    {/* Imagem de fundo */}
                                    {backgroundImage ? (
                                        <img
                                            src={backgroundImage}
                                            alt={store.name}
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

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20" />

                                    {/* Badges */}
                                    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                                        {store.isOpen !== undefined && (
                                            <div
                                                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                                                style={{
                                                    background: store.isOpen ? '#10b981' : '#ef4444',
                                                    color: '#ffffff',
                                                }}
                                            >
                                                <Clock size={14} />
                                                <span>
                                                    {store.isOpen ? 'Aberto' : 'Fechado'}
                                                </span>
                                                {store.todayHours && (
                                                    <span className="opacity-90 ml-1 truncate max-w-[80px]">
                                                        {store.todayHours}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute top-4 right-4 z-20">
                                        {store.viewCount !== undefined && store.viewCount > 0 && (
                                            <div
                                                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                                                style={{
                                                    background: '#000000',
                                                    color: '#ffffff',
                                                }}
                                            >
                                                <Eye size={14} />
                                                <span>{store.viewCount}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Conteúdo textual */}
                                    <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-8 text-white">
                                        <div className="flex items-center gap-3 mb-3">
                                            {store.logoUrl && (
                                                <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white/30 flex-shrink-0">
                                                    <img
                                                        src={store.logoUrl}
                                                        alt={store.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            <h3 className="text-xl sm:text-3xl font-black drop-shadow-lg">
                                                {store.name}
                                            </h3>
                                        </div>

                                        {store.description && (
                                            <p className="text-xs sm:text-sm text-white/80 line-clamp-2 mb-3">
                                                {store.description}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/90">
                                            {store.rating != null && store.rating > 0 && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                                    <span className="font-bold">
                                                        {store.rating.toFixed(1)}
                                                    </span>
                                                    {store.ratingCount && (
                                                        <span className="opacity-60 ml-0.5">
                                                            ({store.ratingCount})
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                            {locationInfo && (
                                                <span className="inline-flex items-center gap-1">
                                                    <MapPin size={14} className="text-white/70" />
                                                    <span className="font-bold">{locationInfo}</span>
                                                </span>
                                            )}
                                            {store.featuredImages &&
                                                store.featuredImages.length > 0 && (
                                                    <div className="flex items-center gap-2 mt-1 w-full">
                                                        <div className="flex gap-2">
                                                            {store.featuredImages
                                                                .slice(0, 3)
                                                                .map((img, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="w-10 h-10 rounded-lg overflow-hidden border border-white/30"
                                                                    >
                                                                        <img
                                                                            src={img}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </div>
                                                )}
                                        </div>

                                        {/* Botão "Explorar loja" visível apenas no slide ativo */}
                                        {isActive && (
                                            <div className="mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                                                <span
                                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
                                                    style={{
                                                        background: colors.accent,
                                                        color: colors.accentText,
                                                        boxShadow: `0 8px 20px ${colors.accent}66`,
                                                    }}
                                                >
                                                    Explorar loja
                                                    <ChevronRight size={16} />
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Controles e dots (somente se +1 slide) */}
            {totalRealSlides > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{
                            background: colors.accent,
                            color: colors.accentText,
                        }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {sortedStores.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (totalRealSlides <= 1) return
                                    setIsTransitioning(true)
                                    setActiveIndex(idx + 1) // +1 por causa do clone no início
                                }}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === realIndex ? '1.5rem' : '0.5rem',
                                    background:
                                        idx === realIndex
                                            ? colors.accent
                                            : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{
                            background: colors.accent,
                            color: colors.accentText,
                        }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}