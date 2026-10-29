// src/components/BottomNavBar.tsx
//
// A NAVBAR COMPLETA (a antiga ilha do topo foi mesclada aqui) — UMA peça sólida só, embaixo:
//   · em cima, quando há o que mostrar, a FAIXA (a "ilha" embutida), colada à barra, sem divisória, numa cor neutra suave:
//       - os AVISOS do sistema (lib/toast): a faixa vira o MENSAGEIRO por um momento (cor e símbolo do tipo, texto, botão de ação; tocar dispensa);
//       - senão, o que está vivo: o carrinho (itens · total, nas páginas de compra), a corrida pedida e os pedidos novos da loja;
//   · os STATUS dos pedidos (novos, em preparo, prontos) ficam nas BOLINHAS coloridas embaixo do botão do carrinho;
//       - cada chip é um botão que leva ao seu lugar;
//   · embaixo, seis botões IGUAIS (mesmo tamanho): Carrinho, Conversas, MODO (a foto do modo ativo, com o selinho do tipo; abre o hub) · Radar, Social, Lupa (procurar e explorar).
// Só apresentação: quem usa (a casca da 3.0) passa as contagens, a foto e o que cada toque faz. Constantes de medida exportadas para quem reserva espaço embaixo.
'use client'

import { ReactNode } from 'react'
import { Car, ChevronRight, MessageCircle, Radar, Search, ShoppingCart, Store, User, Users } from 'lucide-react'
import type { OrderStatusCounts } from '@/hooks/useOrderStatusCounts'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 58
export const STRIP_H = 36
// Espaço que a barra ocupa (sem a faixa)
export const BAR_SPACE = 'calc(78px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'

export type BarKey = 'cart' | 'chat' | 'home' | 'radar' | 'people'

const ORDER_COLORS = [['pending', '#22c55e', 'novos'], ['preparing', '#eab308', 'em preparo'], ['ready', '#a855f7', 'prontos']] as const

/** Um aviso do sistema (toast) mostrado na faixa */
export interface BarMessage { id: string | number; text: string; description?: string; icon?: string; glyph: string; color: string; action?: { label: string; onClick: () => void } }
/** Chip da faixa além do carrinho e dos status: a corrida, os pedidos novos da loja... (cada um na sua cor, levando ao seu lugar) */
export interface BarExtra { key: string; text: string; color: string; path: string }

/** A faixa de cima (fixa, sem contar o aviso passageiro) aparece quando há carrinho (páginas de compra) ou chips extras (corrida, pedidos da loja) — e o carrinho some dela na página do carrinho */
export function stripVisible({ active, cartExpanded, cartCount, extras = 0 }: { active: BarKey | null; cartExpanded: boolean; cartCount: number; extras?: number }): boolean {
    if (extras > 0) return true
    if (active === 'cart') return false
    return cartExpanded && cartCount > 0
}

// Botão da barra: ícone (tamanho único) + (selo de quantidade) + (bolinhas de status dos pedidos embaixo, só no carrinho) + traço laranja quando é a página atual
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, orders, colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; orders?: OrderStatusCounts; colors: any; children: ReactNode
}) {
    const ordersOn = !!orders && (orders.pending > 0 || orders.preparing > 0 || orders.ready > 0)
    return (
        <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className="relative flex-1 min-w-0 h-full flex items-center justify-center transition active:scale-90" style={{ color: active ? '#f97316' : colors.textPrimary }}>
            {/* com bolinhas de pedidos a linha do ícone sobe um pouco para elas caberem embaixo */}
            <span className="relative flex items-center justify-center w-10 h-10" style={{ transform: ordersOn ? 'translateY(-6px)' : undefined, transition: 'transform 200ms ease' }}>
                {children}
                {badge > 0 && pulse && !active && <span aria-hidden className="absolute top-0 right-0 min-w-[18px] h-[18px] rounded-full animate-ping pointer-events-none" style={{ background: badgeColor, opacity: 0.55 }} />}
                {badge > 0 && (
                    <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: `0 0 0 2px ${colors.background}` }}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
            {ordersOn && orders && (
                <span className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[3px] pointer-events-none" style={{ bottom: 5 }} aria-label="Pedidos em andamento">
                    {ORDER_COLORS.map(([k, color]) => (
                        orders[k] > 0 ? <span key={k} className="min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: color, boxShadow: `0 0 0 1.5px ${colors.background}` }}>{orders[k] > 9 ? '9+' : orders[k]}</span> : null
                    ))}
                </span>
            )}
            <span aria-hidden className="absolute left-1/2 -translate-x-1/2 rounded-full transition-all" style={{ bottom: 4, width: active ? 16 : 0, height: 3, background: '#f97316', opacity: active && !ordersOn ? 1 : 0 }} />
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

export default function BottomNavBar({ colors, active, cartCount, cartTotal, orderCounts, unread, cartExpanded = false, mode, message = null, extras = [], customCard = null, onDismiss, onGo, onCart, onChat, onHome, onRadar, onPeople }: {
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
    /** O aviso do sistema da vez (a faixa vira o mensageiro) */
    message?: BarMessage | null
    extras?: BarExtra[]
    /** Cartão grande de um aviso (ex.: alerta de corrida): aparece logo acima da barra */
    customCard?: ReactNode
    onDismiss: () => void
    onGo: (path: string) => void
    onCart: () => void
    onChat: () => void
    onHome: () => void
    onRadar: () => void
    onPeople: () => void
}) {
    const showCart = cartExpanded && cartCount > 0 && active !== 'cart'
    const strip = !!message || stripVisible({ active, cartExpanded, cartCount, extras: extras.length })
    const money = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 z-40 pointer-events-none flex flex-col gap-2" style={{ bottom: BAR_BOTTOM }}>
            {customCard && <div className="max-w-md w-full mx-auto px-3 pointer-events-auto">{customCard}</div>}
            <div className="max-w-md w-full mx-auto px-3">
                {/* Uma peça só e sólida: a faixa de cima é só uma área da própria barra, sem divisória */}
                <div className="pointer-events-auto relative overflow-hidden" style={{ background: colors.background, border: message ? `2px solid ${message.color}` : `1px solid ${colors.border}`, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', borderRadius: 26, transition: 'border-color 200ms ease' }}>
                    <div aria-hidden={!strip} className="flex items-center gap-2 px-3.5 overflow-hidden" style={{ minHeight: strip ? STRIP_H : 0, height: strip ? undefined : 0, opacity: strip ? 1 : 0, background: message ? `${message.color}14` : `${colors.border}30`, transition: 'min-height 300ms ease, opacity 250ms ease, background 250ms ease' }}>
                        {message ? (
                            <div className="flex items-center gap-2.5 w-full py-1.5" role="status" aria-live="polite">
                                <button onClick={onDismiss} aria-label="Dispensar aviso" className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[13px] font-black flex-shrink-0" style={{ background: message.color }}>{message.icon || message.glyph}</span>
                                    <span className="min-w-0">
                                        {message.description && <span className="block text-[10.5px] leading-snug" style={{ color: colors.textSecondary }}>{message.description}</span>}
                                        <span className="block text-[13px] font-black leading-snug" style={{ color: colors.textPrimary }}>{message.text}</span>
                                    </span>
                                </button>
                                {message.action && <button onClick={() => { message.action!.onClick(); onDismiss() }} className="flex-shrink-0 text-[12px] font-black px-3 py-1.5 rounded-full text-white active:scale-95" style={{ background: message.color }}>{message.action.label}</button>}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 w-full overflow-x-auto no-scrollbar whitespace-nowrap" style={{ scrollbarWidth: 'none' }}>
                                {showCart && (
                                    <button onClick={onCart} tabIndex={strip ? 0 : -1} aria-label={`Ver carrinho, ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}, ${money}`} className="flex items-center gap-1.5 flex-shrink-0 h-9 active:opacity-70">
                                        <ShoppingCart size={15} className="flex-shrink-0" style={{ color: '#f97316' }} />
                                        <span className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{cartCount} {cartCount === 1 ? 'item' : 'itens'} · {money}</span>
                                        <ChevronRight size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                    </button>
                                )}
                                {extras.map((x) => (
                                    <button key={x.key} onClick={() => onGo(x.path)} tabIndex={strip ? 0 : -1} className="flex items-center gap-1.5 flex-shrink-0 h-9 active:opacity-70">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: x.color }} />
                                        <span className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{x.text}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center px-1.5" style={{ height: BAR_H }}>
                        <BarButton colors={colors} active={active === 'cart'} label="Carrinho" onClick={onCart} badge={active === 'cart' ? 0 : cartCount} orders={active === 'cart' ? undefined : orderCounts}>
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
