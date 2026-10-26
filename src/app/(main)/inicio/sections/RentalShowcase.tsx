// src/app/(main)/inicio/sections/RentalShowcase.tsx
//
// "Imóveis para alugar" da home 2.0: o mesmo desenho de "Produtos em destaque" (cartões em linha, 3 por vez, que alternam sozinhos).
// Mostra os imóveis ativos mais novos; tocar abre o imóvel e "ver imóveis" abre a busca (/imoveis, que abre na casca da 3.0
// porque o aluguel só existe lá). Sem imóveis anunciados a seção some, como a de produtos.
'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { useTheme } from '@/app/contexts/theme'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import ListingRowCard from '@/components/ListingRowCard'
import { usePagedRotation } from '@/hooks/usePagedRotation'
import { PageDots, PAGE_SLIDE_CSS } from '@/components/PageDots'
import { PROPERTY_TYPES, priceLabel, specsLine } from '@/modules/rentals/domain'
import { loadRentalListings, type RentalCard } from '@/modules/rentals/load'

export default function RentalShowcase({ dragHandle }: { dragHandle?: ReactNode }) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const [items, setItems] = useState<RentalCard[] | null>(null)

    useEffect(() => {
        let alive = true
        loadRentalListings(supabase).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    const list = items ?? []
    const { page, dir, pages, goTo, handlers, visibleRange } = usePagedRotation(list.length, 3)
    const visible = list.slice(visibleRange[0], visibleRange[1])

    if (items === null) {
        return (
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[130px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                </div>
            </div>
        )
    }
    if (list.length === 0) return null

    const open = (path: string) => { startNavProgress(); router.push(path) }

    return (
        <div className="relative w-full">
            <HomeSectionHeader
                title="Imóveis para alugar"
                subtitle={`${list.length} ${list.length === 1 ? 'imóvel' : 'imóveis'}`}
                dragHandle={dragHandle}
                action={<ViewServicesButton label="ver imóveis" onClick={() => open('/imoveis')} />}
            />
            <div {...handlers}>
                <div key={page} className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${dir > 0 ? 'page-in-next' : 'page-in-prev'}`} style={{ touchAction: 'pan-y' }}>
                    {visible.map((l) => (
                        <ListingRowCard
                            key={l.id}
                            title={l.title}
                            description={[l.neighborhood, specsLine(l)].filter(Boolean).join(' · ')}
                            imageUrl={l.photos[0] || l.storeLogo || l.ownerAvatar}
                            priceLabel={priceLabel(l)}
                            sellerName={l.storeName || l.ownerName || 'Anunciante'}
                            sellerImageUrl={l.storeLogo || l.ownerAvatar}
                            sellerId={l.ownerId}
                            views={l.viewCount}
                            tag={PROPERTY_TYPES.find((t) => t.id === l.propertyType)?.label ?? null}
                            onClick={() => open(`/imoveis/${l.slug}`)}
                        />
                    ))}
                </div>
            </div>
            <PageDots pages={pages} page={page} onGo={goTo} label="Ver imóveis, página" />
            <style>{PAGE_SLIDE_CSS}</style>
        </div>
    )
}
