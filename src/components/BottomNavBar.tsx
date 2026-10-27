// src/components/BottomNavBar.tsx
//
// A barra de navegação flutuante de baixo (vidro): Carrinho, Conversas, a logo do iUser no centro, Radar e a foto da pessoa.
// Nas páginas de compra ganha em cima a faixa do carrinho, fundida a ela. Só apresentação: quem usa (a casca da 3.0 e a home da 2.0)
// passa as contagens, a foto e o que cada toque faz. Constantes de medida exportadas para quem precisa reservar espaço embaixo.
'use client'

import { ReactNode } from 'react'
import { ChevronRight, MapPin, MessageCircle, ShoppingCart } from 'lucide-react'
import type { OrderStatusCounts } from '@/hooks/useOrderStatusCounts'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 62
export const STRIP_H = 40
// Espaço que a barra ocupa (a logo sobressai 22 px acima dela)
export const BAR_SPACE = 'calc(102px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
const LOGO_RING = { border: '0', overflow: 'hidden', boxShadow: 'none' } as const
const LOGO_IMG_SCALE = 1.15

export type BarKey = 'cart' | 'chat' | 'home' | 'radar' | 'me'

// Botão da barra: ícone + (selo de quantidade) + traço laranja quando é a página atual
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, orders, colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; orders?: OrderStatusCounts; colors: any; children: ReactNode
}) {
    const ordersOn = !!orders && (orders.pending > 0 || orders.preparing > 0 || orders.ready > 0)
    return (
        <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className="relative flex-1 h-full flex items-center justify-center transition active:scale-90" style={{ color: active ? '#f97316' : colors.textPrimary }}>
            <span className="relative flex items-center justify-center w-10 h-10">
                {children}
                {badge > 0 && pulse && !active && <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full animate-ping pointer-events-none" style={{ background: badgeColor, opacity: 0.55 }} />}
                {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: `0 0 0 2px ${colors.background}` }}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
            {ordersOn && orders && (
                <span className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[3px] pointer-events-none" style={{ bottom: 4 }} aria-label="Pedidos em andamento">
                    {([['pending', '#3b82f6'], ['preparing', '#eab308'], ['ready', '#a855f7']] as const).map(([k, color]) => (
                        orders[k] > 0 ? <span key={k} className="min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: color, boxShadow: `0 0 0 1.5px ${colors.background}` }}>{orders[k] > 9 ? '9+' : orders[k]}</span> : null
                    ))}
                </span>
            )}
            <span aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full transition-all" style={{ bottom: 5, width: active ? 16 : 0, height: 3, background: '#f97316', opacity: active && !ordersOn ? 1 : 0 }} />
        </button>
    )
}

export default function BottomNavBar({ colors, active, cartCount, cartTotal, orderCounts, unread, showCartStrip = false, avatar, avatarLabel = 'Meu perfil', onCart, onChat, onHome, onRadar, onAvatar }: {
    colors: any
    active: BarKey | null
    cartCount: number
    cartTotal: number
    orderCounts: OrderStatusCounts
    unread: number
    /** Faixa do carrinho fundida à barra (páginas de compra, com itens) */
    showCartStrip?: boolean
    /** A foto (ou ícone) do canto direito */
    avatar: ReactNode
    avatarLabel?: string
    onCart: () => void
    onChat: () => void
    onHome: () => void
    onRadar: () => void
    onAvatar: () => void
}) {
    const ordersActive = orderCounts.pending + orderCounts.preparing + orderCounts.ready
    const strip = showCartStrip && cartCount > 0
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 z-40 pointer-events-none" style={{ bottom: BAR_BOTTOM }}>
            <div className="max-w-md mx-auto px-3">
                {/* Uma peça só: (faixa do carrinho, nas páginas de compra) + a barra. Sólida, como a ilha. */}
                <div className="pointer-events-auto relative" style={{
                    // Sólida, da cor do fundo das páginas (igual à ilha)
                    background: colors.background,
                    border: `1px solid ${colors.border}`, boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
                    borderRadius: strip ? 30 : 9999, transition: 'border-radius 300ms ease',
                }}>
                    <button
                        onClick={onCart}
                        aria-label={`Ver carrinho, ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}
                        tabIndex={strip ? 0 : -1}
                        aria-hidden={!strip}
                        className="w-full flex items-center gap-2 px-4 text-[13px] font-black overflow-hidden transition-all"
                        style={{
                            height: strip ? STRIP_H : 0, opacity: strip ? 1 : 0, color: colors.textPrimary,
                            background: 'linear-gradient(90deg, rgba(249,115,22,0.16), rgba(220,38,38,0.16))',
                            borderBottom: strip ? `1px solid ${colors.border}` : 'none',
                            borderRadius: '30px 30px 0 0', transitionDuration: '300ms',
                        }}
                    >
                        <ShoppingCart size={16} style={{ color: '#f97316' }} className="flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-left">Carrinho · {cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
                        <span className="w-16 flex-shrink-0" aria-hidden />
                        <span className="flex-1 min-w-0 text-right truncate" style={{ color: '#f97316' }}>{cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <ChevronRight size={15} style={{ color: '#f97316' }} className="flex-shrink-0" />
                    </button>
                    <div className="flex items-center px-1.5" style={{ height: BAR_H }}>
                        <BarButton colors={colors} active={active === 'cart'} label="Carrinho" onClick={onCart} badge={active === 'cart' ? 0 : cartCount} orders={active === 'cart' ? undefined : orderCounts}>
                            <ShoppingCart size={21} />
                        </BarButton>
                        <BarButton colors={colors} active={active === 'chat'} label="Conversas" onClick={onChat} badge={unread} badgeColor="#16a34a" pulse={unread > 0}>
                            <MessageCircle size={21} />
                        </BarButton>
                        <span className="flex-1" aria-hidden />
                        <BarButton colors={colors} active={active === 'radar'} label="Radar" onClick={onRadar}>
                            <MapPin size={21} />
                        </BarButton>
                        <button onClick={onAvatar} aria-label={avatarLabel} aria-pressed={active === 'me'} className="relative flex-1 h-full flex items-center justify-center transition active:scale-90">
                            {avatar}
                            <span aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full transition-all" style={{ bottom: 5, width: active === 'me' ? 16 : 0, height: 3, background: '#f97316' }} />
                        </button>

                        {/* iUser no centro: leva à aba que reúne tudo (a home); já nela, volta ao topo. Ancorada pelo FUNDO da barra: quando a faixa do carrinho aparece em cima, a logo fica onde estava */}
                        <button
                            onClick={onHome}
                            aria-label="iUser: tudo do iUser"
                            aria-current={active === 'home' ? 'page' : undefined}
                            className="absolute left-1/2 rounded-full transition active:scale-90"
                            style={{ width: 62, height: 62, bottom: 22, transform: 'translateX(-50%)', background: colors.background, padding: 4, boxShadow: `0 8px 20px rgba(249,115,22,0.35), 0 0 0 ${active === 'home' ? 2 : 0}px #f97316` }}
                        >
                            <span className="block w-full h-full rounded-full" style={LOGO_RING}>
                                <img src="/logo.png" alt="iUser" className="w-full h-full object-contain rounded-full" style={{ transform: `scale(${LOGO_IMG_SCALE})` }} />
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    )
}
