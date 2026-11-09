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
import { Bike, Car, ChefHat, ChevronDown, ChevronRight, GraduationCap, Hourglass, Music, PackageCheck, Pause, Play, Search, ShoppingCart, SkipBack, SkipForward, Store, Truck, User, X, Zap } from 'lucide-react'
import { clock } from '@/modules/player/domain'

// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
export const BAR_BOTTOM = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'
export const BAR_H = 64
export const STRIP_H = 48   // a faixa com o pedido em andamento tem duas linhas (loja e etapa); a página reserva essa altura embaixo
/** A altura do mini-player (a linha de cima da barra quando há algo para continuar) */
export const PLAYER_H = 57
// Espaço que a barra ocupa (sem a faixa)
export const BAR_SPACE = 'calc(84px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'

/** O mini-player: a ÚLTIMA coisa que a pessoa estava vendo ou ouvindo (música, aula em vídeo ou flash). Só a música toca aqui de verdade; aula e flash ficam à espera e "tocar" leva de volta à página. */
export interface BarPlayer {
    kind: 'musica' | 'aula' | 'flash'
    title: string; sub: string; cover: string | null
    playing: boolean; pos: number; dur: number
    /** a barra de tempo se arrasta (só a música) */
    seekable: boolean; hasNext: boolean; hasPrev: boolean
    /** o texto do botão que abre a página dele ("Abrir a página da música") */
    openLabel: string
    onToggle: () => void; onNext: () => void; onPrev: () => void; onSeek: (sec: number) => void; onOpenPage: () => void; onClose: () => void
    /** o player completo está aberto */
    full: boolean; onFull: (open: boolean) => void
}
const PLAYER_BG: Record<BarPlayer['kind'], string> = {
    musica: 'linear-gradient(135deg,#a855f7,#6d28d9)', aula: 'linear-gradient(135deg,#38bdf8,#2563eb)', flash: 'linear-gradient(135deg,#fb7185,#e11d48)',
}
const PlayerGlyph = ({ kind, size }: { kind: BarPlayer['kind']; size: number }) => (kind === 'musica' ? <Music size={size} color="#fff" /> : kind === 'aula' ? <GraduationCap size={size} color="#fff" /> : <Zap size={size} color="#fff" />)

/** O menu de modos (hub): vive DENTRO da barra e cresce para cima a partir dela — a barra vira o cartão, não aparece outro por cima. */
export interface BarHub { open: boolean; label: string; /** variáveis de tema do conteúdo (--hub-*) */ vars: CSSProperties; children: ReactNode }

/** Uma aba da barra (a casca decide quais, por modo; aqui só se desenha): ícone, nome, se é a página atual e o selo.
 *  `badges` = uma fileirinha de selos pequenos EM CIMA do ícone (cada um com a sua cor), no estilo dos selos das abas do cabeçalho da 2.0; `badge` = um selo só no canto. */
export interface BarBadge { count: number; color: string }
export interface BarTab { key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; badges?: BarBadge[] }

/** Um aviso do sistema (toast) mostrado na faixa */
export interface BarMessage { id: string | number; text: string; description?: string; icon?: string; glyph: string; color: string; action?: { label: string; onClick: () => void } }
/** Chip da faixa além do carrinho e dos status: a corrida, os pedidos novos da loja... (cada um na sua cor, levando ao seu lugar) */
/** `label` = o nome da loja (pedido do cliente); `icon` = o ícone da etapa; `step`/`steps` = barrinha de progresso do pedido */
export interface BarExtra { key: string; text: string; color: string; path: string; label?: string; icon?: string; step?: number; steps?: number }

/** A faixa de cima (fixa, sem contar o aviso passageiro) aparece quando há carrinho (páginas de compra) ou chips extras (corrida, pedidos da loja) — e o carrinho some dela na página do carrinho */
export function stripVisible({ onCartPage, cartExpanded, cartCount, extras = 0 }: { onCartPage: boolean; cartExpanded: boolean; cartCount: number; extras?: number }): boolean {
    if (extras > 0) return true
    if (onCartPage) return false
    return cartExpanded && cartCount > 0
}

const ORDER_ICONS: Record<string, typeof Store> = { hourglass: Hourglass, chef: ChefHat, package: PackageCheck, search: Search, bike: Bike, store: Store, truck: Truck }

// Botão da barra: ícone dentro de uma pílula (laranja quando é a página atual) + nome embaixo + (selo de quantidade)
function BarButton({ active, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, badges = [], colors, children }: {
    active: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; badges?: BarBadge[]; colors: any; children: ReactNode
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
                {/* selos EM CIMA do ícone (como as bolinhas das abas do cabeçalho da 2.0): uma fileira centralizada, cada selo na sua cor */}
                {badges.some((b) => b.count > 0) && (
                    <span className="absolute left-1/2 -translate-x-1/2 -top-[10px] flex gap-[2px] pointer-events-none">
                        {badges.filter((b) => b.count > 0).map((b, i) => (
                            <span key={i} className="min-w-4 h-4 px-[3px] rounded-full text-white text-[8px] font-black leading-none flex items-center justify-center" style={{ background: b.color, boxShadow: `0 0 0 1.5px ${colors.background}` }}>
                                {b.count > 99 ? '99+' : b.count}
                            </span>
                        ))}
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

/** O cartão de aviso (ex.: "Nova corrida disponível!") CRESCE de baixo para cima, de dentro da barra, em vez de aparecer de uma vez */
function ExpandUp({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false)
    useEffect(() => {
        const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
        return () => cancelAnimationFrame(r)
    }, [])
    return (
        <div className="grid" style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 480ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    )
}

export default function BottomNavBar({ colors, tabs, cartCount, cartTotal, cartExpanded = false, onCartPage = false, mode, hub, player = null, message = null, extras = [], customCard = null, onDismiss, onGo, onCart }: {
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
    /** O mini-player (a última coisa vista/ouvida); some com o menu de modos aberto */
    player?: BarPlayer | null
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
    const playerFull = !!player?.full && !hubOpen
    const miniOn = !!player && !hubOpen && !playerFull
    // com o menu aberto a faixa de cima fica recolhida (o menu ocupa o lugar dela); a barra sobe acima do escurecimento enquanto abre e fecha
    const strip = !hubOpen && !playerFull && (!!message || stripVisible({ onCartPage, cartExpanded, cartCount, extras: extras.length }))
    const [raised, setRaised] = useState(false)
    useEffect(() => {
        if (hubOpen || playerFull) { setRaised(true); return }
        const t = setTimeout(() => setRaised(false), 500)
        return () => clearTimeout(t)
    }, [hubOpen, playerFull])
    // pedido do cliente em andamento: a faixa INTEIRA ganha a cor da etapa (fundo e borda), como no aviso de "avaliar"; vale a do mais adiantado (o 1º)
    const orderExtras = extras.filter((x) => x.label !== undefined)
    const accent = !message && orderExtras.length > 0 ? orderExtras[0].color : null
    const money = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
    return (
        <nav aria-label="Navegação do iUser" className="fixed left-0 right-0 pointer-events-none flex flex-col gap-2" style={{ bottom: BAR_BOTTOM, zIndex: raised || hubOpen || playerFull ? 75 : 40 }}>
            {customCard && <ExpandUp><div className="max-w-md w-full mx-auto px-3 pointer-events-auto">{customCard}</div></ExpandUp>}
            <div className="max-w-md w-full mx-auto px-3">
                {/* Uma peça só e sólida: a faixa de cima é só uma área da própria barra, sem divisória */}
                <div className="pointer-events-auto relative overflow-hidden" style={{ background: colors.background, border: message ? `2px solid ${message.color}` : accent && strip ? `2px solid ${accent}` : `1px solid ${colors.border}`, boxShadow: hubOpen || playerFull ? '0 24px 60px rgba(0,0,0,0.45)' : '0 10px 28px rgba(0,0,0,0.14)', borderRadius: 26, transition: 'border-color 200ms ease, box-shadow 480ms ease' }}>
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
                    {/* PLAYER COMPLETO: cresce de dentro da barra, como o menu de modos */}
                    {player && (
                        <div aria-hidden={!playerFull} style={{ display: 'grid', gridTemplateRows: playerFull ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear ' + (playerFull ? 0 : 420) + 'ms', visibility: playerFull ? 'visible' : 'hidden', color: colors.textPrimary }}>
                            <div style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div className="p-4" style={{ opacity: playerFull ? 1 : 0, transition: 'opacity 250ms ease' }}>
                                    <div className="flex items-center mb-3">
                                        <button onClick={() => player.onFull(false)} aria-label="Minimizar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><ChevronDown size={17} /></button>
                                        <p className="flex-1 text-center text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{player.kind === 'musica' ? 'Música' : player.kind === 'aula' ? 'Aula' : 'Flash'}</p>
                                        <button onClick={player.onClose} aria-label="Fechar o player" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><X size={15} /></button>
                                    </div>
                                    <div className="mx-auto rounded-3xl overflow-hidden flex items-center justify-center" style={{ background: PLAYER_BG[player.kind], width: player.kind === 'aula' ? '100%' : 150, aspectRatio: player.kind === 'aula' ? '16 / 9' : player.kind === 'flash' ? '9 / 16' : '1 / 1', maxHeight: 220, boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }}>
                                        {player.cover ? <img src={player.cover} alt="" className="w-full h-full object-cover" /> : <span style={{ transform: 'scale(2.2)' }}><PlayerGlyph kind={player.kind} size={18} /></span>}
                                    </div>
                                    <p className="text-[16px] font-black mt-3 leading-tight line-clamp-2">{player.title}</p>
                                    <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{player.sub}</p>
                                    {player.seekable && player.dur > 0 && (
                                        <div className="mt-3">
                                            <input type="range" min={0} max={Math.max(1, player.dur)} step={0.5} value={Math.min(player.pos, player.dur)} onChange={(e) => player.onSeek(Number(e.target.value))} aria-label="Posição" className="w-full" style={{ accentColor: '#f97316' }} />
                                            <div className="flex justify-between text-[10.5px] font-bold" style={{ color: colors.textSecondary }}><span>{clock(player.pos)}</span><span>{clock(player.dur)}</span></div>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-center gap-5 mt-2">
                                        {player.kind === 'musica' && <button onClick={player.onPrev} disabled={!player.hasPrev && player.pos <= 3} aria-label="Anterior" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 disabled:opacity-30"><SkipBack size={20} /></button>}
                                        <button onClick={player.onToggle} aria-label={player.playing ? 'Pausar' : player.kind === 'musica' ? 'Tocar' : 'Continuar'} className="w-14 h-14 rounded-full flex items-center justify-center text-white active:scale-90" style={{ background: '#f97316' }}>{player.playing && player.kind === 'musica' ? <Pause size={24} fill="#fff" /> : <Play size={24} fill="#fff" className="ml-0.5" />}</button>
                                        {player.kind === 'musica' && <button onClick={player.onNext} disabled={!player.hasNext} aria-label="Próxima" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 disabled:opacity-30"><SkipForward size={20} /></button>}
                                    </div>
                                    <button onClick={player.onOpenPage} className="w-full h-10 rounded-full text-[12px] font-black mt-3 active:scale-[0.98]" style={{ border: `1px solid ${colors.border}` }}>{player.openLabel}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MINI-PLAYER: a última coisa que a pessoa estava fazendo; o X fecha e esquece */}
                    <div aria-hidden={!miniOn} className="relative flex items-center gap-2.5 px-3 overflow-hidden" style={{ height: miniOn ? 56 : 0, opacity: miniOn ? 1 : 0, borderBottom: miniOn ? `1px solid ${colors.border}` : '0 solid transparent', transition: 'height 300ms ease, opacity 250ms ease' }}>
                        {player && (
                            <>
                                <button onClick={() => player.onFull(true)} tabIndex={miniOn ? 0 : -1} className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:opacity-70" aria-label={`Abrir o player: ${player.title}`}>
                                    <span className="rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: PLAYER_BG[player.kind], width: player.kind === 'flash' ? 30 : 40, height: 40 }}>
                                        {player.cover ? <img src={player.cover} alt="" className="w-full h-full object-cover" /> : <PlayerGlyph kind={player.kind} size={16} />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[12.5px] font-black truncate leading-tight">{player.title}</span>
                                        <span className="block text-[11px] truncate leading-tight" style={{ color: colors.textSecondary }}>{player.sub}</span>
                                    </span>
                                </button>
                                <button onClick={player.onToggle} tabIndex={miniOn ? 0 : -1} aria-label={player.playing ? 'Pausar' : player.kind === 'musica' ? 'Tocar' : 'Continuar'} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90" style={{ background: '#f9731624', color: '#f97316' }}>{player.playing && player.kind === 'musica' ? <Pause size={17} fill="#f97316" /> : <Play size={17} fill="#f97316" className="ml-0.5" />}</button>
                                <button onClick={player.onClose} tabIndex={miniOn ? 0 : -1} aria-label="Fechar o player" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90" style={{ color: colors.textSecondary }}><X size={16} /></button>
                                {player.dur > 0 && <span aria-hidden className="absolute left-0 bottom-0 h-[2.5px]" style={{ width: `${Math.min(100, (player.pos / player.dur) * 100)}%`, background: '#f97316', transition: 'width 250ms linear' }} />}
                            </>
                        )}
                    </div>

                    <div aria-hidden={!strip} className="flex items-center gap-2 px-3.5 overflow-hidden" style={{ minHeight: strip ? STRIP_H : 0, height: strip ? undefined : 0, opacity: strip ? 1 : 0, background: message ? `${message.color}14` : accent ? `${accent}18` : `${colors.border}30`, transition: 'min-height 300ms ease, opacity 250ms ease, background 250ms ease' }}>
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
                                {extras.map((x) => x.label !== undefined ? (
                                    // pedido do cliente: sem moldura própria, a faixa toda está na cor da etapa — círculo cheio, loja em cima, etapa embaixo e a barrinha de progresso
                                    <button key={x.key} onClick={() => onGo(x.path)} tabIndex={strip ? 0 : -1} aria-label={`${x.label ? x.label + ': ' : ''}${x.text}`} className="relative flex items-center gap-2.5 flex-shrink-0 min-h-[48px] py-1.5 pr-2 active:opacity-70 text-left">
                                        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[13px] font-black" style={{ background: x.color }}>
                                            {(() => { const I = x.icon ? ORDER_ICONS[x.icon] : null; return I ? <I size={15} strokeWidth={2.4} /> : '+' })()}
                                        </span>
                                        <span className="min-w-0">
                                            {x.label && <span className="block text-[10.5px] leading-snug max-w-[200px] truncate" style={{ color: colors.textSecondary }}>{x.label}</span>}
                                            <span className="block text-[13px] font-black leading-snug" style={{ color: colors.textPrimary }}>{x.text}</span>
                                        </span>
                                        <ChevronRight size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                        {x.step ? <span aria-hidden className="absolute left-0 bottom-0 h-[3px] rounded-full" style={{ width: `${Math.min(100, (x.step / (x.steps || 4)) * 100)}%`, background: x.color, transition: 'width 400ms ease' }} /> : null}
                                    </button>
                                ) : (
                                    <button key={x.key} onClick={() => onGo(x.path)} tabIndex={strip ? 0 : -1} className="flex items-center gap-1.5 flex-shrink-0 h-9 active:opacity-70">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: x.color }} />
                                        <span className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{x.text}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-stretch px-1.5" style={{ height: BAR_H, borderTop: `1px solid ${hubOpen || playerFull ? colors.border : 'transparent'}`, transition: 'border-color 300ms ease' }}>
                        {tabs.map((t) => (
                            <BarButton key={t.key} colors={colors} active={t.active} label={t.label} onClick={t.onClick} badge={t.badge} badgeColor={t.badgeColor} pulse={t.pulse} badges={t.badges}>
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
