// src/components/v3/PromoStrip.tsx
//
// "Promoções das lojas" da home 3.0, logo abaixo do bloco do Radar ("Ver ao redor"): a mesma fileira horizontal de cartões da 2.0 no cabeçalho das outras vitrines da 3.0.
// Sem nenhuma oferta, a seção some.
'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import PromoCards from '@/components/promotions/PromoCards'
import { fetchHomePromotions, type PromotionShowcaseItem } from '@/modules/promotions'

export default function PromoStrip({ className = 'mt-7' }: { className?: string }) {
    const { colors } = useTheme()
    const [items, setItems] = useState<PromotionShowcaseItem[] | null>(null)

    useEffect(() => {
        let alive = true
        fetchHomePromotions(12).then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
        return () => { alive = false }
    }, [])

    if (items !== null && items.length === 0) return null
    return (
        <section className={className}>
            <div className="mb-3">
                <h2 className="text-lg font-black leading-tight flex items-center gap-1.5" style={{ color: '#dc2626' }}><Flame size={20} /> Promoções das lojas</h2>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Combos com desconto montados pelas lojas</p>
            </div>
            {items === null
                ? <div className="flex gap-3 overflow-hidden -mx-6 px-6">{[0, 1, 2].map((i) => <div key={i} className="h-[250px] w-[156px] flex-shrink-0 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}</div>
                : <PromoCards items={items} />}
        </section>
    )
}
