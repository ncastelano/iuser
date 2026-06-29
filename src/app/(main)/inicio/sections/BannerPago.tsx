// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Star, MapPin, Clock, ShoppingBag } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'

interface StoreCard {
    slug: string
    name: string
    logoUrl: string | null
    coverUrl?: string | null
    description?: string
    rating?: number
    isOpen?: boolean
    distance?: string
    featuredProducts?: string
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
            >
                {stores.map((store, index) => {
                    const isActive = index === currentIndex
                    const backgroundImage = store.coverUrl || store.logoUrl

                    return (
                        <div
                            key={store.slug}
                            className="min-w-[85%] sm:min-w-[70%] lg:min-w-[55%] snap-center px-2"
                        >
                            <div
                                onClick={() => router.push(`/loja/${store.slug}`)}
                                className="group relative h-72 sm:h-96 lg:h-[28rem] rounded-2xl overflow-hidden border transition-all duration-500 cursor-pointer transform hover:scale-[1.02]"
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

                                    <div className="flex flex-wrap items-center gap-2">
                                        {store.rating && store.rating > 0 && (
                                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
                                                <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                                <span className="text-xs font-bold text-white">{store.rating.toFixed(1)}</span>
                                            </div>
                                        )}
                                        {store.distance && (
                                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
                                                <MapPin size={14} className="text-white/70" />
                                                <span className="text-xs font-bold text-white">{store.distance}</span>
                                            </div>
                                        )}
                                        {store.isOpen !== undefined && (
                                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
                                                <Clock size={14} className={store.isOpen ? 'text-green-400' : 'text-red-400'} />
                                                <span className={`text-xs font-bold ${store.isOpen ? 'text-green-400' : 'text-red-400'}`}>
                                                    {store.isOpen ? 'Aberto' : 'Fechado'}
                                                </span>
                                            </div>
                                        )}
                                        {store.featuredProducts && (
                                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
                                                <ShoppingBag size={14} className="text-white/70" />
                                                <span className="text-xs font-bold text-white/90">{store.featuredProducts}</span>
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

                                {isActive && (
                                    <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-white shadow-lg" />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {totalSlides > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 hover:bg-black/50 transition-all"
                    >
                        <ChevronLeft size={24} className="text-white" />
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md bg-black/30 hover:bg-black/50 transition-all"
                    >
                        <ChevronRight size={24} className="text-white" />
                    </button>
                </>
            )}

            {totalSlides > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    {stores.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className="h-1.5 rounded-full transition-all duration-300"
                            style={{
                                width: idx === currentIndex ? '2rem' : '0.5rem',
                                background: idx === currentIndex ? colors.accent : colors.border,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}