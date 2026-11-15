// src/components/promotions/ComboCollage.tsx
//
// Colagem das FOTOS DOS ITENS de um combo (até 4; o resto vira "+N"), usada no cartão do combo quando a loja não enviou uma foto própria: assim a pessoa vê o que vem dentro e entende
// que é um combo. Preenche o contêiner (use um pai `relative` com tamanho). Item com quantidade maior que 1 leva o selo "2×". Regra do layout em modules/promotions (`collageLayout`).
'use client'

import { collageLayout, type CollageItem } from '@/modules/promotions'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function ComboCollage({ items, className = '', chips = true }: { items: CollageItem[]; className?: string; chips?: boolean }) {
    const { tiles, extra } = collageLayout(items.length)
    const shown = items.slice(0, tiles)
    const grid = tiles === 1 ? '' : 'grid-cols-2' + (tiles >= 3 ? ' grid-rows-2' : '')
    return (
        <div className={`absolute inset-0 grid gap-[2px] ${grid} ${className}`} style={{ background: 'rgba(0,0,0,0.45)' }} aria-hidden>
            {shown.map((it, i) => (
                <div key={i} className={`relative overflow-hidden ${tiles === 3 && i === 0 ? 'row-span-2' : ''}`} style={{ background: GRADIENT }}>
                    {it.image_url
                        ? <img src={it.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                        : <span className="absolute inset-0 flex items-center justify-center text-white/90 text-xl font-black">{it.name.trim().charAt(0).toUpperCase()}</span>}
                    {chips && it.quantity > 1 && (
                        <span className="absolute right-1 bottom-1 text-[10px] font-black px-1.5 py-px rounded-full text-white" style={{ background: 'rgba(0,0,0,0.65)' }}>{it.quantity}×</span>
                    )}
                    {extra > 0 && i === tiles - 1 && (
                        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-lg" style={{ background: 'rgba(0,0,0,0.55)' }}>+{extra}</span>
                    )}
                </div>
            ))}
        </div>
    )
}
