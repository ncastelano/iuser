// src/components/StoreImageCard.tsx
//
// Card de loja da 3.0: a imagem da loja ocupa o card todo; por cima, à esquerda o tipo (ex.: Eletrônicos e Tecnologia)
// e à direita se está aberta ou fechada; embaixo, a foto do dono ao lado do nome. Usado na home e em /lojas.
'use client'

import { Star, Store as StoreIcon } from 'lucide-react'
import { resolveCategoria } from '@/lib/categorias'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface StoreCardItem {
    id: string
    name: string
    slug: string
    logo: string | null
    category: string | null
    rating: number | null
    open: boolean
    /** Dono da loja (aparece ao lado do nome) */
    ownerSlug: string | null
    ownerAvatar: string | null
}

export default function StoreImageCard({ s, onClick, fluid = false, meta }: {
    s: StoreCardItem
    onClick: () => void
    /** Ocupa a coluna inteira (grade) em vez da largura fixa de carrossel */
    fluid?: boolean
    /** Texto curto no lugar da nota (ex.: "94 visitas", "12 pedidos") */
    meta?: string | null
}) {
    const cat = resolveCategoria(s.category)
    const catLabel = cat?.nome || s.category
    const catColor = cat?.color || '#2563eb'
    return (
        <button
            onClick={onClick}
            className={`${fluid ? 'w-full h-[236px]' : 'snap-start flex-shrink-0 w-[208px] sm:w-[232px] h-[268px]'} relative text-left rounded-3xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]`}
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

            <span className="absolute left-3 right-3 bottom-3 flex items-center gap-2.5">
                {s.ownerAvatar ? (
                    <img src={s.ownerAvatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid #fff' }} loading="lazy" />
                ) : (
                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-black" style={{ background: GRADIENT, border: '2px solid #fff' }}>
                        {(s.ownerSlug || s.name).charAt(0).toUpperCase()}
                    </span>
                )}
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black leading-tight truncate text-white">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/85 truncate">
                        {s.ownerSlug && <span className="truncate">@{s.ownerSlug}</span>}
                        {meta ? (
                            <span className="flex-shrink-0">· {meta}</span>
                        ) : s.rating != null ? (
                            <span className="flex items-center gap-0.5 flex-shrink-0"><Star size={10} className="text-yellow-400 fill-yellow-400" />{s.rating.toFixed(1)}</span>
                        ) : null}
                    </span>
                </span>
            </span>
        </button>
    )
}
