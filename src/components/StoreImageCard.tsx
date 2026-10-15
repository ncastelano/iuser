// src/components/StoreImageCard.tsx
//
// Card de loja da 3.0: a imagem da loja ocupa o card todo; por cima, à esquerda o tipo (ex.: Eletrônicos e Tecnologia)
// e à direita se está aberta ou fechada; embaixo, a foto do dono ao lado do nome. Usado na home e em /lojas.
'use client'

import { Clock, Star, Store as StoreIcon, Tag, Truck } from 'lucide-react'
import { resolveCategoria } from '@/lib/categorias'

export interface StoreCardItem {
    id: string
    name: string
    slug: string
    logo: string | null
    category: string | null
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

export default function StoreImageCard({ s, onClick, fluid = false }: {
    s: StoreCardItem
    onClick: () => void
    /** Ocupa a coluna inteira (grade) em vez da largura fixa de carrossel */
    fluid?: boolean
}) {
    const cat = resolveCategoria(s.category)
    const catLabel = cat?.nome || s.category
    const catColor = cat?.color || '#2563eb'
    return (
        <button
            onClick={onClick}
            className={`${fluid ? 'w-full h-[270px]' : 'snap-start flex-shrink-0 w-[208px] sm:w-[232px] h-[280px]'} relative text-left rounded-3xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]`}
            style={{ background: `linear-gradient(135deg, ${catColor}, ${catColor}99)` }}
        >
            {s.logo ? (
                <img src={s.logo} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
                <span className="absolute inset-0 flex items-center justify-center text-white/90"><StoreIcon size={56} /></span>
            )}
            {/* escurece em cima e embaixo pra os selos e o nome ficarem legíveis em qualquer imagem */}
            <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.82) 100%)' }} />

            <span className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2">
                {catLabel ? (
                    <span className="max-w-[64%] text-[10px] font-black leading-tight px-2 py-1 rounded-xl text-white" style={{ background: catColor }}>
                        {catLabel}
                    </span>
                ) : <span />}
                <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full text-white" style={{ background: s.open ? '#16a34a' : '#dc2626' }}>
                    {s.open ? 'Aberto' : 'Fechado'}
                </span>
            </span>

            <span className="absolute left-3 right-3 bottom-3 flex flex-col gap-1.5">
                <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-black leading-tight text-white line-clamp-2">{s.name}</span>
                    {s.rating != null && (
                        <span className="flex items-center gap-0.5 flex-shrink-0 text-[11px] font-black text-white">
                            <Star size={11} className="text-yellow-400 fill-yellow-400" />{s.rating.toFixed(1)}
                        </span>
                    )}
                </span>
                {s.price && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-white/90"><Tag size={11} className="flex-shrink-0" /><span className="truncate">{s.price}</span></span>
                )}
                {(s.delivery || s.time) && (
                    <span className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-[11px] font-bold text-white/90">
                        {s.delivery && <span className="flex items-center gap-1"><Truck size={11} className="flex-shrink-0" />{s.delivery}</span>}
                        {s.time && <span className="flex items-center gap-1"><Clock size={11} className="flex-shrink-0" />{s.time}</span>}
                    </span>
                )}
            </span>
        </button>
    )
}
