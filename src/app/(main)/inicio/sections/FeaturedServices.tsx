//app/(main)/inicio/sections/FeaturedServices.tsx
//
// Carrossel de "Meus serviços publicados" (ProfileDashboard) — mesmo padrão
// visual de FeaturedPublications, mas "ver todos" leva pro marketplace de
// serviços (/solicitar-servico, com mapa e filtros) em vez de /procurar-servico
// (que é a busca de trabalho pro prestador, não a vitrine pro cliente).
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Wrench, Eye } from 'lucide-react'
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
    // null/0 = a combinar. unit: 'hora', 'dia'... quando a categoria do serviço é 'por hora', 'por dia'...
    createdAt: string | null
    viewCount: number
    price: number | null
    unit: string | null
    // Especialidade/categoria da loja (ex.: Psicoterapia), quando não há um tipo de serviço
    category: string | null
}

const parseUnit = (category: string | null | undefined) => {
    const m = (category || '').trim().toLowerCase().match(/^por\s+(.+)$/)
    return m ? m[1] : null
}

const formatServicePrice = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Intercala por quem oferece: uma "rodada" pega o melhor serviço de cada loja/pessoa, depois o segundo de cada uma...
// Assim os serviços da mesma loja não aparecem lado a lado (só sobram juntos quando é a única opção restante).
function spreadByProvider<T extends { providerSlug: string; providerName: string; providerId?: string | null }>(sorted: T[]): T[] {
    const groups = new Map<string, T[]>()
    for (const item of sorted) {
        const key = item.providerId || item.providerSlug || item.providerName
        const list = groups.get(key)
        if (list) list.push(item)
        else groups.set(key, [item])
    }
    // as listas já vêm da mais vista pra menos; os grupos ficam na ordem do melhor serviço de cada um
    const queues = Array.from(groups.values())
    const result: T[] = []
    let last: string | null = null
    while (queues.some((q) => q.length)) {
        let progressed = false
        for (const q of queues) {
            if (!q.length) continue
            const key = q[0].providerId || q[0].providerSlug || q[0].providerName
            // não repete o mesmo logo em seguida se existir outra opção nesta rodada
            if (key === last && queues.some((o) => o.length && (o[0].providerId || o[0].providerSlug || o[0].providerName) !== key)) continue
            result.push(q.shift()!)
            last = key
            progressed = true
        }
        if (!progressed) { // só sobrou o mesmo provider
            for (const q of queues) while (q.length) result.push(q.shift()!)
        }
    }
    return result
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
                        .select('id, name, slug, image_url, service_type, owner_id, view_count, price, category, created_at')
                        .eq('listing_type', 'service_offer')
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(30),
                    supabase
                        .from('products')
                        .select('id, name, slug, image_url, store_id, view_count, price, category, created_at')
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
                        createdAt: row.created_at || null,
                        price: row.price != null && Number(row.price) > 0 ? Number(row.price) : null,
                        unit: parseUnit(row.category),
                        category: parseUnit(row.category) ? null : (row.category || null),
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
                            createdAt: row.created_at || null,
                        price: row.price != null && Number(row.price) > 0 ? Number(row.price) : null,
                            unit: parseUnit(row.category),
                            category: parseUnit(row.category) ? null : (row.category || null),
                            viewCount: row.view_count || 0,
                        }
                    })

                setServices(spreadByProvider([...fromProfiles, ...fromStores].sort((a, b) => b.viewCount - a.viewCount)))
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
                        <div key={i} className="h-72 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
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
                    {currentItems.map((service, idx) => {
                        const label = service.serviceType ? getServiceLabel(service.serviceType) : service.category
                        return (
                            <div
                                key={`${service.id}-${idx}`}
                                onClick={() => handleServiceClick(service)}
                                className="group rounded-3xl overflow-hidden flex flex-col cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                            >
                                {/* Capa: a foto do serviço inteira sobre uma cópia desfocada dela; sem foto, o ícone */}
                                <div className="relative h-36 w-full overflow-hidden flex-shrink-0" style={{ background: service.imageUrl ? '#0b1220' : GRADIENT }}>
                                    {service.imageUrl ? (
                                        <>
                                            <img src={service.imageUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-60" loading="lazy" />
                                            <img src={service.imageUrl} alt={service.title} className="relative w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Wrench size={40} color="rgba(255,255,255,0.85)" />
                                        </div>
                                    )}
                                    {service.viewCount > 0 && (
                                        <span className="absolute right-2.5 top-2.5 flex items-center gap-1 text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}>
                                            <Eye size={11} />
                                            {service.viewCount}
                                        </span>
                                    )}
                                </div>

                                <div className="p-3.5 flex flex-col gap-2 flex-1">
                                    <p className="text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{service.title}</p>

                                    {label && (
                                        <span className="self-start max-w-full truncate text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}15`, color: colors.accent }}>
                                            {label}
                                        </span>
                                    )}

                                    {/* Só mostra o valor quando o serviço tem um */}
                                    {service.price ? (
                                        <p className="font-black leading-tight" style={{ color: '#f97316' }}>
                                            <span className="text-lg">{formatServicePrice(service.price)}</span>
                                            {service.unit && <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}> por {service.unit}</span>}
                                        </p>
                                    ) : null}

                                    <div className="flex items-center gap-2 min-w-0 mt-auto pt-1">
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
                                        <span className="text-xs font-bold truncate flex-1" style={{ color: colors.textPrimary }}>{service.providerName}</span>
                                    </div>

                                    <span
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm text-white transition-transform group-hover:scale-[1.02]"
                                        style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                                    >
                                        <Wrench size={15} />
                                        Ver serviço
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {(leftAction || totalPages > 1) && (
                    <div className={`flex items-center gap-3 mt-4 ${leftAction ? 'justify-between' : 'justify-center'}`}>
                        {leftAction}
                {totalPages > 1 && (
                        <div className={`flex items-center justify-center gap-3 ${leftAction ? 'ml-auto' : ''}`}>
                            <button
                                onClick={goToPrev}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-md"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                                aria-label="Anterior"
                            >
                                <ChevronLeft size={18} />
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
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-md"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                                aria-label="Próximo"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                        </div>
                )}
            </div>

        </div>
    )
}
