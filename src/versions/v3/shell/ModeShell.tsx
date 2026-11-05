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
    Store as StoreIcon, Car, User, ChevronRight, ChevronDown, X, RotateCcw, ShoppingBag, LayoutDashboard, Check, Plus, Pencil, Bike,
    Search, MapPin, Users, MessagesSquare, MessageCircle, ClipboardList, Wallet,
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
import { registerIslandConsumer, toast, useIslandMessage } from '@/lib/toast'
import { useShellCompact } from '@/lib/shellCompact'
import { toastStyle } from '@/lib/toastStyle'
import BottomNavBar, { BAR_SPACE, STRIP_H, stripVisible, type BarTab } from '@/components/BottomNavBar'
import { switchVersion, versionLabel } from '@/versions/client'
import { activityBadge, isActivityPath, pathOfAba, smartAba, type AtividadeAba } from '@/versions/v3/atividade'
import { BarKindProvider } from '@/versions/v3/bar/kind'
import { activeBarKey, barKindOf, barPathOf, barTabsFor, type BarKey } from '@/versions/v3/bar/domain'
import { LAST_ABA_KEY } from '@/versions/v3/screens/AtividadeTabs'

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

// ===== MENU DE MODOS (o hub; desenho aprovado em /paginateste): uma lista de cards IGUAIS (um por modo), uma linha de botões iguais para o modo
// escolhido e o rodapé. Escolher um card seleciona o modo e abre a página dele, como sempre.
const MODE_COLOR = { user: '#3b82f6', store: '#f97316', car: '#16a34a' } as const

/** Um modo: foto (ou ícone colorido), nome, subtítulo e, à direita, o ✓ do modo escolhido */
function ModeCard({ selected, kind, image, title, desc, dot, onClick }: {
    selected: boolean; kind: keyof typeof MODE_COLOR; image?: string | null; title: string; desc?: string; dot?: string; onClick: () => void
}) {
    const Icon = kind === 'store' ? StoreIcon : kind === 'car' ? Car : User
    return (
        <button
            onClick={onClick}
            aria-pressed={selected}
            className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
            style={{ border: `1.5px solid ${selected ? '#f97316' : 'var(--hub-line)'}`, background: selected ? '#f9731612' : 'transparent' }}
        >
            <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 overflow-hidden" style={{ background: image ? 'var(--hub-soft)' : MODE_COLOR[kind] }}>
                {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <Icon size={18} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight truncate">{title}</span>
                {desc && (
                    <span className="flex items-center gap-1.5 text-[11px] opacity-80 truncate mt-0.5">
                        {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}<span className="truncate">{desc}</span>
                    </span>
                )}
            </span>
            {selected ? <Check size={17} className="flex-shrink-0" style={{ color: '#f97316' }} /> : <ChevronRight size={16} className="flex-shrink-0 opacity-60" />}
        </button>
    )
}

/** Cartão de chamada (cadastrar loja / virar motorista): do mesmo tamanho dos modos, só que tracejado */
function ModeCta({ kind, title, desc, onClick }: { kind: keyof typeof MODE_COLOR; title: string; desc: string; onClick: () => void }) {
    const Icon = kind === 'store' ? StoreIcon : kind === 'car' ? Car : User
    return (
        <button onClick={onClick} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]" style={{ border: '1.5px dashed var(--hub-line)' }}>
            <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)', color: MODE_COLOR[kind] }}><Icon size={18} /></span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight truncate">{title}</span>
                <span className="block text-[11px] opacity-80 truncate mt-0.5">{desc}</span>
            </span>
            <Plus size={16} className="flex-shrink-0 opacity-60" />
        </button>
    )
}

/** A linha de botões iguais do modo escolhido (2 ou 3, mesma largura e altura) */
function ModeActions({ items }: { items: { label: string; icon: ReactNode; onClick: () => void; solid?: boolean }[] }) {
    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map((it) => (
                <button
                    key={it.label}
                    onClick={it.onClick}
                    className="h-10 px-2 flex items-center justify-center gap-1.5 rounded-full text-[12px] font-black transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                    style={it.solid ? { background: '#f97316', color: '#fff' } : { border: '1px solid var(--hub-line)', color: 'var(--hub-fg)' }}
                >
                    {it.icon}<span className="truncate">{it.label}</span>
                </button>
            ))}
        </div>
    )
}

/** O cabeçalho do menu: a pergunta, quem está usando e o fechar */
function HubHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
    return (
        <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5 flex-shrink-0">
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-black leading-tight">{title}</span>
                {sub && <span className="block text-[11px] opacity-80 truncate mt-0.5">{sub}</span>}
            </span>
            <button onClick={onClose} aria-label="Fechar menu" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: '1px solid var(--hub-line)' }}>
                <X size={15} />
            </button>
        </div>
    )
}

function MenuDrawerContent({ data, active, storeOrders, slug, avatarUrl, onSelect, onGo, onSwitchVersion }: {
    onSwitchVersion: () => Promise<void>
    /** Pedidos de cada loja (novos, em preparo, prontos) */
    storeOrders: Record<string, { pending: number; preparing: number; ready: number; services: number }>
    data: DrawerData
    /** Modo selecionado: 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>' */
    active: string
    slug: string | null
    avatarUrl: string | null | undefined
    onSelect: (mode: string) => void; onGo: (path: string) => void
}) {
    const ordersLine = (id: string) => {
        const o = storeOrders[id] || { pending: 0, preparing: 0, ready: 0, services: 0 }
        const going = o.preparing + o.ready
        return {
            o, going,
            text: o.pending + o.services > 0
                ? [o.pending > 0 ? `${o.pending} ${o.pending === 1 ? 'pedido novo' : 'pedidos novos'}` : '', o.services > 0 ? `${o.services} ${o.services === 1 ? 'serviço' : 'serviços'}` : '', going > 0 ? `${going} em andamento` : ''].filter(Boolean).join(' · ')
                : going > 0 ? `${going} ${going === 1 ? 'pedido em andamento' : 'pedidos em andamento'}` : 'Pedidos',
        }
    }
    const selStore = data.stores.find((st) => active === `loja:${st.slug}`)
    const selVehicle = data.vehicles.find((v) => active === `motorista:${v.slug}`)
    const actions: { label: string; icon: ReactNode; onClick: () => void; solid?: boolean }[] | null =
        active === 'perfil' ? [
            ...(slug ? [{ label: 'Ver perfil', icon: <User size={14} className="flex-shrink-0" />, onClick: () => onGo(`/${slug}`) }] : []),
            { label: 'Painel', icon: <LayoutDashboard size={14} className="flex-shrink-0" />, onClick: () => onSelect('perfil'), solid: true },
        ] : selStore ? [
            { label: 'Ver loja', icon: <StoreIcon size={14} className="flex-shrink-0" />, onClick: () => onGo(`/${selStore.slug}`) },
            { label: 'Editar', icon: <Pencil size={14} className="flex-shrink-0" />, onClick: () => onGo(`/editar-loja/${encodeURIComponent(selStore.slug)}`) },
            { label: 'Painel', icon: <LayoutDashboard size={14} className="flex-shrink-0" />, onClick: () => onSelect(`loja:${selStore.slug}`), solid: true },
        ] : selVehicle ? [
            { label: 'Veículo', icon: <Car size={14} className="flex-shrink-0" />, onClick: () => onGo(`/${selVehicle.slug}`) },
            { label: 'Entregas', icon: <Bike size={14} className="flex-shrink-0" />, onClick: () => onGo('/entregas') },
            { label: 'Painel', icon: <LayoutDashboard size={14} className="flex-shrink-0" />, onClick: () => onGo('/painel-motorista'), solid: true },
        ] : null
    return (
        <div className="w-full flex flex-col gap-2 px-3.5 pb-3.5">
            {/* Pessoa */}
            <ModeCard selected={active === 'perfil'} kind="user" image={avatarUrl} title="Pessoa" desc={`${slug ? `@${slug} · ` : ''}comprar, contratar, publicar`} onClick={() => onSelect('perfil')} />
            {/* Lojas */}
            {data.stores.length > 0 ? data.stores.map((st) => {
                const { text, o } = ordersLine(st.id)
                return <ModeCard key={st.id} selected={active === `loja:${st.slug}`} kind="store" image={st.logo} title={st.name} desc={`Modo loja · ${st.open ? 'Aberta agora' : 'Fechada agora'}${o.pending + o.services > 0 ? ` · ${o.pending + o.services} ${o.pending + o.services === 1 ? 'novo' : 'novos'}` : ''}`} dot={st.open ? '#4ade80' : '#fca5a5'} onClick={() => onSelect(`loja:${st.slug}`)} />
            }) : <ModeCta kind="store" title="Criar minha loja" desc="Cadastre sua loja grátis" onClick={() => onGo('/criar-loja')} />}
            {/* Motorista: um card por veículo */}
            {data.vehicles.length > 0 ? data.vehicles.map((v) => (
                <ModeCard key={v.slug} selected={active === `motorista:${v.slug}`} kind="car" image={v.photo} title={`${VEHICLE_LABEL[v.kind] || 'Veículo'}${v.model ? ` · ${v.model}` : ''}`} desc={`Modo motorista · ${data.driverActive ? 'ativado' : 'desligado'}`} dot={data.driverActive ? '#4ade80' : '#fca5a5'} onClick={() => onSelect(`motorista:${v.slug}`)} />
            )) : <ModeCta kind="car" title="Ser motorista" desc="Cadastre seu veículo e receba corridas" onClick={() => onGo('/painel-motorista')} />}

            {/* O que fazer no modo escolhido: botões iguais (e, na loja, os pedidos) */}
            {actions && <div className="pt-1"><ModeActions items={actions} /></div>}
            {selStore && (() => {
                const { text, o } = ordersLine(selStore.id)
                return (
                    <button
                        onClick={() => onGo(`/painel-loja/${encodeURIComponent(selStore.slug)}/pedidos`)}
                        className="w-full h-10 px-3 rounded-full flex items-center gap-2.5 text-xs font-black transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                        style={{ border: '1px solid var(--hub-line)' }}
                    >
                        <ShoppingBag size={16} className="flex-shrink-0" />
                        <span className="flex-1 text-left truncate">{text}</span>
                        {o.pending + o.services > 0
                            ? (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                    {o.pending > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: '#22c55e' }}>{o.pending > 99 ? '99+' : o.pending}</span>}
                                    {o.services > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: '#14b8a6' }}>{o.services > 99 ? '99+' : o.services}</span>}
                                </span>
                            )
                            : <ChevronRight size={14} className="flex-shrink-0 opacity-70" />}
                    </button>
                )
            })()}
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
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
            className="mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-left transition active:scale-[0.98] disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
            style={{ background: 'transparent', border: '1px dashed var(--hub-line)' }}
        >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--hub-soft)' }}>
                <RotateCcw size={16} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight">{busy ? 'Trocando…' : `Voltar para a versão ${versionLabel('v2').replace('iUser ', '')}`}</span>
                <span className="block text-[11px] opacity-80 truncate">Só muda a interface: conta e dados iguais</span>
            </span>
        </button>
    )
}

// Menu de quem não tem conta: o "modo" é o de visitante (já escolhido), mais entrar e criar conta — no mesmo desenho dos modos
function VisitorDrawerContent({ onGo, onClose, onSwitchVersion }: { onGo: (path: string) => void; onClose: () => void; onSwitchVersion: () => Promise<void> }) {
    return (
        <div className="w-full flex flex-col gap-2 px-3.5 pb-3.5">
            <ModeCard selected kind="user" title="Visitante" desc="Navegando sem conta" dot="#fde68a" onClick={onClose} />
            <ModeCta kind="user" title="Entrar" desc="Já tenho conta no iUser" onClick={() => onGo('/login')} />
            <ModeCta kind="user" title="Criar conta" desc="Grátis, leva um minuto" onClick={() => onGo('/cadastrar')} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
    )
}

// A ilha flutua no topo; o conteúdo da página começa abaixo dela (NAV_H, a mesma altura de antes: telas cheias usam --shell-top)
const ISLAND_H = 56
const BAR_BOTTOM_VAR = 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))'   // o menu sobe a partir de onde fica a barra
const NAV_H = 'calc(74px + env(safe-area-inset-top))'
// (--staging-banner-h: a faixa "ambiente de teste" fica embaixo no staging/local; vale 0 em produção)
// Espaço que a barra de baixo ocupa (var --shell-bottom): quem tem algo fixo embaixo se afasta dele
const SHELL_BOTTOM = BAR_SPACE
const LOGO_RING = { border: '2px solid #fff', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' } as const
const LOGO_IMG_SCALE = 1.15
// Páginas "raiz" que mostram a barra de baixo (as demais têm o próprio rodapé, mapa ou campo de digitar)
// Nas páginas de compra, o carrinho vira uma faixa FUNDIDA à barra de baixo (uma peça só) quando há itens
const CART_STRIP_PATHS = ['/', '/comprar', '/lojas', '/produtos']
const BAR_PATHS = ['/', '/social', '/flash', '/entregas', '/comprar', '/lojas', '/produtos', '/digitais', '/servicos-disponiveis', '/atividade', '/carrinho', '/conversas', '/aceitar-corridas', '/ganhos', '/painel-perfil', '/modoprestador', '/imoveis', '/meus-imoveis', '/anunciar-imovel']

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
    const [drawerData, setDrawerData] = useState<DrawerData>({ stores: [], vehicles: [], driverActive: false, providerOn: false })
    const [dataLoaded, setDataLoaded] = useState(false)
    // Pedidos de cada loja da pessoa (novos, em preparo, prontos): aparecem no cartão da loja do menu
    const [storeOrders, setStoreOrders] = useState<Record<string, { pending: number; preparing: number; ready: number; services: number }>>({})
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
        if (!storeIdsKey) return
        let cancelled = false
        const load = async () => {
            if (document.hidden && !drawerOpen) return
            const ids = storeIdsKey.split(',')
            const [{ data }, { data: svc }] = await Promise.all([
                supabase.from('orders').select('store_id, status').in('store_id', ids).in('status', ['pending', 'preparing', 'ready']),
                // pedidos de SERVIÇO (agendamentos que a loja ainda precisa aceitar)
                supabase.from('appointments').select('store_id').in('store_id', ids).eq('status', 'pending'),
            ])
            if (cancelled || !data) return
            const next: Record<string, { pending: number; preparing: number; ready: number; services: number }> = {}
            const slot = (id: string) => next[id] || (next[id] = { pending: 0, preparing: 0, ready: 0, services: 0 })
            for (const r of data as { store_id: string; status: 'pending' | 'preparing' | 'ready' }[]) slot(r.store_id)[r.status] += 1
            for (const r of (svc || []) as { store_id: string }[]) slot(r.store_id).services += 1
            setStoreOrders(next)
        }
        load()
        const t = setInterval(load, 15_000)
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
        // sobe da barra só ao ENTRAR na Atividade vindo de fora (trocar de subaba — conversas, pedidos, carrinho — não repete a animação)
        if (prev === null || isActivityPath(prev) || !isActivityPath(shellPath)) return
        setRising(true)
        const t = setTimeout(() => setRising(false), 750)
        return () => clearTimeout(t)
    }, [shellPath])
    // A barra acompanha o MODO: pessoa (Perto · Social · Atividade), loja (Painel · Pedidos · Conversas) ou motorista (Corridas · Entregas · Ganhos)
    const { kind: barKind, storeSlug: barStore } = barKindOf(activeMode, drawerData.stores.map((st) => st.slug))
    const barActive = activeBarKey(barKind, shellPath, barStore)
    const onCartPage = shellPath.startsWith('/carrinho')
    // A barra de baixo só nas páginas "raiz"
    const barShown = (BAR_PATHS.includes(shellPath) || shellPath.startsWith('/painel-loja/') || shellPath.startsWith('/editar-loja/')) && !(shellPath === '/conversas' && threadOpen)
    const cartStrip = barShown && topCart > 0 && CART_STRIP_PATHS.includes(shellPath)
    // Pedidos NOVOS da loja que a pessoa atende: no modo dessa loja, vêm antes das mensagens na ilha
    const storeNew = (() => {
        const modeSlug = activeMode.startsWith('loja:') ? activeMode.slice(5) : null
        const st = (modeSlug && drawerData.stores.find((x) => x.slug === modeSlug)) || drawerData.stores.find((x) => (storeOrders[x.id]?.pending || 0) + (storeOrders[x.id]?.services || 0) > 0)
        if (!st) return null
        return { products: storeOrders[st.id]?.pending || 0, services: storeOrders[st.id]?.services || 0, name: st.name, path: `/painel-loja/${encodeURIComponent(st.slug)}`, prefer: !!modeSlug && st.slug === modeSlug }
    })()
    // AVISOS (lib/toast): enquanto há uma mensagem a ilha vira o MENSAGEIRO dela (cor e símbolo do tipo, some sozinha; tocar dispensa) e depois volta ao que era
    const { msg: islandMsg, waiting: msgWaiting } = useIslandMessage()
    useEffect(() => {
        if (!islandMsg) return
        const t = setTimeout(() => toast.dismiss(islandMsg.id), msgWaiting > 0 ? Math.min(islandMsg.duration, 2400) : islandMsg.duration)
        return () => clearTimeout(t)
    }, [islandMsg?.id, msgWaiting > 0])   // eslint-disable-line react-hooks/exhaustive-deps
    const msgStyle = islandMsg ? toastStyle(islandMsg.kind) : null
    const live = useShellLive(userId, orderCounts, topUnread, chatPath, storeNew, { count: topCart, total: cartTotal })
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

    // Sem ilha em cima: a página começa logo abaixo da área segura. Os avisos (toast) aparecem na FAIXA da barra de baixo; onde a barra não existe
    // (páginas de produto/loja/mapas, conversa aberta) ou o Percurso cobre a tela, a pílula do topo (IslandToastFallback) cuida deles.
    const compactLabel = useShellCompact()
    const compact = !!compactLabel
    const navH = 'calc(10px + env(safe-area-inset-top))'
    useEffect(() => (barShown && !compact ? registerIslandConsumer() : undefined), [barShown, compact])
    // A faixa da barra: o que está vivo além do carrinho e dos status (a corrida e os pedidos novos da loja)
    const barExtras = (live?.parts || []).filter((x) => x.key === 'ride' || x.key === 'store-p' || x.key === 'store-s').map((x) => ({ key: x.key as string, text: x.text, color: x.color, path: x.path || live!.path }))
    // A faixa de cima da barra (carrinho nas páginas de compra + status dos pedidos) ocupa espaço extra embaixo da página
    const stripShown = barShown && stripVisible({ onCartPage, cartExpanded: cartStrip, cartCount: topCart, extras: barExtras.length })

    const idle = headerView
    // O conteúdo do menu de modos (vive dentro da barra: BottomNavBar o faz crescer para cima)
    const hubInner = (
        <>
        <HubHeader
            title={userId ? 'Com qual modo você quer usar o iUser?' : 'Você está como visitante'}
            sub={userId && profileSlug ? `@${profileSlug}` : undefined}
            onClose={() => setDrawerOpen(false)}
        />
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
            {!userId && (
                <VisitorDrawerContent onGo={goAndClose} onClose={() => setDrawerOpen(false)} onSwitchVersion={onSwitchVersion} />
            )}
            {userId && (
                <MenuDrawerContent
                    data={drawerData}
                    active={activeMode}
                    storeOrders={storeOrders}
                    slug={profileSlug}
                    avatarUrl={avatarUrl}
                    onSelect={selectMode}
                    onGo={goAndClose}
                    onSwitchVersion={onSwitchVersion}
                />
            )}
        </div>
        </>
    )
    const hubVars = {
        ['--hub-bg' as string]: colors.background,
        ['--hub-fg' as string]: colors.textPrimary,
        ['--hub-soft' as string]: `${colors.border}40`,
        ['--hub-panel' as string]: colors.surface,
        ['--hub-line' as string]: colors.border,
    } as React.CSSProperties


    // As abas da barra (Explorar + três do modo): para onde cada uma leva e o selo
    const ICON: Record<BarKey, ReactNode> = {
        home: <Search size={22} />, radar: <MapPin size={22} />, people: <Users size={22} />, activity: <MessagesSquare size={22} />,
        panel: <LayoutDashboard size={22} />, orders: <ClipboardList size={22} />, chat: <MessageCircle size={22} />,
        rides: <Car size={22} />, deliveries: <Bike size={22} />, earnings: <Wallet size={22} />,
    }
    const barStoreId = barStore ? drawerData.stores.find((st) => st.slug === barStore)?.id : null
    const barStoreNew = barStoreId ? (storeOrders[barStoreId]?.pending || 0) + (storeOrders[barStoreId]?.services || 0) : 0
    const openTab = (key: BarKey) => {
        if (key === barActive) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }   // tocar na aba da página em que já está volta ao topo
        if (key === 'activity') {
            // a aba Atividade leva ao que pede atenção (pedido pronto, mensagem, pedido em andamento, carrinho); senão, à última subaba usada
            let last: AtividadeAba | null = null
            try { last = localStorage.getItem(LAST_ABA_KEY) as AtividadeAba | null } catch { /* sem armazenamento */ }
            if (!userId) { go(topCart > 0 ? '/carrinho' : '/login'); return }   // visitante: só o carrinho existe sem conta
            go(pathOfAba(smartAba({ unread: topUnread, orders: orderCounts, cart: topCart, last })))
            return
        }
        const path = barPathOf(key, barStore)
        if (path) go(path)
    }
    const barTabs: BarTab[] = barTabsFor(barKind).map((def) => {
        const badge = def.key === 'activity' ? activityBadge(topUnread, orderCounts)
            : def.key === 'orders' ? { count: barStoreNew, color: '#22c55e' }
            : def.key === 'chat' ? { count: topUnread, color: '#16a34a' }
            : null
        return { key: def.key, label: def.label, icon: ICON[def.key], active: barActive === def.key, onClick: () => openTab(def.key), badge: badge?.count || 0, badgeColor: badge?.color, pulse: def.key === 'activity' && (badge?.count || 0) > 0 }
    })

    return (
        <>
        <style>{`
            @keyframes shellPop { 0% { transform: scale(0.55); opacity: 0.4 } 100% { transform: scale(1); opacity: 1 } }
            @keyframes shellRise { 0% { clip-path: inset(100% 0 0 0 round 36px); transform: translateY(46px); } 100% { clip-path: inset(0% 0 0 0 round 0px); transform: translateY(0); } }
            @media (prefers-reduced-motion: reduce) { .shell-rise-off { animation: none } }
        `}</style>
        <Suspense fallback={null}><ChatThreadWatcher onChange={setThreadOpen} /></Suspense>

        {/* A página: começa logo abaixo da área segura (a ilha do topo foi mesclada à barra de baixo); sem cartão deslizando (o menu virou o hub) */}
        <div
            className="relative"
            style={{
                background: colors.background, zIndex: 2,
                marginTop: navH,
                minHeight: `calc(100dvh - ${navH})`,
                ['--shell-top' as string]: navH,
                paddingBottom: barShown ? `calc(${SHELL_BOTTOM} + ${stripShown ? STRIP_H : 0}px)` : 40,
                ['--shell-bottom' as string]: barShown ? `calc(${SHELL_BOTTOM} + ${stripShown ? STRIP_H : 0}px)` : '0px',
                animation: rising ? 'shellRise 700ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
            }}
        >
            <BarKindProvider kind={barKind}>
            <div className="max-w-5xl mx-auto px-4 pt-2">
                {children}
            </div>
            </BarKindProvider>
        </div>

        {/* BARRA de baixo: faixa de cima (carrinho nas páginas de compra + status dos pedidos) e seis botões iguais: carrinho, conversas, MODO ativo (abre o hub), radar, Social e lupa */}
        {barShown && (
            <BottomNavBar
                colors={colors}
                tabs={barTabs}
                cartCount={topCart}
                cartTotal={cartTotal}
                cartExpanded={cartStrip}
                onCartPage={onCartPage}
                mode={{ avatar: <ModeAvatar userId={userId} image={idle.image} noRing={true} modeIcon={idle.modeIcon} popToken={modeTick} colors={colors} size={28} />, kind: view.icon, label: idle.label, onOpen: drawerOpen ? () => setDrawerOpen(false) : openHub }}
                hub={{ open: drawerOpen, label: 'Menu do iUser', vars: hubVars, children: hubInner }}
                onCart={() => go('/carrinho')}
                message={islandMsg && msgStyle ? { id: islandMsg.id, text: islandMsg.text, description: islandMsg.description, icon: islandMsg.icon, glyph: msgStyle.glyph, color: msgStyle.color, action: islandMsg.action ? { label: islandMsg.action.label, onClick: islandMsg.action.onClick } : undefined } : null}
                extras={barExtras}
                customCard={islandMsg?.custom ? islandMsg.custom(islandMsg.id) : null}
                onDismiss={() => { if (islandMsg) toast.dismiss(islandMsg.id) }}
                onGo={(path) => go(path)}
            />
        )}

        {/* HUB: o menu de modos é a PRÓPRIA barra crescendo para cima (o conteúdo vive dentro dela, em BottomNavBar); aqui só fica o fundo escurecido, que fecha ao tocar */}
        <button aria-label="Fechar menu" aria-hidden={!drawerOpen} tabIndex={drawerOpen ? 0 : -1} onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-[70] w-full h-full cursor-default" style={{ background: 'rgba(0,0,0,0.5)', opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none', visibility: drawerOpen ? 'visible' : 'hidden', transition: `opacity 350ms ease, visibility 0s linear ${drawerOpen ? 0 : 350}ms` }} />
        </>
    )
}
