// src/components/BottomNavBar.tsx
//
// A barra de navegação flutuante de baixo, numa linha só: [Carrinho, Conversas] · MODO (a foto do modo ativo) no centro · [Radar, Social, Lupa].
//  - O botão do MODO, no centro, mostra a foto do modo ativo (perfil, loja ou motorista) com um selinho do tipo; tocar abre o menu de modos (hub).
//  - A LUPA (procurar e explorar: leva à home) é um botão comum, igual aos outros, no fim da direita.
//  - O CARRINHO não ganha mais uma faixa em cima: nas páginas de compra, com itens, o próprio botão do carrinho CRESCE na linha (mostra o total ao lado do
//    ícone) e volta a ser só o ícone quando não há o que mostrar. Os selos de STATUS dos pedidos (verde/amarelo/roxo) ficam SEMPRE embaixo dele, dentro da barra.
// Só apresentação: quem usa (a casca da 3.0) passa as contagens, a foto e o que cada toque faz. Constantes de medida exportadas para quem reserva espaço embaixo.
'use client'

import { ReactNode } from 'react'
import { Car, MessageCircle, Radar, Search, ShoppingCart, Store, User, Users } from 'lucide-react'
import type { OrderStatusCounts } from '@/hooks/useOrderStatusCounts'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 62
// Espaço que a barra ocupa (a logo sobressai 22 px acima dela)
export const BAR_SPACE = 'calc(102px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'

export type BarKey = 'cart' | 'chat' | 'home' | 'radar' | 'people'

// Botão da barra: ícone + (selo de quantidade) + traço laranja quando é a página atual. `grow` = o botão CRESCE na linha e mostra um texto ao lado do ícone (o total do carrinho).
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, orders, grow, colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; orders?: OrderStatusCounts; grow?: ReactNode; colors: any; children: ReactNode
}) {
    const ordersOn = !!orders && (orders.pending > 0 || orders.preparing > 0 || orders.ready > 0)
    const open = !!grow
    return (
        <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className="relative h-full flex items-center justify-center transition active:scale-90 min-w-0"
            style={{ color: active ? '#f97316' : colors.textPrimary, flex: open ? '2.4 1 0%' : '1 1 0%', transition: 'flex-grow 320ms cubic-bezier(0.22, 1, 0.36, 1), transform 120ms' }}>
            {/* ícone (+ total, quando cresce); com selos de pedidos a linha sobe um pouco para eles caberem embaixo */}
            <span className="relative flex items-center justify-center min-w-0" style={{ transform: ordersOn ? 'translateY(-6px)' : undefined, transition: 'transform 200ms ease' }}>
                <span className="relative flex items-center justify-center w-10 h-10 flex-shrink-0">
                    {children}
                    {badge > 0 && pulse && !active && <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full animate-ping pointer-events-none" style={{ background: badgeColor, opacity: 0.55 }} />}
                    {badge > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: `0 0 0 2px ${colors.background}` }}>
                            {badge > 99 ? '99+' : badge}
                        </span>
                    )}
                </span>
                <span className="overflow-hidden whitespace-nowrap text-[12px] font-black leading-none text-left" style={{ maxWidth: open ? 80 : 0, opacity: open ? 1 : 0, marginLeft: open ? 1 : 0, color: colors.textPrimary, transition: 'max-width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, margin 320ms ease' }}>{grow}</span>
            </span>
            {ordersOn && orders && (
                <span className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[3px] pointer-events-none" style={{ bottom: 5 }} aria-label="Pedidos em andamento">
                    {([['pending', '#22c55e'], ['preparing', '#eab308'], ['ready', '#a855f7']] as const).map(([k, color]) => (
                        orders[k] > 0 ? <span key={k} className="min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: color, boxShadow: `0 0 0 1.5px ${colors.background}` }}>{orders[k] > 9 ? '9+' : orders[k]}</span> : null
                    ))}
                </span>
            )}
            <span aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full transition-all" style={{ bottom: 5, width: active ? 16 : 0, height: 3, background: '#f97316', opacity: active && !ordersOn ? 1 : 0 }} />
        </button>
    )
}

/** O modo ativo: a foto do modo (perfil, loja ou motorista) e, no canto, o selinho do tipo */
export interface ModeButtonProps { avatar: ReactNode; kind: 'user' | 'store' | 'car'; label: string; onOpen: () => void }

function ModeButton({ mode, colors, active }: { mode: ModeButtonProps; colors: any; active?: boolean }) {
    const Glyph = mode.kind === 'store' ? Store : mode.kind === 'car' ? Car : User
    return (
        <button onClick={mode.onOpen} aria-label={`${mode.label}: trocar de modo`} aria-haspopup="dialog"
            className="absolute left-1/2 rounded-full transition active:scale-90"
            style={{ width: 56, height: 56, bottom: 20, transform: 'translateX(-50%)', background: colors.background, padding: 3, boxShadow: `0 8px 20px rgba(0,0,0,0.2), 0 0 0 2px ${active ? '#f97316' : colors.border}` }}>
            <span className="relative block w-full h-full rounded-full overflow-visible flex items-center justify-center">
                {mode.avatar}
                <span aria-hidden className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: colors.textPrimary, color: colors.background, boxShadow: `0 0 0 2px ${colors.background}` }}>
                    <Glyph size={10} strokeWidth={2.6} />
                </span>
            </span>
        </button>
    )
}

export default function BottomNavBar({ colors, active, cartCount, cartTotal, orderCounts, unread, cartExpanded = false, mode, onCart, onChat, onHome, onRadar, onPeople }: {
    colors: any
    active: BarKey | null
    cartCount: number
    cartTotal: number
    orderCounts: OrderStatusCounts
    unread: number
    /** Páginas de compra, com itens: o botão do carrinho cresce na linha e mostra o total */
    cartExpanded?: boolean
    /** O botão do modo ativo (foto + selinho); abre o menu de modos */
    mode?: ModeButtonProps
    onCart: () => void
    onChat: () => void
    onHome: () => void
    onRadar: () => void
    onPeople: () => void
}) {
    const grow = cartExpanded && cartCount > 0
    const money = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
    const value = cartTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 z-40 pointer-events-none" style={{ bottom: BAR_BOTTOM }}>
            <div className="max-w-md mx-auto px-3">
                {/* Uma peça só, sólida como a ilha */}
                <div className="pointer-events-auto relative" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', borderRadius: 9999 }}>
                    {/* Três colunas: esquerda e direita dividem o espaço e o centro (a logo) fica sempre no mesmo lugar, mesmo com o carrinho crescendo */}
                    <div className="grid items-center px-1.5" style={{ height: BAR_H, gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(0, 1fr)' }}>
                        <div className="flex items-center h-full min-w-0">
                            <BarButton colors={colors} active={active === 'cart'} label={grow ? `Ver carrinho, ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}, ${money}` : 'Carrinho'} onClick={onCart} badge={active === 'cart' ? 0 : cartCount} orders={active === 'cart' ? undefined : orderCounts} grow={grow ? <><span className="hidden min-[400px]:inline">R$ </span>{value}</> : undefined}>
                                <ShoppingCart size={21} style={grow ? { color: '#f97316' } : undefined} />
                            </BarButton>
                            <BarButton colors={colors} active={active === 'chat'} label="Conversas" onClick={onChat} badge={unread} badgeColor="#16a34a" pulse={unread > 0}>
                                <MessageCircle size={21} />
                            </BarButton>
                        </div>
                        <span aria-hidden />
                        <div className="flex items-center h-full min-w-0">
                            <BarButton colors={colors} active={active === 'radar'} label="Radar" onClick={onRadar}>
                                <Radar size={21} />
                            </BarButton>
                            <BarButton colors={colors} active={active === 'people'} label="Social" onClick={onPeople}>
                                <Users size={21} />
                            </BarButton>
                            <BarButton colors={colors} active={active === 'home'} label="Procurar e explorar" onClick={onHome}>
                                <Search size={21} />
                            </BarButton>
                        </div>

                        {/* MODO no centro: a foto do modo ativo; abre o hub. Ancorado pelo fundo da barra */}
                        {mode && <ModeButton mode={mode} colors={colors} />}
                    </div>
                </div>
            </div>
        </nav>
    )
}
