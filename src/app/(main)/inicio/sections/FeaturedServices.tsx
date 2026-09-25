//app/(main)/inicio/sections/FeaturedServices.tsx
//
// Carrossel de "Meus serviços publicados" (ProfileDashboard) — mesmo padrão
// visual de FeaturedPublications, mas "ver todos" leva pro marketplace de
// serviços (/solicitar-servico, com mapa e filtros) em vez de /procurar-servico
// (que é a busca de trabalho pro prestador, não a vitrine pro cliente).
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Wrench, ArrowRight } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceLabel } from '@/lib/serviceTypes'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ServiceCard {
    id: string
    imageUrl: string | null
    title: string
    serviceType: string | null
    providerName: string
    providerSlug: string
    providerImageUrl: string | undefined
}

function useFeaturedServices() {
    const [services, setServices] = useState<ServiceCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const { data: rows, error } = await supabase
                    .from('products')
                    .select('id, name, image_url, service_type, owner_id')
                    .eq('listing_type', 'service_offer')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(30)

                if (error || !rows || rows.length === 0) {
                    setServices([])
                    setLoading(false)
                    return
                }

                const ownerIds = [...new Set(rows.map(r => r.owner_id).filter(Boolean))] as string[]
                let profileMap = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
                if (ownerIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .in('id', ownerIds)
                    profileMap = new Map((profiles || []).map(p => [p.id, p]))
                }

                const cards: ServiceCard[] = rows.map(row => {
                    const p = profileMap.get(row.owner_id)
                    return {
                        id: row.id,
                        imageUrl: row.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(row.image_url).data.publicUrl
                            : null,
                        title: row.name,
                        serviceType: row.service_type,
                        providerName: p?.name || 'Prestador',
                        providerSlug: p?.profileSlug || '',
                        providerImageUrl: getAvatarUrl(supabase, p?.avatar_url),
                    }
                })

                setServices(cards)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    return { services, loading }
}

function useBreakpoint() {
    const [itemsPerView, setItemsPerView] = useState(4)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1280) setItemsPerView(6)
            else if (width >= 1024) setItemsPerView(5)
            else if (width >= 768) setItemsPerView(4)
            else if (width >= 500) setItemsPerView(3)
            else setItemsPerView(2)
        }
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return itemsPerView
}

interface FeaturedServicesProps {
    dragHandle?: ReactNode
    title?: string
    maxItems?: number
    className?: string
}

export default function FeaturedServices({ dragHandle, title = 'Serviços em destaque', maxItems, className = '' }: FeaturedServicesProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { services, loading } = useFeaturedServices()
    const itemsPerView = useBreakpoint()

    const displayServices = useMemo(() => (
        maxItems && services.length > maxItems ? services.slice(0, maxItems) : services
    ), [services, maxItems])

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const totalPages = Math.max(1, Math.ceil(displayServices.length / itemsPerView))

    useEffect(() => {
        if (isHovered || totalPages <= 1 || displayServices.length === 0) {
            if (autoPlayRef.current) { clearInterval(autoPlayRef.current); autoPlayRef.current = null }
            return
        }
        autoPlayRef.current = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % totalPages)
        }, 5000)
        return () => {
            if (autoPlayRef.current) { clearInterval(autoPlayRef.current); autoPlayRef.current = null }
        }
    }, [isHovered, totalPages, displayServices.length])

    useEffect(() => { setCurrentIndex(0) }, [itemsPerView])

    const goToNext = useCallback(() => setCurrentIndex(prev => (prev + 1) % totalPages), [totalPages])
    const goToPrev = useCallback(() => setCurrentIndex(prev => (prev - 1 + totalPages) % totalPages), [totalPages])
    const goToPage = useCallback((page: number) => setCurrentIndex(page), [])

    const currentItems = useMemo(() => {
        if (displayServices.length === 0) return []
        const start = currentIndex * itemsPerView
        const items: ServiceCard[] = []
        for (let i = 0; i < itemsPerView; i++) {
            items.push(displayServices[(start + i) % displayServices.length])
        }
        return items
    }, [displayServices, currentIndex, itemsPerView])

    const gridCols = itemsPerView >= 6 ? 'grid-cols-6'
        : itemsPerView >= 5 ? 'grid-cols-5'
            : itemsPerView >= 4 ? 'grid-cols-4'
                : itemsPerView >= 3 ? 'grid-cols-3'
                    : 'grid-cols-2'

    const handleServiceClick = (service: ServiceCard) => {
        startNavProgress()
        router.push(service.providerSlug ? `/${service.providerSlug}` : '/solicitar-servico')
    }

    const handleViewAll = () => {
        startNavProgress()
        router.push('/solicitar-servico')
    }

    if (loading) {
        return (
            <div className={`w-full ${className}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        {dragHandle}
                        <div className="h-6 rounded w-40 animate-pulse" style={{ background: `${colors.border}60` }} />
                    </div>
                </div>
                <div className={`grid ${gridCols} gap-4`}>
                    {Array.from({ length: Math.min(itemsPerView, 6) }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] rounded-xl animate-pulse" style={{ background: `${colors.border}40` }} />
                    ))}
                </div>
            </div>
        )
    }

    if (!services.length) return null

    return (
        <div
            className={`relative w-full ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>{title}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                        {services.length}
                    </span>
                </div>

                <button
                    onClick={handleViewAll}
                    className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap"
                    style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 2px 8px rgba(249, 115, 22, 0.3)` }}
                >
                    <span>Ver todos os serviços</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="relative">
                <div className={`grid ${gridCols} gap-4 transition-all duration-500`}>
                    {currentItems.map((service, idx) => (
                        <div
                            key={`${service.id}-${idx}`}
                            onClick={() => handleServiceClick(service)}
                            className="group relative rounded-xl overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                            style={{ borderColor: colors.border, background: colors.surface, aspectRatio: '3/4' }}
                        >
                            {service.imageUrl ? (
                                <>
                                    <img
                                        src={service.imageUrl}
                                        alt={service.title}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: GRADIENT, opacity: 0.3 }}>
                                    <Wrench className="w-12 h-12 opacity-30" style={{ color: colors.textPrimary }} />
                                </div>
                            )}

                            <div className="absolute top-2 left-2 z-10">
                                <div className="w-8 h-8 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 shadow-lg">
                                    {service.providerImageUrl ? (
                                        <img src={service.providerImageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs" style={{ background: GRADIENT }}>
                                            {service.providerName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                                {service.serviceType && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-orange-300 drop-shadow">
                                        {getServiceLabel(service.serviceType)}
                                    </span>
                                )}
                                <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 drop-shadow-lg">
                                    {service.title}
                                </h3>
                            </div>

                            <div
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
                                style={{ boxShadow: `inset 0 0 40px ${colors.accent}30`, border: `2px solid ${colors.accent}40` }}
                            />
                        </div>
                    ))}
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                        <button
                            onClick={goToPrev}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{ background: GRADIENT, color: '#ffffff' }}
                            aria-label="Anterior"
                        >
                            <ChevronLeft size={14} />
                        </button>

                        <div className="flex items-center gap-1.5">
                            {Array.from({ length: totalPages }).map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => goToPage(idx)}
                                    className="rounded-full transition-all duration-300"
                                    style={{
                                        width: idx === currentIndex ? '1.2rem' : '0.5rem',
                                        height: '0.5rem',
                                        background: idx === currentIndex ? '#f97316' : colors.border,
                                        boxShadow: idx === currentIndex ? `0 0 8px #f9731650` : 'none',
                                    }}
                                    aria-label={`Ir para página ${idx + 1}`}
                                />
                            ))}
                        </div>

                        <span className="text-xs font-medium px-2" style={{ color: colors.textPrimary }}>
                            {currentIndex + 1}/{totalPages}
                        </span>

                        <button
                            onClick={goToNext}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{ background: GRADIENT, color: '#ffffff' }}
                            aria-label="Próximo"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
