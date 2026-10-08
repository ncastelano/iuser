//app/(main)/inicio/sections/FeaturedServices.tsx
//
// Carrossel de "Meus serviços publicados" (ProfileDashboard) — mesmo padrão
// visual de FeaturedPublications, mas "ver todos" leva pro marketplace de
// serviços (/solicitar-servico, com mapa e filtros) em vez de /procurar-servico
// (que é a busca de trabalho pro prestador, não a vitrine pro cliente).
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceLabel } from '@/lib/serviceTypes'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import PlanAvatarRing from '@/components/PlanAvatarRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ServiceCard {
    id: string
    imageUrl: string | null
    title: string
    slug: string | null
    serviceType: string | null
    providerName: string
    providerSlug: string
    providerImageUrl: string | undefined
    providerId?: string | null
}

function useFeaturedServices() {
    const [services, setServices] = useState<ServiceCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                // Dois tipos, igual em /solicitar-servico: serviços publicados por
                // pessoas (ProfileDashboard) e serviços vendidos por lojas
                // (products.type='service').
                const [{ data: profileRows }, { data: storeRows }] = await Promise.all([
                    supabase
                        .from('products')
                        .select('id, name, slug, image_url, service_type, owner_id, view_count')
                        .eq('listing_type', 'service_offer')
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(30),
                    supabase
                        .from('products')
                        .select('id, name, slug, image_url, store_id, view_count')
                        .eq('type', 'service')
                        .eq('listing_type', 'sale')
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(30),
                ])

                const ownerIds = [...new Set((profileRows || []).map(r => r.owner_id).filter(Boolean))] as string[]
                let profileMap = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
                if (ownerIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .in('id', ownerIds)
                    profileMap = new Map((profiles || []).map(p => [p.id, p]))
                }

                const storeIds = [...new Set((storeRows || []).map(r => r.store_id).filter(Boolean))] as string[]
                let storeMap = new Map<string, { name: string | null; storeSlug: string | null; logo_url: string | null }>()
                if (storeIds.length > 0) {
                    const { data: stores } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url')
                        .in('id', storeIds)
                    storeMap = new Map((stores || []).map(s => [s.id, s]))
                }

                const fromProfiles: (ServiceCard & { viewCount: number })[] = (profileRows || []).map(row => {
                    const p = profileMap.get(row.owner_id)
                    return {
                        id: row.id,
                        imageUrl: row.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(row.image_url).data.publicUrl
                            : null,
                        title: row.name,
                        slug: row.slug || null,
                        serviceType: row.service_type,
                        providerName: p?.name || 'Prestador',
                        providerSlug: p?.profileSlug || '',
                        providerId: row.owner_id,
                        providerImageUrl: getAvatarUrl(supabase, p?.avatar_url),
                        viewCount: row.view_count || 0,
                    }
                })

                const fromStores: (ServiceCard & { viewCount: number })[] = (storeRows || [])
                    .filter(row => row.store_id && storeMap.has(row.store_id))
                    .map(row => {
                        const s = storeMap.get(row.store_id)!
                        return {
                            id: row.id,
                            imageUrl: row.image_url
                                ? supabase.storage.from('product-images').getPublicUrl(row.image_url).data.publicUrl
                                : null,
                            title: row.name,
                            slug: row.slug || null,
                            serviceType: null,
                            providerName: s.name || 'Loja',
                            providerSlug: s.storeSlug || '',
                            providerImageUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : undefined,
                            viewCount: row.view_count || 0,
                        }
                    })

                setServices([...fromProfiles, ...fromStores].sort((a, b) => b.viewCount - a.viewCount))
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
    hideIcon?: boolean
    // Botão "ver serviços" no lado direito do título (vai pro marketplace de serviços)
    onViewAll?: () => void
    // Botão no lado esquerdo da linha de navegação (embaixo dos cards), ex: "publicar serviço"
    leftAction?: ReactNode
    // Frase abaixo do título (some o contador "N serviços" quando há onViewAll, que mostra o total no badge)
    subtitle?: string
    // Linha de botões logo abaixo da frase do título (antes dos cards); recebe o total de serviços
    // (ex: "Oferecer um serviço" + "ver serviços" com badge)
    actions?: (count: number) => ReactNode
}

export default function FeaturedServices({ dragHandle, title = 'Serviços em destaque', maxItems, className = '', hideIcon = false, onViewAll, leftAction, subtitle, actions }: FeaturedServicesProps) {
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
        // Vai pra página do serviço (/<perfil ou loja>/<slug-do-serviço>); sem
        // slug (dado antigo), cai no perfil/loja de quem oferece.
        if (service.providerSlug && service.slug) router.push(`/${service.providerSlug}/${service.slug}`)
        else router.push(service.providerSlug ? `/${service.providerSlug}` : '/solicitar-servico')
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
                        <div key={i} className="aspect-[3/4] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
                    ))}
                </div>
            </div>
        )
    }

    // Sem serviço nenhum a seção some, mas o botão da esquerda (publicar) continua à mão
    if (!services.length) return actions ? <div>{actions(0)}</div> : leftAction ? <div className="flex">{leftAction}</div> : null

    return (
        <div
            className={`relative w-full ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <HomeSectionHeader
                icon={hideIcon ? undefined : Wrench}
                title={title}
                subtitle={subtitle ?? (onViewAll ? undefined : `${services.length} ${services.length === 1 ? 'serviço' : 'serviços'}`)}
                dragHandle={dragHandle}
                action={onViewAll ? <ViewServicesButton onClick={onViewAll} count={services.length} /> : <span />}
            />

            {actions && <div className="-mt-1 mb-4">{actions(services.length)}</div>}

            <div className="relative">
                <div className={`grid ${gridCols} gap-4 transition-all duration-500`}>
                    {currentItems.map((service, idx) => (
                        <div
                            key={`${service.id}-${idx}`}
                            onClick={() => handleServiceClick(service)}
                            className="group relative rounded-3xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
                            style={{ borderColor: colors.border, background: GRADIENT, boxShadow: colors.shadow, aspectRatio: '3/4' }}
                        >
                            {/* A foto é o próprio card; as informações ficam na frente dela */}
                            {service.imageUrl ? (
                                <img
                                    src={service.imageUrl}
                                    alt=""
                                    aria-hidden
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Wrench className="w-14 h-14 text-white opacity-40" />
                                </div>
                            )}
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0.88) 100%)' }} />

                            {service.serviceType && (
                                <span
                                    className="absolute top-3 left-3 z-10 max-w-[80%] truncate text-[11px] font-black px-3 py-1 rounded-full text-white backdrop-blur-md"
                                    style={{ background: 'rgba(249,115,22,0.85)', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}
                                >
                                    {getServiceLabel(service.serviceType)}
                                </span>
                            )}

                            <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10 flex flex-col gap-2.5">
                                <h3 className="text-white font-black text-base leading-tight line-clamp-3" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                                    {service.title}
                                </h3>
                                <div className="flex items-center gap-2 min-w-0 max-w-full">
                                    <PlanAvatarRing userId={service.providerId}>
                                        <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                            {service.providerImageUrl ? (
                                                <img src={service.providerImageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]" style={{ background: GRADIENT }}>
                                                    {service.providerName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    </PlanAvatarRing>
                                    <span className="text-xs font-bold text-white truncate" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{service.providerName}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {(leftAction || totalPages > 1) && (
                    <div className={`flex items-center gap-3 mt-4 ${leftAction ? 'justify-between' : 'justify-center'}`}>
                        {leftAction}
                {totalPages > 1 && (
                        <div className={`flex items-center justify-center gap-3 ${leftAction ? 'ml-auto' : ''}`}>
                            <button
                                onClick={goToPrev}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                                aria-label="Anterior"
                            >
                                <ChevronLeft size={14} />
                            </button>
    
                            <div className={`items-center gap-1.5 ${leftAction ? 'hidden sm:flex' : 'flex'}`}>
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
                )}
            </div>

        </div>
    )
}
