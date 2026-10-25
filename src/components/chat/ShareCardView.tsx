// src/components/chat/ShareCardView.tsx
//
// Cartão de um item compartilhado numa mensagem (loja, serviço, produto, publicação ou perfil), DENTRO da bolha, em cima do texto
// — no mesmo molde do RequestCard das conversas: barra colorida ao lado, tipo, nome e o que importa de cada tipo. Tocar abre o item.
'use client'

import Link from 'next/link'
import { Briefcase, Megaphone, ShoppingBag, Star, Store, User, Wrench } from 'lucide-react'
import type { ShareCard, ShareKind } from '@/lib/shareCards'

const KIND: Record<ShareKind, { label: string; color: string; Icon: any; cta: string }> = {
    store: { label: 'Loja', color: '#f97316', Icon: Store, cta: 'Ver loja' },
    service: { label: 'Serviço', color: '#7c3aed', Icon: Wrench, cta: 'Ver serviço' },
    product: { label: 'Produto', color: '#0ea5e9', Icon: ShoppingBag, cta: 'Ver produto' },
    publication: { label: 'Publicação', color: '#10b981', Icon: Megaphone, cta: 'Ver publicação' },
    profile: { label: 'Perfil', color: '#ec4899', Icon: User, cta: 'Ver perfil' },
    request: { label: 'Pedido de serviço', color: '#f59e0b', Icon: Briefcase, cta: 'Ver pedido' },
}

export default function ShareCardView({ card, mine = false, colors, compact = false }: { card: ShareCard; mine?: boolean; colors: any; compact?: boolean }) {
    const k = KIND[card.kind]
    const round = card.kind === 'profile'
    const body = (
        <>
            <span className="w-1 flex-shrink-0" style={{ background: mine ? '#fff' : k.color }} />
            <span className={`flex-shrink-0 self-center overflow-hidden flex items-center justify-center ${compact ? 'w-11 h-11' : 'w-14 h-14'} ${round ? 'rounded-full' : 'rounded-lg'}`} style={{ background: mine ? 'rgba(255,255,255,0.2)' : `${k.color}20`, color: mine ? '#fff' : k.color }}>
                {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <k.Icon size={compact ? 18 : 22} />}
            </span>
            <span className="min-w-0 flex-1 py-1.5 pr-2">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide opacity-80">
                    <k.Icon size={11} />{k.label}
                    {card.kind === 'store' && card.open != null && <span className="flex-shrink-0 normal-case">· {card.open ? 'Aberta agora' : 'Fechada'}</span>}
                </span>
                <span className="block text-[13px] font-black leading-snug line-clamp-2 mt-0.5">{card.title}</span>
                {card.subtitle && <span className="block text-[11px] opacity-80 line-clamp-1">{card.subtitle}</span>}
                {(card.kind === 'service' || card.kind === 'product') && card.detail && <span className="block text-[12px] font-black mt-0.5">{card.detail}</span>}
                {(card.kind === 'publication' || card.kind === 'profile' || card.kind === 'request') && card.detail && !compact && <span className="block text-[11px] opacity-80 line-clamp-2 mt-0.5">{card.detail}</span>}
                {card.ratingsCount > 0 && card.rating ? (
                    <span className="flex items-center gap-0.5 text-[11px] font-bold mt-0.5"><Star size={11} className="fill-yellow-400 text-yellow-400" />{card.rating.toFixed(1)} <span className="opacity-70 font-medium">({card.ratingsCount})</span></span>
                ) : null}
                {!compact && <span className="block text-[11px] underline opacity-80 mt-0.5">{k.cta}</span>}
            </span>
        </>
    )
    const cls = 'flex items-stretch gap-2.5 mb-2 rounded-xl overflow-hidden text-left'
    const style = { background: mine ? 'rgba(255,255,255,0.18)' : `${colors.border}40`, color: mine ? '#fff' : colors.textPrimary }
    return card.href === '#' ? <span className={cls} style={style}>{body}</span> : <Link href={card.href} className={`${cls} block-link`} style={style}>{body}</Link>
}
