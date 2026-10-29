// src/app/(main)/inicio/sections/DigitalShowcase.tsx
//
// "Cursos e produtos digitais" da home 2.0: o mesmo desenho de "Produtos em destaque" (cartões em linha, 3 por vez, que alternam sozinhos).
// Mostra os produtos digitais ativos que já têm conteúdo (curso, aula, playlist, e-book...), os mais vistos primeiro; tocar abre o produto e
// "ver digitais" abre a lista completa (/digitais). Sem nenhum produto digital a seção some, como as outras vitrines.
'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { useTheme } from '@/app/contexts/theme'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import ListingRowCard from '@/components/ListingRowCard'
import { usePagedRotation } from '@/hooks/usePagedRotation'
import { PageDots, PAGE_SLIDE_CSS } from '@/components/PageDots'
import { loadDigitalShowcase, PRODUCT_KIND_LABEL, type ShowcaseItem } from '@/modules/digital'

export const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

export default function DigitalShowcase({ dragHandle }: { dragHandle?: ReactNode }) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const [items, setItems] = useState<ShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        loadDigitalShowcase(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
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
                    <div className="h-6 rounded w-56 animate-pulse" style={{ background: `${colors.border}60` }} />
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
                title="Cursos e produtos digitais"
                subtitle="Vídeo-aulas, cursos, playlists e e-books para comprar e abrir na hora"
                dragHandle={dragHandle}
                action={<ViewServicesButton label="ver digitais" onClick={() => open('/digitais')} />}
            />
            <div {...handlers}>
                <div key={page} className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${dir > 0 ? 'page-in-next' : 'page-in-prev'}`} style={{ touchAction: 'pan-y' }}>
                    {visible.map((p) => (
                        <ListingRowCard
                            key={p.id}
                            title={p.name}
                            description={p.summary}
                            imageUrl={p.imageUrl || p.storeLogo}
                            priceLabel={brl(p.price)}
                            sellerName={p.storeName}
                            sellerImageUrl={p.storeLogo}
                            views={p.viewCount}
                            tag={p.freeItems > 0 ? `${PRODUCT_KIND_LABEL[p.kind]} · aula grátis` : PRODUCT_KIND_LABEL[p.kind]}
                            onClick={() => open(`/${p.storeSlug}/${p.slug}`)}
                        />
                    ))}
                </div>
            </div>
            <PageDots pages={pages} page={page} onGo={goTo} label="Ver cursos e produtos digitais, página" />
            <style>{PAGE_SLIDE_CSS}</style>
        </div>
    )
}
