// src/components/StoreImageCard.tsx
//
// Cartão de loja da 3.0 (home "Lojas para conhecer", /lojas e /comprar — um desenho só). Decisão do dono (17/11/2026): o logo é
// REDONDO, como a foto dos perfis, e os detalhes ficam EMBAIXO dele (antes a imagem ocupava o cartão todo e o texto ia por cima).
// Em volta do logo: o anel verde/vermelho de aberta/fechada (o mesmo do cabeçalho da loja) e, por fora, a moldura do NÍVEL da loja
// (`StoreFrame` redondo; o nível 0 não desenha nada). Embaixo: nome, categoria, nota, faixa de preço, entrega e tempo.
'use client'

import { Clock, Star, Store as StoreIcon, Tag, Truck } from 'lucide-react'
import { resolveCategoria } from '@/lib/categorias'
import { useTheme } from '@/app/contexts/theme'
import StoreFrame from '@/components/store/StoreFrame'

export interface StoreCardItem {
    id: string
    name: string
    slug: string
    logo: string | null
    category: string | null
    /** Nível da loja (0 = sem moldura): a moldura do nível vai em volta do logo */
    level?: number
    /** Só existe quando a loja já foi avaliada */
    rating: number | null
    ratingsCount?: number
    open: boolean
    /** "Entrega R$ 10", "Entrega grátis", "Só retirada"... (vazio = não informa) */
    delivery?: string | null
    /** Menor e maior tempo ("20–35 min"; "~" quando é estimativa) */
    time?: string | null
    /** Menor e maior preço dos itens ("R$ 7 – R$ 20") */
    price?: string | null
}

const LOGO = 84

export default function StoreImageCard({ s, onClick, fluid = false }: {
    s: StoreCardItem
    onClick: () => void
    /** Ocupa a coluna inteira (grade) em vez da largura fixa de carrossel */
    fluid?: boolean
}) {
    const { colors } = useTheme()
    const cat = resolveCategoria(s.category)
    const catLabel = cat?.nome || s.category
    const catColor = cat?.color || '#2563eb'
    const status = s.open ? '#16a34a' : '#dc2626'
    return (
        <button
            onClick={onClick}
            className={`${fluid ? 'w-full' : 'snap-start flex-shrink-0 w-[168px] sm:w-[188px]'} text-left rounded-3xl border flex flex-col items-center px-3 pt-4 pb-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]`}
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* logo redondo: anel de aberta/fechada + moldura do nível por fora */}
            <span className="relative flex-shrink-0">
                <StoreFrame level={s.level} size={LOGO + 6} innerRadius={(LOGO + 6) / 2} ring={3} bg={colors.surface}>
                    <span className="block rounded-full p-[3px]" style={{ background: status }}>
                        <span className="block rounded-full overflow-hidden" style={{ width: LOGO, height: LOGO, background: `linear-gradient(135deg, ${catColor}, ${catColor}99)`, boxShadow: `0 0 0 2px ${colors.surface}` }}>
                            {s.logo
                                ? <img src={s.logo} alt="" className="w-full h-full object-cover" loading="lazy" />
                                : <span className="w-full h-full flex items-center justify-center text-white/90"><StoreIcon size={34} /></span>}
                        </span>
                    </span>
                </StoreFrame>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-2 text-[9.5px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ background: status, boxShadow: `0 0 0 2px ${colors.surface}` }}>
                    {s.open ? 'Aberto' : 'Fechado'}
                </span>
            </span>

            <span className="mt-4 w-full flex-shrink-0 flex flex-col items-center text-center gap-1">
                <span className="text-[14px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{s.name}</span>
                {catLabel && <span className="max-w-full truncate text-[10.5px] font-black" style={{ color: catColor }}>{catLabel}</span>}
                <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                    {s.rating != null
                        ? <><Star size={11} className="text-yellow-400 fill-yellow-400" /><span style={{ color: colors.textPrimary }}>{s.rating.toFixed(1)}</span>{s.ratingsCount ? <span>({s.ratingsCount})</span> : null}</>
                        : <span>Nova no iUser</span>}
                </span>
            </span>

            <span className="mt-2 w-full flex flex-col gap-0.5 text-[10.5px] font-bold" style={{ color: colors.textSecondary }}>
                {s.price && <span className="flex items-center justify-center gap-1 min-w-0"><Tag size={10} className="flex-shrink-0" /><span className="truncate">{s.price}</span></span>}
                {(s.delivery || s.time) && (
                    <span className="flex items-center justify-center gap-x-2 flex-wrap">
                        {s.delivery && <span className="flex items-center gap-1 min-w-0"><Truck size={10} className="flex-shrink-0" /><span className="truncate">{s.delivery}</span></span>}
                        {s.time && <span className="flex items-center gap-1"><Clock size={10} className="flex-shrink-0" />{s.time}</span>}
                    </span>
                )}
            </span>
        </button>
    )
}
