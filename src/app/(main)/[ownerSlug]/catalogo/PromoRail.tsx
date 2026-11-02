// src/app/(main)/[ownerSlug]/catalogo/PromoRail.tsx
//
// Seção de PROMOÇÕES do catálogo (2.0 e 3.0): uma fileira HORIZONTAL de cartões altos, no estilo dos mini-cartões do Flash — a foto é o fundo, o selo de desconto em cima e o
// preço (com o antigo riscado) embaixo. Tocar abre os detalhes do combo; o "+" adiciona. O "de/por" vem de modules/promotions (`promoInfoOf`).
'use client'

import { Flame, Info, Plus } from 'lucide-react'
import { promoInfoOf } from '@/modules/promotions'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Props {
    products: any[]
    colors: any
    storeLogo: string | null
    storeOpen: boolean
    quantityOf: (productId: string) => number
    onOpen: (product: any) => void
    onAdd: (product: any) => void
    formatPrice: (v: number) => string
}

export default function PromoRail({ products, colors, storeLogo, storeOpen, quantityOf, onOpen, onAdd, formatPrice }: Props) {
    if (products.length === 0) return null
    return (
        <section aria-label="Promoções" className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 px-1">
                <span className="flex items-center gap-1.5 text-lg font-black leading-none" style={{ color: '#dc2626' }}><Flame size={20} /> Promoções</span>
                <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>{products.length} {products.length === 1 ? 'oferta' : 'ofertas'}</span>
                <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.35), transparent)' }} />
            </div>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-2 scrollbar-hide px-2 pb-2">
                {products.map((p) => {
                    const info = promoInfoOf(p)
                    const qty = quantityOf(p.id)
                    const soldOut = p.stock !== null && p.stock !== undefined && p.stock <= 0
                    return (
                        <div
                            key={p.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpen(p)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p) }}
                            aria-label={`${p.name}, ${formatPrice(p.price)}${info ? `, ${info.pct}% de desconto` : ''}`}
                            className="relative flex-shrink-0 snap-start w-[144px] h-[238px] rounded-3xl overflow-hidden cursor-pointer text-left transition active:scale-[0.98]"
                            style={{ background: GRADIENT, boxShadow: '0 8px 22px rgba(220,38,38,0.22)', outline: qty > 0 ? '2px solid #f97316' : 'none', outlineOffset: -2, opacity: soldOut ? 0.6 : 1 }}
                        >
                            {p.image_url || storeLogo
                                ? <img src={p.image_url || storeLogo || ''} alt="" loading="lazy" className={`absolute inset-0 w-full h-full ${p.image_url ? 'object-cover' : 'object-contain p-8'}`} />
                                : <span className="absolute inset-0 flex items-center justify-center text-white/90 text-4xl font-black">{p.name.trim().charAt(0).toUpperCase()}</span>}
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 72%)' }} />
                            {soldOut
                                ? <span className="absolute left-2 top-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ background: '#dc2626' }}>Esgotado</span>
                                : info && <span className="absolute left-2 top-2 text-[11px] font-black px-2 py-1 rounded-full text-white flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}><Flame size={11} />-{info.pct}%</span>}
                            {qty > 0 && !soldOut && (
                                <span className="absolute right-2 top-2 min-w-[24px] h-6 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: '#f97316', boxShadow: '0 0 0 2px #fff' }}>{qty}</span>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-2.5 flex flex-col gap-1">
                                <h3 className="text-[12.5px] font-black leading-snug text-white" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{p.name}</h3>
                                <div className="flex items-end justify-between gap-1.5">
                                    <span className="flex flex-col leading-tight min-w-0">
                                        {info && <span className="text-[10px] line-through text-white/70">{formatPrice(info.old)}</span>}
                                        <span className="text-base font-black text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{formatPrice(p.price)}</span>
                                    </span>
                                    {!soldOut && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); if (storeOpen) onAdd(p); else onOpen(p) }}
                                            aria-label={storeOpen ? `Adicionar ${p.name}` : 'Ver detalhes'}
                                            className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 transition active:scale-90"
                                            style={{ background: storeOpen ? GRADIENT : 'rgba(255,255,255,0.25)', boxShadow: '0 0 0 2px rgba(255,255,255,0.9)' }}
                                        >
                                            {storeOpen ? <Plus size={17} strokeWidth={3} /> : <Info size={15} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
