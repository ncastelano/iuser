// src/components/ModeShell.tsx
//
// Casca das páginas "de modo" (/modeloinicial, /modoprestador...): o topo com selo (logo/foto), cumprimento do modo,
// atalhos de conversas e carrinho, e o menu lateral (drawer) em que a pessoa escolhe o modo — Meu perfil/prestador,
// loja ou motorista. O menu empurra a página pra direita. O conteúdo de cada página entra como `children`.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
    Store as StoreIcon, Car, Wrench, MessageCircle, ShoppingCart, User, LogIn, LogOut, ChevronRight, X, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useCartStore } from '@/store/useCartStore'
import { hexToRgb } from '@/lib/color'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const toPublicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ===================== MENU LATERAL (DRAWER) =====================
// Abre ao tocar no selo/nome do topo. A página inteira desliza pra direita (encolhendo um pouco, com cantos arredondados
// e sombra), revelando o menu sobre o degradê do iUser. Cada modo tem a sua página: Meu perfil (/painel-perfil), Modo
// prestador (/modoprestador), cada loja (/painel-loja/<slug>) e cada veículo (/<vehicle_slug>).
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
function DrawerRow({ mode, active, icon, image, title, desc, dot, onSelect, actions }: {
    mode: string; active: string; icon: ReactNode; image?: string | null; title: string; desc?: string; dot?: string
    onSelect: (mode: string) => void
    /** Botões extras embaixo da linha (ex.: "Ver loja" e "Painel") */
    actions?: ReactNode
}) {
    const selected = active === mode
    return (
        <div
            className="rounded-2xl"
            style={selected ? { background: 'rgba(255,255,255,0.22)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.85)' } : undefined}
        >
            <button
                onClick={() => onSelect(mode)}
                aria-pressed={selected}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-white transition hover:bg-white/15 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.18)' }}>
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
                {selected
                    ? <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white flex items-center justify-center" title="Modo selecionado"><Check size={14} color="#dc2626" strokeWidth={3} /></span>
                    : <ChevronRight size={16} className="flex-shrink-0 opacity-70" />}
            </button>
            {actions && <div className="flex gap-2 px-3 pb-2.5 pt-0.5">{actions}</div>}
        </div>
    )
}

/** Botão pequeno de ação dentro de uma linha do menu */
function DrawerPill({ onClick, children, solid = false }: { onClick: () => void; children: ReactNode; solid?: boolean }) {
    return (
        <button
            onClick={onClick}
            className="flex-1 py-2 rounded-full text-xs font-black transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={solid ? { background: '#fff', color: '#dc2626' } : { background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.45)' }}
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-white transition hover:bg-white/15 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ border: '1.5px dashed rgba(255,255,255,0.6)' }}
        >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-tight truncate">{title}</span>
                <span className="block text-xs opacity-90 truncate">{desc}</span>
            </span>
            <ChevronRight size={16} className="flex-shrink-0 opacity-70" />
        </button>
    )
}

function DrawerLabel({ children }: { children: ReactNode }) {
    return <p className="px-3 pt-2 pb-1 text-[11px] font-black uppercase tracking-widest text-white/80">{children}</p>
}

function MenuDrawerContent({ slug, avatarUrl, data, active, onSelect, onGo, onClose }: {
    slug: string | null; avatarUrl: string | null | undefined; data: DrawerData
    /** Modo selecionado: 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>' */
    active: string
    onSelect: (mode: string) => void; onGo: (path: string) => void; onClose: () => void
}) {
    // Cada grupo é um painel separado, com o seu título
    const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
        <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <DrawerLabel>{title}</DrawerLabel>
            <div className="flex flex-col gap-1.5">{children}</div>
        </section>
    )

    return (
        <div className="h-full w-full flex flex-col px-4 pt-6 pb-8 overflow-y-auto">
            {/* Só o fechar: a foto e o @ aparecem uma vez só, no cartão "Meu perfil" logo abaixo */}
            <div className="flex justify-end">
                <button onClick={onClose} aria-label="Fechar menu" className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/15 flex-shrink-0">
                    <X size={20} />
                </button>
            </div>

            <Panel title="Modo motorista">
                {data.vehicles.length > 0 ? data.vehicles.map((v) => (
                    <DrawerRow
                        key={v.slug}
                        mode={`motorista:${v.slug}`}
                        active={active}
                        onSelect={onSelect}
                        icon={<Car size={20} color="#fff" />}
                        image={v.photo}
                        title={`${VEHICLE_LABEL[v.kind] || 'Veículo'}${v.model ? ` · ${v.model}` : ''}`}
                        desc={data.driverActive ? 'Motorista ativado' : 'Motorista desligado'}
                        dot={data.driverActive ? '#4ade80' : '#fca5a5'}
                    />
                )) : (
                    <DrawerCta icon={<Car size={20} color="#fff" />} title="Ser motorista" desc="Cadastre seu veículo e receba corridas" onClick={() => onGo('/painel-motorista')} />
                )}
            </Panel>

            <Panel title="Modo loja">
                {data.stores.length > 0 ? data.stores.map((st) => (
                    <DrawerRow
                        key={st.id}
                        mode={`loja:${st.slug}`}
                        active={active}
                        onSelect={onSelect}
                        icon={<StoreIcon size={20} color="#fff" />}
                        image={st.logo}
                        title={st.name}
                        desc={st.open ? 'Aberta agora' : 'Fechada agora'}
                        dot={st.open ? '#4ade80' : '#fca5a5'}
                        actions={(
                            <>
                                <DrawerPill onClick={() => onGo(`/${st.slug}`)}>Ver loja</DrawerPill>
                                <DrawerPill solid onClick={() => onGo(`/painel-loja/${encodeURIComponent(st.slug)}`)}>Painel</DrawerPill>
                            </>
                        )}
                    />
                )) : (
                    <DrawerCta icon={<StoreIcon size={20} color="#fff" />} title="Criar minha loja" desc="Cadastre sua loja grátis" onClick={() => onGo('/criar-loja')} />
                )}
            </Panel>


            {/* Meu perfil: tudo num cartão só — foto, @, modo prestador (a bolinha verde) e os dois botões */}
            <Panel title="Meu perfil">
                <DrawerRow
                    mode="perfil"
                    active={active}
                    onSelect={onSelect}
                    icon={<User size={20} color="#fff" />}
                    image={avatarUrl}
                    title={slug ? `@${slug}` : 'Meu perfil'}
                    desc={data.providerOn ? 'Modo prestador ligado' : undefined}
                    dot={data.providerOn ? '#4ade80' : undefined}
                    actions={(
                        <>
                            {slug && <DrawerPill onClick={() => onGo(`/${slug}`)}>Ver perfil</DrawerPill>}
                            <DrawerPill solid onClick={() => onGo('/painel-perfil')}>Painel</DrawerPill>
                            {data.providerOn && <DrawerPill onClick={() => onGo('/modoprestador')}>Serviços</DrawerPill>}
                        </>
                    )}
                />
            </Panel>
        </div>
    )
}

// Selo redondo do topo, do tamanho de um avatar. Visitante: só a logo do iUser. Logado: a cada 5 s a "página vira"
// (giro em 3D, a logo numa face e a foto do perfil na outra). Tocar leva ao perfil (foto) ou à home (logo).
// A borda do plano é desenhada POR FORA da foto (3 px de cada lado) — por isso a foto fica menor quando tem borda,
// pro conjunto ter exatamente o mesmo tamanho da logo.
const BADGE = 48
function HeaderBadge({ userId, avatarUrl, onProfile, onHome, colors, noRing = false, label = 'Meu perfil', modeIcon, popToken = 0 }: {
    userId: string | null; avatarUrl: string | null | undefined; onProfile: () => void; onHome: () => void; colors: any
    /** Imagem que não é do perfil (logo da loja, foto do carro): sem a borda do plano */
    noRing?: boolean
    label?: string
    /** Ícone do modo atual: aparece primeiro e, 300 ms depois de trocar de modo, vira a imagem */
    modeIcon?: ReactNode
    /** Sobe a cada troca de modo: a nova imagem entra com um "estouro" (0 = sem animação, carga inicial) */
    popToken?: number
}) {
    const [showAvatar, setShowAvatar] = useState(true)
    // Troca de modo (popToken muda): mostra o ícone, e só 300 ms depois vira a imagem — nunca fica um instante sem nada
    // (derivado do token: na mesma renderização da troca já começa pelo ícone, sem piscar a imagem nova antes)
    const [shownToken, setShownToken] = useState(popToken)
    const imageShown = shownToken === popToken
    useEffect(() => {
        if (shownToken === popToken) return
        const t = setTimeout(() => setShownToken(popToken), 300)
        return () => clearTimeout(t)
    }, [popToken, shownToken])
    const planRing = usePlanRing(userId)
    const hasRing = planRing && !noRing
    useEffect(() => {
        if (!userId) return
        const t = setInterval(() => setShowAvatar((v) => !v), 5000)
        return () => clearInterval(t)
    }, [userId])

    const avatarOn = !!userId && showAvatar
    const avatarSize = hasRing ? BADGE - 6 : BADGE
    const face = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as const
    return (
        <div className="flex-shrink-0" style={{ width: BADGE, height: BADGE, perspective: 600 }}>
            <div
                className="relative w-full h-full"
                style={{
                    transformStyle: 'preserve-3d',
                    transition: 'transform 900ms cubic-bezier(0.45, 0, 0.2, 1)',
                    transform: avatarOn || !userId ? 'rotateY(0deg)' : 'rotateY(180deg)',
                }}
            >
                {/* Frente: a foto do perfil (ou, sem conta, a logo) */}
                {userId ? (
                    <button onClick={onProfile} aria-label={label} className="flex items-center justify-center rounded-full" style={face}>
                        <PlanAvatarRing userId={noRing ? null : userId} width={2} linkToProfile={false}>
                            <span className="block rounded-full overflow-hidden" style={{ width: avatarSize, height: avatarSize, perspective: 300 }}>
                                <span key={popToken} className="relative block w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
                                    {/* Ícone do modo: aparece primeiro; só some quando a imagem já está pronta pra entrar */}
                                    <span
                                        className="absolute inset-0 rounded-full flex items-center justify-center text-white"
                                        style={{
                                            background: GRADIENT, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                                            transition: 'transform 600ms cubic-bezier(0.45, 0, 0.2, 1)',
                                            transform: imageShown ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                        }}
                                    >
                                        {modeIcon || <User size={20} />}
                                    </span>
                                    <span
                                        className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center"
                                        style={{
                                            background: `${colors.border}60`, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                                            transition: 'transform 600ms cubic-bezier(0.45, 0, 0.2, 1)',
                                            transform: imageShown ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                                        }}
                                    >
                                        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (modeIcon || <User size={20} style={{ color: colors.textSecondary }} />)}
                                    </span>
                                </span>
                            </span>
                        </PlanAvatarRing>
                    </button>
                ) : (
                    <button onClick={onHome} aria-label="iUser" className="flex items-center justify-center rounded-full" style={face}>
                        <img src="/logo.png" alt="iUser" className="w-full h-full object-contain" />
                    </button>
                )}
                {/* Verso: a logo (só existe pra quem está logado) */}
                {userId && (
                    <button onClick={onHome} aria-label="iUser" className="flex items-center justify-center rounded-full" style={{ ...face, transform: 'rotateY(180deg)' }}>
                        <img src="/logo.png" alt="iUser" className="w-full h-full object-contain" />
                    </button>
                )}
            </div>
        </div>
    )
}


export default function ModeShell({ children }: { children: ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const { userId, profileSlug, avatarUrl, loading: profileLoading } = useProfile()
    const go = (path: string) => router.push(path)

    // Selos do topo: não lidas do chat e itens do carrinho
    const topUnread = useChatUnread(userId)
    const cartMap = useCartStore((st) => st.itemsByStore)
    const [cartReady, setCartReady] = useState(false)
    useEffect(() => setCartReady(true), [])
    const topCart = cartReady ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0

    // Menu lateral: abre pelo avatar. Carrega o que a pessoa tem (loja, veículo, modo prestador) pra mostrar só isso.
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerData, setDrawerData] = useState<DrawerData>({ stores: [], vehicles: [], driverActive: false, providerOn: false })
    const [dataLoaded, setDataLoaded] = useState(false)
    // Modo selecionado (guardado no aparelho, por conta): 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>'
    const [activeMode, setActiveMode] = useState('perfil')
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

    // Fecha com ESC e trava a rolagem da página enquanto o menu está aberto
    useEffect(() => {
        if (!drawerOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [drawerOpen])
    const DRAWER_W = 'min(78vw, 300px)'

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
        return { ...base, mode: 'perfil', line1: userId ? 'Bem-vindo de volta' : 'Bem-vindo ao iUser', line2: profileSlug ? `@${profileSlug}` : 'Visitante', image: avatarUrl || null }
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
    const goAndClose = (path: string) => { setDrawerOpen(false); router.push(path) }

    return (
        <>
        {/* Fundo do menu: degradê do iUser, atrás de tudo (só aparece quando a página desliza) */}
        <div
            aria-hidden={!drawerOpen}
            className="fixed inset-0"
            style={{ background: 'linear-gradient(200deg, #f97316 0%, #dc2626 100%)', zIndex: 0 }}
        />
        {/* O menu fica no lado DIREITO e a página desliza pra esquerda */}
        <div
            className="fixed right-0 top-0 h-dvh"
            style={{
                width: DRAWER_W, zIndex: 1,
                opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
                transform: drawerOpen ? 'translateX(0)' : 'translateX(24px)',
                transition: 'opacity 350ms ease, transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
        >
            {userId && (
                <MenuDrawerContent
                    slug={profileSlug}
                    avatarUrl={avatarUrl}
                    data={drawerData}
                    active={activeMode}
                    onSelect={selectMode}
                    onGo={goAndClose}
                    onClose={() => setDrawerOpen(false)}
                />
            )}
        </div>

        {/* A página: desliza pra esquerda e encolhe um pouco, com cantos arredondados e sombra */}
        <div
            className="relative min-h-dvh pb-28"
            style={{
                background: colors.background, zIndex: 2,
                transformOrigin: 'right top',
                // desce um pouco (7% da altura) além de deslizar e encolher: a janela fica mais pra baixo, com folga em cima
                transform: drawerOpen ? `translateX(calc(-1 * ${DRAWER_W})) translateY(7dvh) scale(0.9)` : 'none',
                borderRadius: drawerOpen ? 32 : 0,
                boxShadow: drawerOpen ? '12px 0 40px rgba(0,0,0,0.35)' : 'none',
                height: drawerOpen ? '100dvh' : undefined,
                overflow: drawerOpen ? 'hidden' : undefined,
                transition: 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 450ms ease, box-shadow 450ms ease',
            }}
        >
            {/* Toque na página (com o menu aberto) fecha o menu */}
            {drawerOpen && <div className="absolute inset-0 z-[60] cursor-pointer" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" />}

            <div className="max-w-5xl mx-auto px-4 pt-4">
                {children}
            </div>

            {/* Navegação embaixo (o antigo cabeçalho, invertido): sair, carrinho e conversas à esquerda; o modo
                (nome + selo) à direita, do lado do menu */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-40 border-t"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.94)`,
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    borderColor: colors.border,
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2.5">
                    {userId ? (
                        <button
                            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/modeloinicial' }}
                            aria-label="Sair"
                            title="Sair"
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${colors.border}50`, color: colors.textSecondary }}
                        >
                            <LogOut size={17} />
                        </button>
                    ) : (
                        <button onClick={() => go('/login')} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black text-white flex-shrink-0" style={{ background: GRADIENT }}>
                            <LogIn size={15} /> Entrar
                        </button>
                    )}

                    <button
                        onClick={() => go('/carrinho')}
                        aria-label="Carrinho"
                        className="relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105 active:scale-95"
                        style={{ background: topCart > 0 ? '#ea580c' : `${colors.border}50`, color: topCart > 0 ? '#fff' : colors.textPrimary }}
                    >
                        <ShoppingCart size={20} />
                        {topCart > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-red-500 text-white flex items-center justify-center">{topCart > 99 ? '99+' : topCart}</span>
                        )}
                    </button>

                    <button
                        onClick={() => go(userId ? '/conversas' : '/login')}
                        aria-label="Conversas"
                        className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105 active:scale-95 ${topUnread > 0 ? 'animate-pulse' : ''}`}
                        style={{ background: topUnread > 0 ? '#16a34a' : `${colors.border}50`, color: topUnread > 0 ? '#fff' : colors.textPrimary }}
                    >
                        <MessageCircle size={20} />
                        {topUnread > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-red-500 text-white flex items-center justify-center">{topUnread > 99 ? '99+' : topUnread}</span>
                        )}
                    </button>

                    {/* Nome, frase e triângulo: um botão só — abre/fecha o menu (igual ao selo) */}
                    {userId ? (
                        <button
                            type="button"
                            onClick={() => { window.scrollTo({ top: 0 }); setDrawerOpen((v) => !v) }}
                            aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu'}
                            aria-expanded={drawerOpen}
                            className="min-w-0 flex-1 text-right rounded-xl py-1 transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                        >
                            <span className="block text-xs truncate" style={{ color: colors.textSecondary }}>{headerView.line1}</span>
                            <span className="flex items-center justify-end gap-1.5 min-w-0">
                                {/* Triângulo: aponta pra cima com o menu fechado e vira pro lado do menu (direita) quando aberto */}
                                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${colors.border}55` }}>
                                    <svg
                                        width="10" height="9" viewBox="0 0 10 9" aria-hidden
                                        style={{ transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)', transform: drawerOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                    >
                                        <polygon points="5,0 10,9 0,9" fill={colors.textPrimary} />
                                    </svg>
                                </span>
                                <span className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{headerView.line2}</span>
                            </span>
                        </button>
                    ) : (
                        <div className="min-w-0 flex-1 text-right">
                            <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{headerView.line1}</p>
                            <p className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{headerView.line2}</p>
                        </div>
                    )}

                    <HeaderBadge
                        userId={userId}
                        avatarUrl={headerView.image}
                        colors={colors}
                        noRing={headerView.noRing}
                        label={headerView.label}
                        modeIcon={headerView.modeIcon}
                        popToken={modeTick}
                        onProfile={() => { window.scrollTo({ top: 0 }); setDrawerOpen(true) }}
                        // A logo (outra face do selo) também abre o menu; só o visitante, que não tem menu, vai pra home
                        onHome={() => { if (userId) { window.scrollTo({ top: 0 }); setDrawerOpen(true) } else go('/') }}
                    />
                </div>
            </nav>
        </div>
        </>
    )
}
