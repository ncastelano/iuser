// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Star, MapPin, Clock, ShoppingBag, Eye } from 'lucide-react'
import { useTheme } from '@/app/theme'
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
    const carouselRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [startX, setStartX] = useState(0)
    const [scrollLeft, setScrollLeft] = useState(0)

    const totalSlides = stores.length

    const nextSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % totalSlides)
    }, [totalSlides])

    const prevSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides)
    }, [totalSlides])

    useEffect(() => {
        if (isHovered || isDragging || totalSlides <= 1) return
        autoPlayRef.current = setInterval(nextSlide, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, nextSlide, totalSlides])

    useEffect(() => {
        if (carouselRef.current) {
            const scrollAmount = carouselRef.current.clientWidth * currentIndex
            carouselRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' })
        }
    }, [currentIndex])

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setStartX(e.pageX - (carouselRef.current?.offsetLeft || 0))
        setScrollLeft(carouselRef.current?.scrollLeft || 0)
    }
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        e.preventDefault()
        const x = e.pageX - (carouselRef.current?.offsetLeft || 0)
        const walk = (x - startX) * 1.5
        if (carouselRef.current) carouselRef.current.scrollLeft = scrollLeft - walk
    }
    const handleMouseUp = () => setIsDragging(false)

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true)
        setStartX(e.touches[0].pageX - (carouselRef.current?.offsetLeft || 0))
        setScrollLeft(carouselRef.current?.scrollLeft || 0)
    }
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return
        const x = e.touches[0].pageX - (carouselRef.current?.offsetLeft || 0)
        const walk = (x - startX) * 1.5
        if (carouselRef.current) carouselRef.current.scrollLeft = scrollLeft - walk
    }
    const handleTouchEnd = () => setIsDragging(false)

    if (!stores.length) return null

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-4 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Lojas em destaque
                </h2>
            </div>

            <div
                ref={carouselRef}
                className="flex overflow-x-hidden scroll-smooth snap-x snap-mandatory"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {stores.map((store, index) => {
                    const isActive = index === currentIndex
                    const backgroundImage = store.coverUrl || store.logoUrl
                    const locationInfo = store.distance || store.address

                    return (
                        <div
                            key={store.slug}
                            className="min-w-[85%] sm:min-w-[70%] lg:min-w-[55%] snap-center px-2"
                        >
                            <div
                                onClick={() => router.push(`/loja/${store.slug}`)}
                                className="group relative h-72 sm:h-96 lg:h-[30rem] rounded-2xl overflow-hidden border transition-all duration-500 cursor-pointer transform hover:scale-[1.02]"
                                style={{
                                    borderColor: colors.border,
                                    boxShadow: isActive ? `0 20px 40px ${colors.accent}33` : colors.shadow,
                                }}
                            >
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

                                {/* Badges superiores */}
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
                                                <span className="opacity-90 ml-1 truncate max-w-[80px]">{store.todayHours}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
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

                                {/* Conteúdo principal */}
                                <div className="relative z-10 flex flex-col justify-end h-full p-6 sm:p-8 text-white">
                                    <div className="flex items-center gap-3 mb-3">
                                        {store.logoUrl && (
                                            <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white/30 flex-shrink-0">
                                                <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" />
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

                                    {/* Informações inferiores */}
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/90">
                                        {(store.rating != null && store.rating > 0) && (
                                            <span className="inline-flex items-center gap-1">
                                                <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                                <span className="font-bold">{store.rating.toFixed(1)}</span>
                                                {store.ratingCount ? (
                                                    <span className="opacity-60 ml-0.5">({store.ratingCount})</span>
                                                ) : null}
                                            </span>
                                        )}
                                        {locationInfo && (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin size={14} className="text-white/70" />
                                                <span className="font-bold">{locationInfo}</span>
                                            </span>
                                        )}
                                        {store.featuredImages && store.featuredImages.length > 0 && (
                                            <div className="flex items-center gap-2 mt-1 w-full">
                                                <div className="flex gap-2">
                                                    {store.featuredImages.slice(0, 3).map((img, i) => (
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
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {totalSlides > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={prevSlide}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {stores.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === currentIndex ? '1.5rem' : '0.5rem',
                                    background: idx === currentIndex ? colors.accent : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={nextSlide}
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