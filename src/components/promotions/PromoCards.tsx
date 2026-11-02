// src/components/promotions/PromoCards.tsx
//
// Fileira HORIZONTAL das promoções das lojas (vitrine da home 2.0 e 3.0): cartões altos com a foto de fundo, selo de desconto, a loja e o "de/por". Tocar abre a página do
// combo na loja. É a mesma linguagem da seção de promoções do catálogo (`catalogo/PromoRail`), só que mostra de que loja é cada oferta.
'use client'

import { Flame } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import ComboCollage from '@/components/promotions/ComboCollage'
import { usesCollage, type PromotionShowcaseItem } from '@/modules/promotions'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

export default function PromoCards({ items, bleed = '-mx-6 px-6' }: { items: PromotionShowcaseItem[]; bleed?: string }) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const open = (p: PromotionShowcaseItem) => { startNavProgress(); router.push(`/${p.store_slug}/${p.slug}`) }
    return (
        <div className={`flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide ${bleed} pb-2 scroll-pl-6`}>
            {items.map((p) => {
                // combo sem foto enviada pela loja: as fotos dos itens juntas; com foto enviada, a foto de fundo
                const collage = usesCollage(p, p.items.length)
                return (
                <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => open(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter') open(p) }}
                    aria-label={`${p.name}, ${brl(p.price)}, ${p.discount_pct}% de desconto, ${p.store_name}`}
                    className="relative flex-shrink-0 snap-start w-[156px] h-[250px] rounded-3xl overflow-hidden cursor-pointer text-left transition active:scale-[0.98]"
                    style={{ background: GRADIENT, boxShadow: '0 8px 22px rgba(220,38,38,0.22)' }}
                >
                    {collage ? (
                        <>
                            <div className="absolute inset-x-0 top-0 h-[56%] overflow-hidden"><ComboCollage items={p.items} /></div>
                            <div className="absolute inset-x-0 bottom-0 h-[46%] pointer-events-none" style={{ background: 'linear-gradient(160deg, #b91c1c, #431407)' }} />
                            <div className="absolute inset-x-0 top-[38%] h-[18%] pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(67,20,7,0.85), rgba(67,20,7,0))' }} />
                        </>
                    ) : (
                        <>
                            {p.image_url
                                ? <img src={p.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                                : <span className="absolute inset-0 flex items-center justify-center text-white/90 text-4xl font-black">{p.name.trim().charAt(0).toUpperCase()}</span>}
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0) 74%)' }} />
                        </>
                    )}
                    <span className="absolute left-2 top-2 text-[11px] font-black px-2 py-1 rounded-full text-white flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}>
                        <Flame size={11} />-{p.discount_pct}%
                    </span>
                    <span className="absolute right-2 top-2 w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-black text-white" style={{ background: GRADIENT, boxShadow: '0 0 0 2px #fff' }}>
                        {p.store_logo ? <img src={p.store_logo} alt="" className="w-full h-full object-cover" /> : p.store_name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-2.5 flex flex-col gap-0.5">
                        {collage && <span className="self-start text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white/90" style={{ background: 'rgba(255,255,255,0.18)' }}>Combo · {p.items.length} {p.items.length === 1 ? 'item' : 'itens'}</span>}
                        <h3 className="text-[12.5px] font-black leading-snug text-white" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{p.name}</h3>
                        <p className="text-[10.5px] font-semibold text-white/80 truncate">{p.store_name}</p>
                        <p className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-base font-black text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{brl(p.price)}</span>
                            <span className="text-[10px] line-through text-white/70">{brl(p.compare_at_price)}</span>
                        </p>
                    </div>
                </div>
                )
            })}
        </div>
    )
}
