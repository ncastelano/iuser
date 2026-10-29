// src/components/BottomNavBar.tsx
//
// A barra de navegação flutuante de baixo — UMA peça sólida só, igual à ilha:
//   · em cima, quando há o que mostrar, a FAIXA: o carrinho (itens · total, nas páginas de compra) e os STATUS dos pedidos (novos, em preparo, prontos). Colada à barra
//     (sem divisória), numa cor neutra suave; os dois lados são botões (carrinho → /carrinho, status → pedidos);
//   · embaixo, seis botões IGUAIS (mesmo tamanho): Carrinho, Conversas, MODO (a foto do modo ativo, com o selinho do tipo; abre o hub) · Radar, Social, Lupa (procurar e explorar).
// Só apresentação: quem usa (a casca da 3.0) passa as contagens, a foto e o que cada toque faz. Constantes de medida exportadas para quem reserva espaço embaixo.
'use client'

import { ReactNode } from 'react'
import { Car, ChevronRight, MessageCircle, Radar, Search, ShoppingCart, Store, User, Users } from 'lucide-react'
import type { OrderStatusCounts } from '@/hooks/useOrderStatusCounts'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 58
export const STRIP_H = 34
// Espaço que a barra ocupa (sem a faixa)
export const BAR_SPACE = 'calc(78px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'

export type BarKey = 'cart' | 'chat' | 'home' | 'radar' | 'people'

const ORDER_COLORS = [['pending', '#22c55e', 'novos'], ['preparing', '#eab308', 'em preparo'], ['ready', '#a855f7', 'prontos']] as const

/** A faixa de cima aparece quando há carrinho para mostrar (páginas de compra) ou pedidos em andamento — e nunca na própria página do carrinho */
export function stripVisible({ active, cartExpanded, cartCount, orderCounts }: { active: BarKey | null; cartExpanded: boolean; cartCount: number; orderCounts: OrderStatusCounts }): boolean {
    if (active === 'cart') return false
    return (cartExpanded && cartCount > 0) || orderCounts.pending + orderCounts.preparing + orderCounts.ready > 0
}

// Botão da barra: ícone (tamanho único) + (selo de quantidade) + traço laranja quando é a página atual
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; colors: any; children: ReactNode
}) {
    return (
        <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className="relative flex-1 min-w-0 h-full flex items-center justify-center transition active:scale-90" style={{ color: active ? '#f97316' : colors.textPrimary }}>
            <span className="relative flex items-center justify-center w-10 h-10">
                {children}
                {badge > 0 && pulse && !active && <span aria-hidden className="absolute top-0 right-0 min-w-[18px] h-[18px] rounded-full animate-ping pointer-events-none" style={{ background: badgeColor, opacity: 0.55 }} />}
                {badge > 0 && (
                    <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: `0 0 0 2px ${colors.background}` }}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
            <span aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full transition-all" style={{ bottom: 4, width: active ? 16 : 0, height: 3, background: '#f97316', opacity: active ? 1 : 0 }} />
        </button>
    )
}

/** O modo ativo: a foto do modo (perfil, loja ou motorista) e, no canto, o selinho do tipo */
export interface ModeButtonProps { avatar: ReactNode; kind: 'user' | 'store' | 'car'; label: string; onOpen: () => void }

// Mesmo tamanho dos outros botões: a foto cabe numa área de 28 px (os ícones têm 21 px)
function ModeButton({ mode, colors }: { mode: ModeButtonProps; colors: any }) {
    const Glyph = mode.kind === 'store' ? Store : mode.kind === 'car' ? Car : User
    return (
        <button onClick={mode.onOpen} aria-label={`${mode.label}: trocar de modo`} aria-haspopup="dialog" className="relative flex-1 min-w-0 h-full flex items-center justify-center transition active:scale-90">
            <span className="relative flex items-center justify-center w-10 h-10">
                <span className="rounded-full flex items-center justify-center" style={{ boxShadow: `0 0 0 1.5px ${colors.border}` }}>{mode.avatar}</span>
                <span aria-hidden className="absolute bottom-[3px] right-[3px] w-[15px] h-[15px] rounded-full flex items-center justify-center" style={{ background: colors.textPrimary, color: colors.background, boxShadow: `0 0 0 2px ${colors.background}` }}>
                    <Glyph size={9} strokeWidth={2.8} />
                </span>
            </span>
        </button>
    )
}

export default function BottomNavBar({ colors, active, cartCount, cartTotal, orderCounts, unread, cartExpanded = false, mode, onCart, onOrders, onChat, onHome, onRadar, onPeople }: {
    colors: any
    active: BarKey | null
    cartCount: number
    cartTotal: number
    orderCounts: OrderStatusCounts
    unread: number
    /** Páginas de compra: a faixa de cima mostra o carrinho (itens · total) quando há itens */
    cartExpanded?: boolean
    /** O botão do modo ativo (foto + selinho); abre o menu de modos */
    mode?: ModeButtonProps
    onCart: () => void
    onOrders: () => void
    onChat: () => void
    onHome: () => void
    onRadar: () => void
    onPeople: () => void
}) {
    const showCart = cartExpanded && cartCount > 0
    const ordersOn = orderCounts.pending + orderCounts.preparing + orderCounts.ready > 0
    const strip = stripVisible({ active, cartExpanded, cartCount, orderCounts })
    const money = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 z-40 pointer-events-none" style={{ bottom: BAR_BOTTOM }}>
            <div className="max-w-md mx-auto px-3">
                {/* Uma peça só e sólida (como a ilha): a faixa de cima é só uma área da própria barra, sem divisória */}
                <div className="pointer-events-auto relative overflow-hidden" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', borderRadius: 26 }}>
                    <div aria-hidden={!strip} className="flex items-center gap-2 px-3.5 overflow-hidden" style={{ height: strip ? STRIP_H : 0, opacity: strip ? 1 : 0, background: `${colors.border}30`, transition: 'height 300ms ease, opacity 250ms ease' }}>
                        {showCart ? (
                            <button onClick={onCart} tabIndex={strip ? 0 : -1} aria-label={`Ver carrinho, ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}, ${money}`} className="flex items-center gap-1.5 min-w-0 flex-1 h-full text-left active:opacity-70">
                                <ShoppingCart size={15} className="flex-shrink-0" style={{ color: '#f97316' }} />
                                <span className="text-[12px] font-black truncate" style={{ color: colors.textPrimary }}>{cartCount} {cartCount === 1 ? 'item' : 'itens'} · {money}</span>
                                <ChevronRight size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                            </button>
                        ) : <span className="flex-1 min-w-0 text-[12px] font-black truncate" style={{ color: colors.textSecondary }}>Seus pedidos</span>}
                        {ordersOn && (
                            <button onClick={onOrders} tabIndex={strip ? 0 : -1} aria-label="Pedidos em andamento" className="flex items-center gap-2 flex-shrink-0 h-full active:opacity-70">
                                {ORDER_COLORS.map(([k, color, name]) => (
                                    orderCounts[k] > 0 ? (
                                        <span key={k} title={name} className="flex items-center gap-1 text-[11px] font-black">
                                            <span className="min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: color }}>{orderCounts[k] > 9 ? '9+' : orderCounts[k]}</span>
                                            <span className="hidden min-[400px]:inline" style={{ color: colors.textSecondary }}>{name}</span>
                                        </span>
                                    ) : null
                                ))}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center px-1.5" style={{ height: BAR_H }}>
                        <BarButton colors={colors} active={active === 'cart'} label="Carrinho" onClick={onCart} badge={active === 'cart' ? 0 : cartCount}>
                            <ShoppingCart size={21} />
                        </BarButton>
                        <BarButton colors={colors} active={active === 'chat'} label="Conversas" onClick={onChat} badge={unread} badgeColor="#16a34a" pulse={unread > 0}>
                            <MessageCircle size={21} />
                        </BarButton>
                        {mode && <ModeButton mode={mode} colors={colors} />}
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
                </div>
            </div>
        </nav>
    )
}
