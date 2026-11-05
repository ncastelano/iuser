// src/components/BottomNavBar.tsx
//
// A NAVBAR COMPLETA da 3.0 — UMA peça sólida só, embaixo (a antiga ilha do topo foi mesclada aqui):
//   · em cima, quando há o que mostrar, a FAIXA (a "ilha" embutida), colada à barra, sem divisória, numa cor neutra suave:
//       - os AVISOS do sistema (lib/toast): a faixa vira o MENSAGEIRO por um momento (cor e símbolo do tipo, texto, botão de ação; tocar dispensa);
//       - senão, o que está vivo: o carrinho (itens · total, nas páginas de compra), a corrida pedida e os pedidos novos da loja;
//   · embaixo, CINCO abas com nome (desenho aprovado no laboratório /paginateste): Explorar + três que ACOMPANHAM O MODO (pessoa: Perto · Social · Atividade;
//     loja: Painel · Pedidos · Conversas; motorista: Corridas · Entregas · Ganhos) + Eu (a foto do modo ativo; abre o menu de modos, o hub).
// Só apresentação: quem usa (a casca da 3.0) passa as contagens, a foto e o que cada toque faz. Constantes de medida exportadas para quem reserva espaço embaixo.
'use client'

import { CSSProperties, ReactNode, useEffect, useState } from 'react'
import { Car, ChevronRight, ShoppingCart, Store, User } from 'lucide-react'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 64
export const STRIP_H = 36
// Espaço que a barra ocupa (sem a faixa)
export const BAR_SPACE = 'calc(84px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'

/** O menu de modos (hub): vive DENTRO da barra e cresce para cima a partir dela — a barra vira o cartão, não aparece outro por cima. */
export interface BarHub { open: boolean; label: string; /** variáveis de tema do conteúdo (--hub-*) */ vars: CSSProperties; children: ReactNode }

/** Uma aba da barra (a casca decide quais, por modo; aqui só se desenha): ícone, nome, se é a página atual e o selo */
export interface BarTab { key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean }

/** Um aviso do sistema (toast) mostrado na faixa */
export interface BarMessage { id: string | number; text: string; description?: string; icon?: string; glyph: string; color: string; action?: { label: string; onClick: () => void } }
/** Chip da faixa além do carrinho e dos status: a corrida, os pedidos novos da loja... (cada um na sua cor, levando ao seu lugar) */
export interface BarExtra { key: string; text: string; color: string; path: string }

/** A faixa de cima (fixa, sem contar o aviso passageiro) aparece quando há carrinho (páginas de compra) ou chips extras (corrida, pedidos da loja) — e o carrinho some dela na página do carrinho */
export function stripVisible({ onCartPage, cartExpanded, cartCount, extras = 0 }: { onCartPage: boolean; cartExpanded: boolean; cartCount: number; extras?: number }): boolean {
    if (extras > 0) return true
    if (onCartPage) return false
    return cartExpanded && cartCount > 0
}

// Botão da barra: ícone dentro de uma pílula (laranja quando é a página atual) + nome embaixo + (selo de quantidade)
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; colors: any; children: ReactNode
}) {
    return (
        <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className="relative flex-1 min-w-0 h-full flex flex-col items-center justify-center gap-[3px] transition active:scale-90">
            <span className="relative flex items-center justify-center h-8 rounded-full transition-all duration-300" style={{ width: active ? 52 : 36, background: active ? '#f9731624' : 'transparent', color: active ? '#f97316' : colors.textPrimary }}>
                {children}
                {badge > 0 && pulse && !active && <span aria-hidden className="absolute -top-0.5 -right-1.5 min-w-[17px] h-[17px] rounded-full animate-ping pointer-events-none" style={{ background: badgeColor, opacity: 0.55 }} />}
                {badge > 0 && (
                    <span className="absolute -top-0.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: `0 0 0 2px ${colors.background}` }}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
            <span className="text-[10.5px] leading-none truncate max-w-full px-0.5" style={{ fontWeight: active ? 900 : 700, color: active ? '#f97316' : colors.textSecondary }}>{label}</span>
        </button>
    )
}

/** O modo ativo: a foto do modo (perfil, loja ou motorista) e, no canto, o selinho do tipo */
export interface ModeButtonProps { avatar: ReactNode; kind: 'user' | 'store' | 'car'; label: string; onOpen: () => void }

// A aba "Eu": a foto do modo (28 px) com o selinho do tipo; tocar abre o menu de modos
function ModeButton({ mode, open, colors }: { mode: ModeButtonProps; open: boolean; colors: any }) {
    const Glyph = mode.kind === 'store' ? Store : mode.kind === 'car' ? Car : User
    return (
        <button onClick={mode.onOpen} aria-label={`${mode.label}: trocar de modo`} aria-haspopup="dialog" aria-expanded={open} className="relative flex-1 min-w-0 h-full flex flex-col items-center justify-center gap-[3px] transition active:scale-90">
            <span className="relative flex items-center justify-center h-8 w-9">
                <span className="rounded-full flex items-center justify-center" style={{ boxShadow: `0 0 0 ${open ? 2 : 1.5}px ${open ? '#f97316' : colors.border}` }}>{mode.avatar}</span>
                <span aria-hidden className="absolute bottom-[-1px] right-[1px] w-[15px] h-[15px] rounded-full flex items-center justify-center" style={{ background: colors.textPrimary, color: colors.background, boxShadow: `0 0 0 2px ${colors.background}` }}>
                    <Glyph size={9} strokeWidth={2.8} />
                </span>
            </span>
            <span className="text-[10.5px] leading-none truncate max-w-full px-0.5" style={{ fontWeight: open ? 900 : 700, color: open ? '#f97316' : colors.textSecondary }}>Eu</span>
        </button>
    )
}

export default function BottomNavBar({ colors, tabs, cartCount, cartTotal, cartExpanded = false, onCartPage = false, mode, hub, message = null, extras = [], customCard = null, onDismiss, onGo, onCart }: {
    colors: any
    /** As quatro abas que acompanham o modo (Explorar + três); a quinta, Eu, é o botão do modo */
    tabs: BarTab[]
    cartCount: number
    cartTotal: number
    /** Páginas de compra: a faixa de cima mostra o carrinho (itens · total) quando há itens */
    cartExpanded?: boolean
    /** Está na página do carrinho (a faixa não repete o carrinho) */
    onCartPage?: boolean
    /** O botão do modo ativo (foto + selinho); abre o menu de modos */
    mode?: ModeButtonProps
    /** O menu de modos, que cresce para cima de dentro da barra */
    hub?: BarHub
    /** O aviso do sistema da vez (a faixa vira o mensageiro) */
    message?: BarMessage | null
    extras?: BarExtra[]
    /** Cartão grande de um aviso (ex.: alerta de corrida): aparece logo acima da barra */
    customCard?: ReactNode
    onDismiss: () => void
    onGo: (path: string) => void
    onCart: () => void
}) {
    const showCart = cartExpanded && cartCount > 0 && !onCartPage
    const hubOpen = !!hub?.open
    // com o menu aberto a faixa de cima fica recolhida (o menu ocupa o lugar dela); a barra sobe acima do escurecimento enquanto abre e fecha
    const strip = !hubOpen && (!!message || stripVisible({ onCartPage, cartExpanded, cartCount, extras: extras.length }))
    const [raised, setRaised] = useState(false)
    useEffect(() => {
        if (hubOpen) { setRaised(true); return }
        const t = setTimeout(() => setRaised(false), 500)
        return () => clearTimeout(t)
    }, [hubOpen])
    const money = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 pointer-events-none flex flex-col gap-2" style={{ bottom: BAR_BOTTOM, zIndex: raised || hubOpen ? 75 : 40 }}>
            {customCard && <div className="max-w-md w-full mx-auto px-3 pointer-events-auto">{customCard}</div>}
            <div className="max-w-md w-full mx-auto px-3">
                {/* Uma peça só e sólida: a faixa de cima é só uma área da própria barra, sem divisória */}
                <div className="pointer-events-auto relative overflow-hidden" style={{ background: colors.background, border: message ? `2px solid ${message.color}` : `1px solid ${colors.border}`, boxShadow: hubOpen ? '0 24px 60px rgba(0,0,0,0.45)' : '0 10px 28px rgba(0,0,0,0.14)', borderRadius: 26, transition: 'border-color 200ms ease, box-shadow 480ms ease' }}>
                    {/* MENU DE MODOS: cresce para cima de dentro da própria barra (mesma peça, mesma cor, mesmas bordas) */}
                    {hub && (
                        <div role="dialog" aria-label={hub.label} aria-hidden={!hubOpen}
                            style={{ display: 'grid', gridTemplateRows: hubOpen ? '1fr' : '0fr', transition: `grid-template-rows 480ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear ${hubOpen ? 0 : 480}ms`, visibility: hubOpen ? 'visible' : 'hidden', color: colors.textPrimary, ...hub.vars }}>
                            <div style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 150px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--staging-banner-h, 0px))', opacity: hubOpen ? 1 : 0, transition: 'opacity 300ms ease' }}>
                                    {hub.children}
                                </div>
                            </div>
                        </div>
                    )}
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
                    <div className="flex items-stretch px-1.5" style={{ height: BAR_H, borderTop: `1px solid ${hubOpen ? colors.border : 'transparent'}`, transition: 'border-color 300ms ease' }}>
                        {tabs.map((t) => (
                            <BarButton key={t.key} colors={colors} active={t.active} label={t.label} onClick={t.onClick} badge={t.badge} badgeColor={t.badgeColor} pulse={t.pulse}>
                                {t.icon}
                            </BarButton>
                        ))}
                        {mode && <ModeButton mode={mode} open={hubOpen} colors={colors} />}
                    </div>
                </div>
            </div>
        </nav>
    )
}
