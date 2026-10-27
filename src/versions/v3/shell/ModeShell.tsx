// src/versions/v3/shell/ModeShell.tsx
//
// Casca das páginas da 3.0 (/v3, /modoprestador...): uma ILHA no topo (foto do modo + cumprimento, ou o que está vivo agora:
// corrida, pedido pronto, mensagens), uma BARRA flutuante embaixo (carrinho, conversas, iUser no centro, radar e a foto) e o HUB,
// painel em que a ilha cresce para a pessoa escolher o modo — perfil/prestador, loja ou motorista — e ir a qualquer lugar do iUser.
// A barra de baixo só aparece nas páginas "raiz" (as de tela cheia, mapas e conversa aberta ficam livres). O conteúdo entra como `children`.
'use client'

import { ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
    Store as StoreIcon, Car, MessageCircle, User, LogIn, ChevronRight, ChevronDown, X, Search, RotateCcw, ShoppingBag,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useOrderStatusCounts, type OrderStatusCounts } from '@/hooks/useOrderStatusCounts'
import { useCartStore, cartItemLineTotal } from '@/store/useCartStore'
import { useShellLive } from '@/hooks/useShellLive'
import BottomNavBar, { BAR_SPACE, STRIP_H } from '@/components/BottomNavBar'
import { getRecentClicks, type RecentClickItem } from '@/components/LastSearched'
import { switchVersion, versionLabel } from '@/versions/client'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const toPublicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ===================== HUB (o antigo menu lateral) =====================
// Abre ao tocar na ilha do topo ou na foto da barra de baixo: a ilha CRESCE para baixo e vira um painel sobre o degradê do iUser,
// com os modos (perfil, prestador, lojas, veículos), a busca/explorar e atalhos. Cada modo tem a sua página: Meu perfil
// (/painel-perfil), Modo prestador (/modoprestador), cada loja (/painel-loja/<slug>) e cada veículo (/<vehicle_slug>).
interface DrawerData {
    stores: { id: string; name: string; slug: string; logo: string | null; open: boolean }[]
    vehicles: { kind: string; slug: string; model: string | null; plate: string | null; photo: string | null }[]
    /** Modo motorista ligado (driver_pricing.driver_mode_active) */
    driverActive: boolean
    /** Modo prestador ligado no perfil (profiles.service_mode_active) */
    providerOn: boolean
}
const VEHICLE_LABEL: Record<string, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

/** Resumo do topo guardado no aparelho (pra desenhar o cabeçalho na hora na próxima abertura) */
interface HeaderSnap {
    userId: string; mode: string; line1: string; line2: string; image: string | null
    noRing: boolean; label: string; icon: 'user' | 'store' | 'car'
}

/** Página de cada modo (o que abre ao escolher o modo no menu) */
function modePath(mode: string, data: DrawerData): string {
    if (mode === 'perfil') return '/painel-perfil'
    if (mode === 'prestador') return '/modoprestador'
    if (mode.startsWith('loja:')) return `/painel-loja/${encodeURIComponent(mode.slice(5))}`
    if (mode.startsWith('motorista:')) {
        const v = data.vehicles.find((x) => `motorista:${x.slug}` === mode)
        return v ? `/${v.slug}` : '/painel-motorista'
    }
    return '/'
}

// Linha de um modo no menu: mostra a imagem do modo (foto do perfil, logo da loja, foto do carro) ou, sem imagem, o ícone.
// Nada some nem aparece aqui — a animação de troca acontece só no topo da página (seção "Bem-vindo").
function DrawerRow({ mode, active, icon, image, title, desc, dot, onSelect, actions, extra, hidePanel = false, card = false }: {
    mode: string; active: string; icon: ReactNode; image?: string | null; title: string; desc?: string; dot?: string
    onSelect: (mode: string) => void
    /** Botões extras embaixo da linha (ex.: "Ver loja" e "Editar") */
    actions?: ReactNode
    /** Linha de aviso embaixo dos botões (ex.: mensagens não lidas) */
    extra?: ReactNode
    /** Sem o botão "Painel" à direita (quando o painel já está entre os botões de baixo) */
    hidePanel?: boolean
    /** O cartão é o próprio contêiner (borda e fundo), sem painel em volta */
    card?: boolean
}) {
    const selected = active === mode
    return (
        <div
            className={card ? 'rounded-3xl mt-4' : 'rounded-2xl'}
            style={card
                ? { background: 'var(--hub-panel)', border: `1px solid ${selected ? '#f97316' : 'var(--hub-line)'}`, boxShadow: selected ? 'inset 0 0 0 1px #f97316' : undefined }
                : selected ? { background: 'var(--hub-soft)', boxShadow: 'inset 0 0 0 1.5px #f97316' } : undefined}
        >
            <div className="flex items-center">
                <button
                    onClick={() => onSelect(mode)}
                    aria-pressed={selected}
                    className="flex-1 min-w-0 flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-2xl text-left transition hover:bg-[var(--hub-soft)] active:bg-[var(--hub-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                >
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'var(--hub-soft)' }}>
                        {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : icon}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black leading-tight truncate">{title}</span>
                        {desc && (
                            <span className="flex items-center gap-1.5 text-xs opacity-90 truncate">
                                {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}{desc}
                            </span>
                        )}
                    </span>
                    {(!selected || hidePanel) && <ChevronRight size={16} className="flex-shrink-0 opacity-70" />}
                </button>
                {/* Modo selecionado: o botão "Painel" leva ao painel dele (o mesmo destino de tocar no cartão) */}
                {selected && !hidePanel && (
                    <button
                        onClick={() => onSelect(mode)}
                        className="mr-3 flex-shrink-0 h-8 px-4 rounded-full text-xs font-black transition hover:scale-[1.04] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                        style={{ background: '#f97316', color: '#fff' }}
                    >
                        Painel
                    </button>
                )}
            </div>
            {actions && <div className="flex gap-2 px-3 pb-2.5 pt-0.5">{actions}</div>}
            {extra && <div className="px-3 pb-2.5">{extra}</div>}
        </div>
    )
}

/** Botão pequeno de ação dentro de uma linha do menu */
function DrawerPill({ onClick, children, solid = false }: { onClick: () => void; children: ReactNode; solid?: boolean }) {
    return (
        <button
            onClick={onClick}
            className="flex-1 py-2 rounded-full text-xs font-black transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
            style={solid ? { background: '#f97316', color: '#fff' } : { background: 'var(--hub-soft)', color: 'var(--hub-fg)', border: '1px solid var(--hub-line)' }}
        >
            {children}
        </button>
    )
}

/** Linha de chamada (cadastrar loja / virar motorista): não é um modo, só leva ao cadastro */
function DrawerCta({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition hover:bg-[var(--hub-soft)] active:bg-[var(--hub-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
            style={{ border: '1.5px dashed var(--hub-line)' }}
        >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)' }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-tight truncate">{title}</span>
                <span className="block text-xs opacity-90 truncate">{desc}</span>
            </span>
            <ChevronRight size={16} className="flex-shrink-0 opacity-70" />
        </button>
    )
}

function DrawerLabel({ children }: { children: ReactNode }) {
    return <p className="px-3 pt-2 pb-1 text-[11px] font-black uppercase tracking-widest opacity-80">{children}</p>
}

function MenuDrawerContent({ data, active, recent, storeOrders, onSelect, onGo, onSwitchVersion }: {
    onSwitchVersion: () => Promise<void>
    /** Pedidos de cada loja (novos, em preparo, prontos) */
    storeOrders: Record<string, { pending: number; preparing: number; ready: number }>
    data: DrawerData
    /** Modo selecionado: 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>' */
    active: string
    /** As últimas coisas que a pessoa abriu pela busca (avatares do Explorar) */
    recent: RecentClickItem[]
    onSelect: (mode: string) => void; onGo: (path: string) => void
}) {
    // Cada grupo é um painel separado, com o seu título
    const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
        <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'var(--hub-panel)', border: '1px solid var(--hub-line)' }}>
            <DrawerLabel>{title}</DrawerLabel>
            <div className="flex flex-col gap-1.5">{children}</div>
        </section>
    )

    return (
        <div className="w-full flex flex-col px-3 pb-6">
            <Panel title="Modo motorista">
                {data.vehicles.length > 0 ? data.vehicles.map((v) => (
                    <DrawerRow
                        key={v.slug}
                        mode={`motorista:${v.slug}`}
                        active={active}
                        onSelect={onSelect}
                        icon={<Car size={20} color="#f97316" />}
                        image={v.photo}
                        title={`${VEHICLE_LABEL[v.kind] || 'Veículo'}${v.model ? ` · ${v.model}` : ''}`}
                        desc={data.driverActive ? 'Motorista ativado' : 'Motorista desligado'}
                        dot={data.driverActive ? '#4ade80' : '#fca5a5'}
                    />
                )) : (
                    <DrawerCta icon={<Car size={20} color="#f97316" />} title="Ser motorista" desc="Cadastre seu veículo e receba corridas" onClick={() => onGo('/painel-motorista')} />
                )}
            </Panel>

            {/* Só o cartão da loja (sem o título "Modo loja"): Ver loja + Painel e, embaixo, os pedidos */}
            <>
                {data.stores.length > 0 ? data.stores.map((st) => {
                    const o = storeOrders[st.id] || { pending: 0, preparing: 0, ready: 0 }
                    const going = o.preparing + o.ready
                    return (
                        <DrawerRow
                            key={st.id}
                            mode={`loja:${st.slug}`}
                            active={active}
                            onSelect={onSelect}
                            hidePanel
                            card
                            icon={<StoreIcon size={20} color="#f97316" />}
                            image={st.logo}
                            title={st.name}
                            desc={st.open ? 'Aberta agora' : 'Fechada agora'}
                            dot={st.open ? '#4ade80' : '#fca5a5'}
                            actions={(
                                <>
                                    <DrawerPill onClick={() => onGo(`/${st.slug}`)}>Ver loja</DrawerPill>
                                    <DrawerPill solid onClick={() => onSelect(`loja:${st.slug}`)}>Painel</DrawerPill>
                                </>
                            )}
                            extra={(
                                <button
                                    onClick={() => onGo(`/painel-loja/${encodeURIComponent(st.slug)}`)}
                                    className="w-full h-10 px-3 rounded-full flex items-center gap-2.5 text-xs font-black transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                                    style={{ background: 'var(--hub-soft)', border: '1px solid var(--hub-line)' }}
                                >
                                    <ShoppingBag size={16} className="flex-shrink-0" />
                                    <span className="flex-1 text-left truncate">
                                        {o.pending > 0 ? `${o.pending} ${o.pending === 1 ? 'pedido novo' : 'pedidos novos'}${going > 0 ? ` · ${going} em andamento` : ''}` : going > 0 ? `${going} ${going === 1 ? 'pedido em andamento' : 'pedidos em andamento'}` : 'Pedidos'}
                                    </span>
                                    {o.pending > 0
                                        ? <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: '#3b82f6' }}>{o.pending > 99 ? '99+' : o.pending}</span>
                                        : <ChevronRight size={14} className="flex-shrink-0 opacity-70" />}
                                </button>
                            )}
                        />
                    )
                }) : (
                    <div className="mt-4"><DrawerCta icon={<StoreIcon size={20} color="#f97316" />} title="Criar minha loja" desc="Cadastre sua loja grátis" onClick={() => onGo('/criar-loja')} /></div>
                )}
            </>


            <DrawerExplorar recent={recent} onGo={onGo} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
    )
}

// Explorar: a lupa + as 5 últimas coisas buscadas; leva à home (/)
function DrawerExplorar({ recent, onGo }: { recent: RecentClickItem[]; onGo: (path: string) => void }) {
    return (
        <>
            <button
                type="button"
                onClick={() => onGo('/')}
                className="mt-4 w-full rounded-full px-4 py-3 flex items-center gap-3 font-black text-sm transition active:scale-[0.98]"
                style={{ background: 'var(--hub-soft)', border: '1px solid var(--hub-line)' }}
            >
                <Search size={20} className="flex-shrink-0" />
                <span className="flex-1 text-left">Procurar e explorar</span>
                {recent.length > 0 && (
                    <span className="flex flex-shrink-0">
                        {recent.map((r, i) => (
                            <span
                                key={`${r.type}-${r.id}`}
                                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-black flex-shrink-0"
                                style={{ marginLeft: i === 0 ? 0 : -10, background: 'var(--hub-soft)', boxShadow: '0 0 0 2px var(--hub-bg)' }}
                                title={r.name}
                            >
                                {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : (r.name || '?').charAt(0).toUpperCase()}
                            </span>
                        ))}
                    </span>
                )}
            </button>
        </>
    )
}

// Trocar para a interface 2.0: o único seletor de versão da 3.0 (a troca em si é o mesmo mecanismo central)
function DrawerVersionSwitch({ onSwitch }: { onSwitch: () => Promise<void> }) {
    const [busy, setBusy] = useState(false)
    return (
        <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onSwitch() } finally { /* a página recarrega */ } }}
            className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition active:scale-[0.98] disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
            style={{ background: 'var(--hub-soft)', border: '1px solid var(--hub-line)' }}
        >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)' }}>
                <RotateCcw size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-tight">{busy ? 'Trocando…' : `Voltar para a versão ${versionLabel('v2').replace('iUser ', '')}`}</span>
                <span className="block text-xs opacity-90">Só muda a interface: conta, dados e plano continuam iguais</span>
            </span>
        </button>
    )
}

// Menu de quem não tem conta: o "modo" é o de visitante (já selecionado), mais entrar/criar conta e o Explorar
function VisitorDrawerContent({ recent, onGo, onClose, onSwitchVersion }: { recent: RecentClickItem[]; onGo: (path: string) => void; onClose: () => void; onSwitchVersion: () => Promise<void> }) {
    return (
        <div className="w-full flex flex-col px-3 pb-6">
            <section className="mt-1 rounded-3xl p-2 pb-1.5" style={{ background: 'var(--hub-panel)', border: '1px solid var(--hub-line)' }}>
                <DrawerLabel>Modo visitante</DrawerLabel>
                <div className="flex flex-col gap-1.5">
                    <DrawerRow
                        mode="visitante"
                        active="visitante"
                        onSelect={() => onClose()}
                        icon={<User size={20} color="#f97316" />}
                        title="Visitante"
                        desc="Navegando sem conta"
                        dot="#fde68a"
                    />
                </div>
            </section>

            <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'var(--hub-panel)', border: '1px solid var(--hub-line)' }}>
                <DrawerLabel>Minha conta</DrawerLabel>
                <div className="flex flex-col gap-1.5">
                    <DrawerCta icon={<LogIn size={20} color="#f97316" />} title="Entrar" desc="Já tenho conta no iUser" onClick={() => onGo('/login')} />
                    <DrawerCta icon={<User size={20} color="#f97316" />} title="Criar conta" desc="Grátis, leva um minuto" onClick={() => onGo('/cadastrar')} />
                </div>
            </section>

            <DrawerExplorar recent={recent} onGo={onGo} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
    )
}


// A ilha flutua no topo; o conteúdo da página começa abaixo dela (NAV_H, a mesma altura de antes: telas cheias usam --shell-top)
const ISLAND_TOP = 'calc(8px + env(safe-area-inset-top))'
const ISLAND_H = 56
const NAV_H = 'calc(74px + env(safe-area-inset-top))'
// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
// Espaço que a barra de baixo ocupa (var --shell-bottom): quem tem algo fixo embaixo se afasta dele
const SHELL_BOTTOM = BAR_SPACE
const LOGO_RING = { border: '2px solid #fff', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' } as const
const LOGO_IMG_SCALE = 1.15
// Páginas "raiz" que mostram a barra de baixo (as demais têm o próprio rodapé, mapa ou campo de digitar)
// Nas páginas de compra, o carrinho vira uma faixa FUNDIDA à barra de baixo (uma peça só) quando há itens
const CART_STRIP_PATHS = ['/', '/comprar', '/lojas', '/produtos']
const BAR_PATHS = ['/', '/comprar', '/lojas', '/produtos', '/servicos-disponiveis', '/carrinho', '/conversas', '/painel-perfil', '/modoprestador', '/imoveis', '/meus-imoveis', '/anunciar-imovel']

// Foto do modo (perfil, logo da loja, foto do carro) — ou o ícone do modo quando não há imagem. Troca de modo = pequeno "estouro".
function ModeAvatar({ userId, image, noRing, modeIcon, popToken, colors, size = 40 }: {
    userId: string | null; image: string | null | undefined; noRing: boolean; modeIcon: ReactNode; popToken: number; colors: any; size?: number
}) {
    const planRing = usePlanRing(userId)
    const inner = planRing && !noRing ? size - 6 : size
    return (
        <PlanAvatarRing userId={noRing ? null : userId} width={2} linkToProfile={false}>
            <span
                key={popToken}
                className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{ width: inner, height: inner, background: image ? `${colors.border}60` : GRADIENT, color: '#fff', animation: popToken ? 'shellPop 420ms cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined }}
            >
                {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : modeIcon}
            </span>
        </PlanAvatarRing>
    )
}

// Topo do hub (logado): o cumprimento e o perfil num cartão só — foto, @, "Painel", fechar, "Ver perfil / Editar" e as mensagens não lidas
function HubProfileTop({ slug, avatarUrl, userId, colors, popToken, unread, chatPath, onPanel, onGo, onClose }: {
    slug: string | null; avatarUrl: string | null | undefined; userId: string | null; colors: any; popToken: number
    unread: number; chatPath: string
    onPanel: () => void; onGo: (path: string) => void; onClose: () => void
}) {
    return (
        <div className="flex-shrink-0">
            <div className="flex items-center gap-2.5 pl-2 pr-2" style={{ height: ISLAND_H }}>
                <span className="flex-shrink-0 rounded-full" style={{ boxShadow: '0 0 0 2px var(--hub-line)' }}>
                    <ModeAvatar userId={userId} image={avatarUrl} noRing={true} modeIcon={<User size={20} color="#fff" />} popToken={popToken} colors={colors} />
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11px] truncate opacity-80">Bem-vindo de volta</span>
                    <span className="block text-[15px] font-black truncate leading-tight ">{slug ? `@${slug}` : 'Meu perfil'}</span>
                </span>
                <button onClick={onClose} aria-label="Fechar menu" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)' }}>
                    <X size={19} />
                </button>
            </div>
            <div className="px-3 pb-3 flex flex-col gap-2">
                <div className="flex gap-2">
                    {slug && <DrawerPill onClick={() => onGo(`/${slug}`)}>Ver perfil</DrawerPill>}
                    <DrawerPill solid onClick={onPanel}>Painel</DrawerPill>
                </div>
                <button
                    onClick={() => onGo(chatPath)}
                    className="w-full h-10 px-3 rounded-full flex items-center gap-2.5 text-xs font-black transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                    style={{ background: 'var(--hub-soft)', border: '1px solid var(--hub-line)' }}
                >
                    <MessageCircle size={16} className="flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{unread > 0 ? `${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : 'Conversas'}</span>
                    {unread > 0
                        ? <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center" style={{ background: '#16a34a' }}>{unread > 99 ? '99+' : unread}</span>
                        : <ChevronRight size={14} className="flex-shrink-0 opacity-70" />}
                </button>
            </div>
        </div>
    )
}

// Avisa a casca quando há uma conversa aberta (?c=): a barra de baixo sai da frente do campo de digitar. Fica à parte porque
// useSearchParams precisa de um Suspense em volta.
function ChatThreadWatcher({ onChange }: { onChange: (open: boolean) => void }) {
    const sp = useSearchParams()
    const open = !!sp.get('c')
    useEffect(() => { onChange(open) }, [open, onChange])
    return null
}

export default function ModeShell({ children }: {
    children: ReactNode
    /** (herdado) busca da página: a barra nova não tem lupa; quem usa a busca da home a encontra no topo da própria página */
    search?: { value: string; onChange: (v: string) => void; placeholder?: string; inline?: boolean; focus?: () => void }
}) {
    const router = useRouter()
    const pathname = usePathname()
    const { colors } = useTheme()
    const { userId, profileSlug, avatarUrl, loading: profileLoading } = useProfile()
    const go = (path: string) => router.push(path)

    // Selos do topo: não lidas do chat e itens do carrinho
    const topUnread = useChatUnread(userId)
    const orderCounts = useOrderStatusCounts(userId)
    const ordersActive = orderCounts.pending + orderCounts.preparing + orderCounts.ready
    const cartMap = useCartStore((st) => st.itemsByStore)
    const [cartReady, setCartReady] = useState(false)
    useEffect(() => setCartReady(true), [])
    const topCart = cartReady ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0
    const cartTotal = cartReady ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + cartItemLineTotal(i), 0), 0) : 0

    // Hub: abre pela ilha do topo ou pela foto da barra de baixo. Carrega o que a pessoa tem (loja, veículo, modo prestador) pra mostrar só isso.
    const [drawerOpen, setDrawerOpen] = useState(false)
    // Conversa aberta (?c=): a barra de baixo sai da frente
    const [threadOpen, setThreadOpen] = useState(false)
    // As 5 últimas coisas que a pessoa abriu pela busca (perfil, loja, produto) — vão no Explorar do menu
    const [recent, setRecent] = useState<RecentClickItem[]>([])
    useEffect(() => {
        const read = () => setRecent(getRecentClicks().filter((i) => i.type !== 'ride').slice(0, 5))
        read()
        window.addEventListener('focus', read)
        window.addEventListener('storage', read)
        return () => { window.removeEventListener('focus', read); window.removeEventListener('storage', read) }
    }, [])
    const [drawerData, setDrawerData] = useState<DrawerData>({ stores: [], vehicles: [], driverActive: false, providerOn: false })
    const [dataLoaded, setDataLoaded] = useState(false)
    // Pedidos de cada loja da pessoa (novos, em preparo, prontos): aparecem no cartão da loja do menu
    const [storeOrders, setStoreOrders] = useState<Record<string, { pending: number; preparing: number; ready: number }>>({})
    // Modo selecionado (guardado no aparelho, por conta): 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>'
    const [activeMode, setActiveMode] = useState('perfil')
    // Com uma loja escolhida no menu, as conversas já abrem na sala dessa loja (?sala=<slug>)
    const chatPath = activeMode.startsWith('loja:') ? `/conversas?sala=${encodeURIComponent(activeMode.slice(5))}` : '/conversas'
    const [modeTick, setModeTick] = useState(0)
    // Resumo do topo da última visita: desenha o cabeçalho na hora (sem esperar o banco) e depois confere
    const [snap, setSnap] = useState<HeaderSnap | null>(null)
    useEffect(() => {
        try {
            const raw = localStorage.getItem('iuser_header_last')
            if (raw) {
                const parsed = JSON.parse(raw) as HeaderSnap
                setSnap(parsed)
                if (parsed.mode) setActiveMode(parsed.mode)
                // as imagens já começam a baixar antes mesmo dos dados chegarem
                if (parsed.image) { const im = new Image(); im.src = parsed.image }
            }
        } catch { /* sem armazenamento */ }
    }, [])
    useEffect(() => {
        if (!userId) return
        try { setActiveMode(localStorage.getItem(`iuser_mode_${userId}`) || 'perfil') } catch { /* sem armazenamento */ }
    }, [userId])
    useEffect(() => {
        if (!userId) {
            setDrawerData({ stores: [], vehicles: [], driverActive: false, providerOn: false })
            setDataLoaded(!profileLoading)
            return
        }
        let cancelled = false
        ;(async () => {
            const [{ data: sts }, { data: veh }, { data: drv }, { data: prof }] = await Promise.all([
                supabase.from('stores').select('id, name, "storeSlug", logo_url, business_hours').eq('owner_id', userId),
                supabase.from('driver_vehicles').select('vehicle_kind, vehicle_slug, car_model, car_plate, car_photo_url').eq('driver_id', userId),
                supabase.from('driver_pricing').select('driver_mode_active').eq('driver_id', userId).maybeSingle(),
                supabase.from('profiles').select('service_mode_active').eq('id', userId).maybeSingle(),
            ])
            if (cancelled) return
            setDrawerData({
                stores: (sts || []).map((st: any) => ({
                    id: st.id, name: st.name, slug: st.storeSlug,
                    logo: toPublicImage('store-logos', st.logo_url),
                    open: isStoreOpenNow(st.business_hours as BusinessHours | null),
                })),
                vehicles: (veh || []).map((v: any) => ({
                    kind: v.vehicle_kind, slug: v.vehicle_slug || v.vehicle_kind, model: v.car_model || null, plate: v.car_plate || null,
                    photo: v.car_photo_url ? supabase.storage.from('driver-car-photos').getPublicUrl(v.car_photo_url).data.publicUrl : null,
                })),
                driverActive: !!(drv as any)?.driver_mode_active,
                providerOn: !!(prof as any)?.service_mode_active,
            })
            setDataLoaded(true)
        })().catch(() => { if (!cancelled) setDataLoaded(true) /* o menu só mostra o perfil */ })
        return () => { cancelled = true }
    }, [userId, profileLoading])

    const storeIdsKey = drawerData.stores.map((st) => st.id).join(',')
    useEffect(() => {
        if (!drawerOpen || !storeIdsKey) return
        let cancelled = false
        const load = async () => {
            const { data } = await supabase.from('orders').select('store_id, status').in('store_id', storeIdsKey.split(',')).in('status', ['pending', 'preparing', 'ready'])
            if (cancelled || !data) return
            const next: Record<string, { pending: number; preparing: number; ready: number }> = {}
            for (const r of data as { store_id: string; status: 'pending' | 'preparing' | 'ready' }[]) {
                const o = next[r.store_id] || (next[r.store_id] = { pending: 0, preparing: 0, ready: 0 })
                o[r.status] += 1
            }
            setStoreOrders(next)
        }
        load()
        const t = setInterval(load, 20_000)
        return () => { cancelled = true; clearInterval(t) }
    }, [drawerOpen, storeIdsKey])

    // Fecha com ESC e trava a rolagem da página enquanto o menu está aberto
    useEffect(() => {
        if (!drawerOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [drawerOpen])
    // O topo responde ao modo escolhido no menu: loja (logo + nome), motorista (foto do carro + modelo e placa),
    // prestador (foto do perfil + "Modo prestador") ou o perfil de sempre.
    const activeStore = activeMode.startsWith('loja:') ? drawerData.stores.find((st) => `loja:${st.slug}` === activeMode) : undefined
    const activeVehicle = activeMode.startsWith('motorista:') ? drawerData.vehicles.find((v) => `motorista:${v.slug}` === activeMode) : undefined
    const computed: HeaderSnap = (() => {
        const base = { userId: userId || '', mode: activeMode, noRing: false, label: 'Meu perfil', icon: 'user' as const }
        if (activeStore) return { ...base, line1: 'Sua loja', line2: activeStore.name, image: activeStore.logo, noRing: true, label: 'Menu da loja', icon: 'store' as const }
        if (activeVehicle) return {
            ...base,
            line1: profileSlug ? `@${profileSlug}` : 'Motorista',
            line2: [activeVehicle.model, activeVehicle.plate].filter(Boolean).join(' · ') || (VEHICLE_LABEL[activeVehicle.kind] || 'Veículo'),
            image: activeVehicle.photo, noRing: true, label: 'Menu do motorista', icon: 'car' as const,
        }
        if (userId && activeMode === 'prestador' && drawerData.providerOn) {
            return { ...base, line1: profileSlug ? `@${profileSlug}` : 'Meu perfil', line2: 'Modo prestador', image: avatarUrl || null }
        }
        return { ...base, mode: 'perfil', line1: userId ? 'Bem-vindo de volta' : 'Você está como', line2: profileSlug ? `@${profileSlug}` : 'Visitante', image: avatarUrl || null }
    })()
    // Enquanto o banco não respondeu, usa o resumo guardado da última visita (se for da mesma pessoa)
    const useSnap = !dataLoaded && !!snap && (!userId || snap.userId === userId)
    const view = useSnap ? snap! : computed
    const iconFor = (k: HeaderSnap['icon']) => k === 'store' ? <StoreIcon size={22} /> : k === 'car' ? <Car size={22} /> : <User size={22} />
    const headerView = { line1: view.line1, line2: view.line2, image: view.image, noRing: view.noRing, label: view.label, modeIcon: iconFor(view.icon) }

    // Guarda o resumo pra próxima abertura do app (e pré-carrega a imagem)
    useEffect(() => {
        if (!dataLoaded || !userId) return
        try { localStorage.setItem('iuser_header_last', JSON.stringify(computed)) } catch { /* sem armazenamento */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataLoaded, userId, computed.mode, computed.line1, computed.line2, computed.image])

    // Quem chega direto numa página de modo (link, voltar do navegador) fica com aquele modo selecionado no topo
    useEffect(() => {
        if (!dataLoaded || !userId) return
        const candidates = [
            'perfil',
            ...(drawerData.providerOn ? ['prestador'] : []),
            ...drawerData.stores.map((st) => `loja:${st.slug}`),
            ...drawerData.vehicles.map((v) => `motorista:${v.slug}`),
        ]
        const match = candidates.find((m) => modePath(m, drawerData) === pathname)
        if (match && match !== activeMode) {
            setActiveMode(match)
            try { localStorage.setItem(`iuser_mode_${userId}`, match) } catch { /* sem armazenamento */ }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataLoaded, userId, pathname])

    // Página atual (a 3.0 serve /carrinho por /v3/carrinho e a home por /v3; o endereço visível é o canônico)
    const shellPath = (pathname || '').replace(/^\/v3(?=\/|$)/, '') || '/'
    // Ao ir para o carrinho, a página SOBE a partir da barra (cresce de baixo para cima) em vez de só aparecer
    const prevShellPath = useRef<string | null>(null)
    const [rising, setRising] = useState(false)
    useLayoutEffect(() => { // antes da pintura: a página nova nunca aparece inteira por um instante
        const prev = prevShellPath.current
        prevShellPath.current = shellPath
        if (prev === null || prev.startsWith('/carrinho') || !shellPath.startsWith('/carrinho')) return
        setRising(true)
        const t = setTimeout(() => setRising(false), 750)
        return () => clearTimeout(t)
    }, [shellPath])
    // Na página do modo escolhido (painel do perfil, loja, veículo...), a foto da barra também fica marcada
    const modeSelected = !!userId && dataLoaded && !!pathname && modePath(activeMode, drawerData) === pathname
    const activeKey: 'cart' | 'chat' | 'home' | 'radar' | 'me' | null = drawerOpen ? 'me'
        : shellPath.startsWith('/carrinho') ? 'cart' : shellPath.startsWith('/conversas') ? 'chat' : shellPath === '/' ? 'home' : shellPath.startsWith('/radar') ? 'radar' : modeSelected ? 'me' : null
    // A barra de baixo só nas páginas "raiz"
    const barShown = (BAR_PATHS.includes(shellPath) || shellPath.startsWith('/painel-loja/')) && !(shellPath === '/conversas' && threadOpen)
    const cartStrip = barShown && topCart > 0 && CART_STRIP_PATHS.includes(shellPath)
    const live = useShellLive(userId, orderCounts, topUnread, chatPath)
    const openHub = () => { window.scrollTo({ top: 0 }); setDrawerOpen(true) }
    // Escolher um modo: marca como selecionado e abre a página dele (cada modo tem a sua)
    const selectMode = (mode: string) => {
        if (mode !== activeMode) {
            setActiveMode(mode)
            setModeTick((n) => n + 1)
            try { localStorage.setItem(`iuser_mode_${userId}`, mode) } catch { /* sem armazenamento */ }
        }
        const target = modePath(mode, drawerData)
        setDrawerOpen(false)
        if (pathname !== target) router.push(target)
    }
    // Pelo hub: fecha e vai
    const goAndClose = (path: string) => {
        setDrawerOpen(false)
        router.push(path)
    }
    // Seletor de versão (o único da 3.0): mesmo mecanismo central da 2.0
    // Só a home, o carrinho e as conversas existem nas duas; qualquer outra página do shell é só da 3.0 → home da 2.0
    const onSwitchVersion = () => switchVersion('v2', {
        pathname: pathname || '/',
        loggedIn: !!userId,
        destination: ['/', '/carrinho', '/conversas'].includes(shellPath) ? shellPath : '/',
    })

    const idle = headerView
    return (
        <>
        <style>{`
            @keyframes shellPop { 0% { transform: scale(0.55); opacity: 0.4 } 100% { transform: scale(1); opacity: 1 } }
            @keyframes shellRise { 0% { clip-path: inset(100% 0 0 0 round 36px); transform: translateY(46px); } 100% { clip-path: inset(0% 0 0 0 round 0px); transform: translateY(0); } }
            @media (prefers-reduced-motion: reduce) { .shell-rise-off { animation: none } }
        `}</style>
        <Suspense fallback={null}><ChatThreadWatcher onChange={setThreadOpen} /></Suspense>

        {/* A página: abaixo da ilha; sem cartão deslizando (o menu virou o hub) */}
        <div
            className="relative"
            style={{
                background: colors.background, zIndex: 2,
                marginTop: NAV_H,
                minHeight: `calc(100dvh - ${NAV_H})`,
                paddingBottom: barShown ? `calc(${SHELL_BOTTOM} + ${cartStrip ? STRIP_H : 0}px)` : 40,
                ['--shell-bottom' as string]: barShown ? `calc(${SHELL_BOTTOM} + ${cartStrip ? STRIP_H : 0}px)` : '0px',
                animation: rising ? 'shellRise 700ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
            }}
        >
            <div className="max-w-5xl mx-auto px-4 pt-2">
                {children}
            </div>
        </div>

        {/* Faixa do topo: cobre o que rola por baixo da ilha */}
        <div aria-hidden className="fixed top-0 left-0 right-0 z-30 pointer-events-none" style={{ height: NAV_H, background: `linear-gradient(to bottom, ${colors.background} 70%, transparent)` }} />

        {/* ILHA: foto do modo + cumprimento — ou o que está vivo agora (corrida, pedido, mensagens). Tocar abre o hub (ou vai ao que está vivo). */}
        <div className="fixed left-0 right-0 z-40 pointer-events-none" style={{ top: ISLAND_TOP }}>
            <div className="max-w-5xl mx-auto px-3">
                <div
                    className="pointer-events-auto relative flex items-center gap-2.5 rounded-full pl-2 pr-2"
                    style={{
                        height: ISLAND_H,
                        // Sólida, da cor do fundo das páginas (escura só quando há algo vivo)
                        background: colors.background,
                        border: live ? `1.5px solid ${live.kind === 'chat' ? '#22c55e' : '#f97316'}` : `1px solid ${colors.border}`,
                        boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
                        opacity: drawerOpen ? 0 : 1,
                        transition: 'opacity 200ms ease, background 300ms ease',
                    }}
                >
                    {/* O cartão TODO é um botão: abre o hub (ou vai ao que está vivo) */}
                    <button
                        onClick={() => (live && live.path.split('?')[0] !== shellPath ? go(live.path) : openHub())}
                        aria-label={live ? live.title : 'Abrir menu'}
                        className="absolute inset-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                    />
                    <button onClick={openHub} aria-label={idle.label} className="relative flex-shrink-0 rounded-full" style={{ boxShadow: '0 0 0 2.5px #fff, 0 2px 8px rgba(0,0,0,0.22)' }}>
                        <ModeAvatar userId={userId} image={idle.image} noRing={true} modeIcon={idle.modeIcon} popToken={modeTick} colors={colors} />
                    </button>
                    <div className="relative flex-1 min-w-0 text-left py-1 pointer-events-none">
                        {live ? (
                            <>
                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{live.sub}</span>
                                <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="relative flex-shrink-0 w-2 h-2"><span className={`absolute inset-0 rounded-full ${live.hot ? 'animate-ping' : ''}`} style={{ background: live.kind === 'chat' ? '#22c55e' : '#f97316', opacity: 0.6 }} /><span className="absolute inset-0 rounded-full" style={{ background: live.kind === 'chat' ? '#22c55e' : '#f97316' }} /></span>
                                    <span className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{live.title}</span>
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{idle.line1}</span>
                                <span className="block text-[15px] font-black truncate leading-tight" style={{ color: colors.textPrimary }}>{idle.line2}</span>
                            </>
                        )}
                    </div>
                    <button onClick={openHub} aria-label="Abrir menu" aria-expanded={drawerOpen} className="relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}66`, color: colors.textPrimary }}>
                        <ChevronDown size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* BARRA de baixo (componente compartilhado com a home da 2.0): carrinho, conversas, iUser no centro, radar e a foto (abre o hub) */}
        {barShown && (
            <BottomNavBar
                colors={colors}
                active={activeKey}
                cartCount={topCart}
                cartTotal={cartTotal}
                orderCounts={orderCounts}
                unread={topUnread}
                showCartStrip={cartStrip}
                avatarLabel={idle.label}
                avatar={userId
                    ? <ModeAvatar userId={userId} image={idle.image} noRing={idle.noRing} modeIcon={idle.modeIcon} popToken={0} colors={colors} size={34} />
                    : <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center" style={{ background: `${colors.border}b0`, color: colors.textSecondary }}><User size={19} /></span>}
                onCart={() => go(cartStrip || !(topCart === 0 && ordersActive > 0) ? '/carrinho' : '/carrinho?aba=pedidos')}
                onChat={() => go(userId ? chatPath : '/login')}
                onHome={() => (shellPath === '/' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : go('/'))}
                onRadar={() => go('/radar')}
                onAvatar={openHub}
            />
        )}

        {/* HUB: a ilha cresce e vira o painel. Fundo escurecido; tocar fora fecha. */}
        <div aria-hidden={!drawerOpen} className="fixed inset-0 z-[70]" style={{ pointerEvents: drawerOpen ? 'auto' : 'none', visibility: drawerOpen ? 'visible' : 'hidden', transition: `visibility 0s linear ${drawerOpen ? 0 : 480}ms` }}>
            <button aria-label="Fechar menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'rgba(0,0,0,0.5)', opacity: drawerOpen ? 1 : 0, transition: 'opacity 350ms ease' }} />
            <div className="absolute left-0 right-0" style={{ top: ISLAND_TOP }}>
                <div className="max-w-2xl mx-auto px-3">
                    <div
                        role="dialog"
                        aria-label="Menu do iUser"
                        style={{
                            background: colors.background,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                            ['--hub-bg' as string]: colors.background,
                            ['--hub-fg' as string]: colors.textPrimary,
                            ['--hub-soft' as string]: `${colors.border}40`,
                            ['--hub-panel' as string]: colors.surface,
                            ['--hub-line' as string]: colors.border,
                            borderRadius: 28,
                            maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
                            display: 'flex', flexDirection: 'column',
                            boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                            clipPath: drawerOpen ? 'inset(0% 0% 0% 0% round 28px)' : `inset(0% 0% calc(100% - ${ISLAND_H}px) 0% round 28px)`,
                            opacity: drawerOpen ? 1 : 0,
                            transition: 'clip-path 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease',
                        }}
                    >
                        {/* Cabeçalho = a própria ilha, agora aberta. Logado: o cumprimento e o perfil mesclados num cartão só, no topo */}
                        {userId ? (
                            <HubProfileTop
                                slug={profileSlug}
                                avatarUrl={avatarUrl}
                                userId={userId}
                                colors={colors}
                                popToken={modeTick}
                                unread={topUnread}
                                chatPath={chatPath}
                                onPanel={() => selectMode('perfil')}
                                onGo={goAndClose}
                                onClose={() => setDrawerOpen(false)}
                            />
                        ) : (
                        <div className="flex items-center gap-2.5 pl-2 pr-2 flex-shrink-0" style={{ height: ISLAND_H }}>
                                <span className="flex-shrink-0 rounded-full" style={{ boxShadow: '0 0 0 2px var(--hub-line)' }}>
                                    <ModeAvatar userId={userId} image={idle.image} noRing={true} modeIcon={idle.modeIcon} popToken={modeTick} colors={colors} />
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[11px] truncate opacity-80">{idle.line1}</span>
                                    <span className="block text-[15px] font-black truncate leading-tight">{idle.line2}</span>
                                </span>
                                <button onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)' }}>
                                    <X size={19} />
                                </button>
                            </div>
                        )}
                        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
                            {!userId && (
                                <VisitorDrawerContent recent={recent} onGo={goAndClose} onClose={() => setDrawerOpen(false)} onSwitchVersion={onSwitchVersion} />
                            )}
                            {userId && (
                                <MenuDrawerContent
                                    data={drawerData}
                                    active={activeMode}
                                    recent={recent}
                                    storeOrders={storeOrders}
                                    onSelect={selectMode}
                                    onGo={goAndClose}
                                    onSwitchVersion={onSwitchVersion}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </>
    )
}
