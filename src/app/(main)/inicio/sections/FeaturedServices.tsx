//app/(main)/inicio/sections/FeaturedServices.tsx
//
// Carrossel de "Meus serviços publicados" (ProfileDashboard) — mesmo padrão
// visual de FeaturedPublications, mas "ver todos" leva pro marketplace de
// serviços (/solicitar-servico, com mapa e filtros) em vez de /procurar-servico
// (que é a busca de trabalho pro prestador, não a vitrine pro cliente).
'use client'

import { useState, useEffect, useMemo, ReactNode } from 'react'
import SeenBox from '@/components/SeenBox'
import { usePagedRotation } from '@/hooks/usePagedRotation'
import { PageDots, PAGE_SLIDE_CSS } from '@/components/PageDots'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Wrench } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceLabel } from '@/lib/serviceTypes'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import ListingRowCard from '@/components/ListingRowCard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ServiceCard {
    id: string
    imageUrl: string | null
    title: string
    description: string | null
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
                        .select('id, name, slug, description, image_url, service_type, owner_id, view_count, price, category, created_at')
                        .eq('listing_type', 'service_offer')
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(30),
                    supabase
                        .from('products')
                        .select('id, name, slug, description, image_url, store_id, view_count, price, category, created_at')
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
                        description: row.description || null,
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
                            description: row.description || null,
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

    const { services, loading } = useFeaturedServices()
    const { userId } = useProfile()

    const displayServices = useMemo(() => (
        maxItems && services.length > maxItems ? services.slice(0, maxItems) : services
    ), [services, maxItems])

    // 3 por vez; passa de 3 em 3 sem repetir até mostrar todos; deslizar/pontinhos também trocam
    const PAGE = 3
    const { page, dir, pages, goTo, handlers, visibleRange } = usePagedRotation(displayServices.length, PAGE)
    const visible = displayServices.slice(visibleRange[0], visibleRange[1])

    // Passar o mouse por cima conta como visualização do serviço (uma vez por sessão; o dono olhando o dele não conta)
    const countHover = (service: ServiceCard) => {
        if (service.providerId && service.providerId === userId) return
        supabase.rpc('increment_product_view_count', { p_product_id: service.id }).then(() => {}, () => {})
    }

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
                <div className="grid grid-rows-2 grid-flow-col auto-cols-[minmax(280px,86%)] sm:auto-cols-[330px] gap-3 overflow-hidden">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-[130px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
                    ))}
                </div>
            </div>
        )
    }

    // Sem serviço nenhum a seção some, mas o botão da esquerda (publicar) continua à mão
    if (!services.length) return actions ? <div>{actions(0)}</div> : leftAction ? <div className="flex">{leftAction}</div> : null

    return (
        <div className={`relative w-full ${className}`}>
            <HomeSectionHeader
                icon={hideIcon ? undefined : Wrench}
                title={title}
                subtitle={subtitle ?? (onViewAll ? undefined : `${services.length} ${services.length === 1 ? 'serviço' : 'serviços'}`)}
                dragHandle={dragHandle}
                action={onViewAll ? <ViewServicesButton onClick={onViewAll} count={services.length} /> : <span />}
            />

            {actions && <div className="-mt-1 mb-4">{actions(services.length)}</div>}

            {/* 3 cartões por vez; passa de 3 em 3 sem repetir até mostrar todos (deslizar ou pontinhos também trocam) */}
            <div {...handlers}>
                <div key={page} className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${dir > 0 ? 'page-in-next' : 'page-in-prev'}`} style={{ touchAction: 'pan-y' }}>
                    {visible.map((service) => (
                        <SeenBox
                            key={service.id}
                            onSeen={() => countHover(service)}
                            seenKey={`product:${service.id}`}
                            dwellMs={2_000_000_000}
                        >
                            <ListingRowCard
                                title={service.title}
                                description={service.description}
                                imageUrl={service.imageUrl}
                                fallbackIcon={<Wrench size={30} />}
                                priceLabel={service.price ? formatServicePrice(service.price) : null}
                                priceNote={service.price && service.unit ? `por ${service.unit}` : null}
                                sellerName={service.providerName}
                                sellerImageUrl={service.providerImageUrl}
                                sellerId={service.providerId}
                                views={service.viewCount}
                                tag={service.serviceType ? getServiceLabel(service.serviceType) : service.category}
                                onClick={() => handleServiceClick(service)}
                            />
                        </SeenBox>
                    ))}
                </div>
            </div>
            <PageDots pages={pages} page={page} onGo={goTo} label="Ver serviços, página" />
            <style>{PAGE_SLIDE_CSS}</style>

            {leftAction && <div className="flex mt-1">{leftAction}</div>}
        </div>
    )
}
