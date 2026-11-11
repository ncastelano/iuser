// src/app/(main)/inicio/sections/PromoShowcase.tsx
//
// "Promoções das lojas" da home 2.0, logo abaixo do Radar: uma fileira horizontal com as ofertas (combos e produtos com desconto) das lojas ativas, no máximo 3 por loja, as mais
// novas primeiro. Cada loja monta as suas em Painel da loja → Promoções. Sem nenhuma oferta a seção some, como as outras vitrines.
'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { HomeSectionHeader } from './HomeSectionKit'
import PromoCards from '@/components/promotions/PromoCards'
import { fetchHomePromotions, type PromotionShowcaseItem } from '@/modules/promotions'

export default function PromoShowcase({ dragHandle }: { dragHandle?: ReactNode }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<PromotionShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        fetchHomePromotions(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    if (items === null) {
        return (
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[250px] w-[156px] flex-shrink-0 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                </div>
            </div>
        )
    }
    if (items.length === 0) return null

    return (
        <div className="relative w-full">
            <HomeSectionHeader title="Promoções das lojas" subtitle="Combos com desconto montados pelas lojas — toque para ver" dragHandle={dragHandle} action={<span aria-hidden />} />
            <PromoCards items={items} bleed="-mx-4 px-4" />
        </div>
    )
}
