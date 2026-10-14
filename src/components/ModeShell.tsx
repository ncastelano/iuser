// src/components/ModeShell.tsx
//
// Casca das páginas "de modo" (/modeloinicial, /modoprestador...): o topo com selo (logo/foto), cumprimento do modo,
// atalhos de conversas e carrinho, e o menu lateral (drawer) em que a pessoa escolhe o modo — Meu perfil/prestador,
// loja ou motorista. O menu empurra a página pra direita. O conteúdo de cada página entra como `children`.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
    Store as StoreIcon, Car, MessageCircle, ShoppingCart, User, LogIn, LogOut, ChevronRight, X, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useCartStore } from '@/store/useCartStore'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const toPublicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ===================== MENU LATERAL (DRAWER) =====================
// Abre ao tocar na foto do perfil. A página inteira desliza pra direita (encolhendo um pouco, com cantos arredondados e
// sombra), revelando o menu sobre o degradê do iUser. Só mostra o que a pessoa realmente tem: loja, veículo, inscrições.
interface DrawerData {
    stores: { id: string; name: string; slug: string; logo: string | null; open: boolean }[]
    vehicles: { kind: string; model: string | null; plate: string | null; photo: string | null }[]
    /** Modo motorista ligado (driver_pricing.driver_mode_active) */
    driverActive: boolean
    /** Modo prestador ligado no perfil (profiles.service_mode_active) */
    providerOn: boolean
}
const VEHICLE_LABEL: Record<string, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

// Linha de um modo no menu: mostra a imagem do modo (foto do perfil, logo da loja, foto do carro) ou, sem imagem, o ícone.
// Nada some nem aparece aqui — a animação de troca acontece só no topo da página (seção "Bem-vindo").
function DrawerRow({ mode, active, icon, image, title, desc, dot, onSelect }: {
    mode: string; active: string; icon: ReactNode; image?: string | null; title: string; desc?: string; dot?: string; onSelect: (mode: string) => void
}) {
    const selected = active === mode
    return (
        <button
            onClick={() => onSelect(mode)}
            aria-pressed={selected}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-white transition hover:bg-white/15 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={selected ? { background: 'rgba(255,255,255,0.22)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.85)' } : undefined}
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
    )
}

function DrawerLabel({ children }: { children: ReactNode }) {
    return <p className="px-3 pt-2 pb-1 text-[11px] font-black uppercase tracking-widest text-white/80">{children}</p>
}

function MenuDrawerContent({ slug, avatarUrl, data, active, onSelect, onClose }: {
    slug: string | null; avatarUrl: string | null | undefined; data: DrawerData
    /** Modo selecionado: 'perfil' | 'loja:<slug>' | 'motorista:<tipo>' */
    active: string
    onSelect: (mode: string) => void; onClose: () => void
}) {
    // Cada grupo é um painel separado, com o seu título: perfil/prestador, lojas e motorista
    const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
        <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <DrawerLabel>{title}</DrawerLabel>
            <div className="flex flex-col gap-1">{children}</div>
        </section>
    )

    return (
        <div className="h-full w-full flex flex-col px-4 pt-6 pb-8 overflow-y-auto">
            <div className="flex items-center gap-3 px-1">
                <span className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border-2 border-white/80" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <User size={26} color="#fff" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-white truncate">{slug ? `@${slug}` : 'Minha conta'}</span>
                </span>
                <button onClick={onClose} aria-label="Fechar menu" className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/15 flex-shrink-0">
                    <X size={20} />
                </button>
            </div>

            <Panel title={data.providerOn ? 'Modo prestador' : 'Meu perfil'}>
                <DrawerRow
                    mode="perfil"
                    active={active}
                    onSelect={onSelect}
                    icon={<User size={20} color="#fff" />}
                    image={avatarUrl}
                    title="Meu perfil"
                    desc={data.providerOn ? 'Modo prestador ligado' : slug ? `@${slug}` : undefined}
                    dot={data.providerOn ? '#4ade80' : undefined}
                />
            </Panel>

            {data.stores.length > 0 && (
                <Panel title="Modo loja">
                    {data.stores.map((st) => (
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
                        />
                    ))}
                </Panel>
            )}

            {data.vehicles.length > 0 && (
                <Panel title="Modo motorista">
                    {data.vehicles.map((v) => (
                        <DrawerRow
                            key={v.kind}
                            mode={`motorista:${v.kind}`}
                            active={active}
                            onSelect={onSelect}
                            icon={<Car size={20} color="#fff" />}
                            image={v.photo}
                            title={`${VEHICLE_LABEL[v.kind] || 'Veículo'}${v.model ? ` · ${v.model}` : ''}`}
                            desc={data.driverActive ? 'Motorista ativado' : 'Motorista desligado'}
                            dot={data.driverActive ? '#4ade80' : '#fca5a5'}
                        />
                    ))}
                </Panel>
            )}
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
    const { userId, profileSlug, avatarUrl } = useProfile()
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
    // Modo selecionado (guardado no aparelho, por conta): 'perfil' | 'loja:<slug>' | 'motorista:<tipo>'
    const [activeMode, setActiveMode] = useState('perfil')
    const [modeTick, setModeTick] = useState(0)
    useEffect(() => {
        if (!userId) return
        try { setActiveMode(localStorage.getItem(`iuser_mode_${userId}`) || 'perfil') } catch { /* sem armazenamento */ }
    }, [userId])
    useEffect(() => {
        if (!userId) { setDrawerData({ stores: [], vehicles: [], driverActive: false, providerOn: false }); return }
        let cancelled = false
        ;(async () => {
            const [{ data: sts }, { data: veh }, { data: drv }, { data: prof }] = await Promise.all([
                supabase.from('stores').select('id, name, "storeSlug", logo_url, business_hours').eq('owner_id', userId),
                supabase.from('driver_vehicles').select('vehicle_kind, car_model, car_plate, car_photo_url').eq('driver_id', userId),
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
                    kind: v.vehicle_kind, model: v.car_model || null, plate: v.car_plate || null,
                    photo: v.car_photo_url ? supabase.storage.from('driver-car-photos').getPublicUrl(v.car_photo_url).data.publicUrl : null,
                })),
                driverActive: !!(drv as any)?.driver_mode_active,
                providerOn: !!(prof as any)?.service_mode_active,
            })
        })().catch(() => { /* o menu só mostra o perfil */ })
        return () => { cancelled = true }
    }, [userId])

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
    const activeVehicle = activeMode.startsWith('motorista:') ? drawerData.vehicles.find((v) => `motorista:${v.kind}` === activeMode) : undefined
    const headerView: { line1: string; line2: string; image: string | null | undefined; noRing: boolean; label: string; modeIcon?: ReactNode } =
        activeStore ? { line1: 'Sua loja', line2: activeStore.name, image: activeStore.logo, noRing: true, label: 'Menu da loja', modeIcon: <StoreIcon size={22} /> }
            : activeVehicle ? {
                line1: profileSlug ? `@${profileSlug}` : 'Motorista',
                line2: [activeVehicle.model, activeVehicle.plate].filter(Boolean).join(' · ') || (VEHICLE_LABEL[activeVehicle.kind] || 'Veículo'),
                image: activeVehicle.photo, noRing: true, label: 'Menu do motorista', modeIcon: <Car size={22} />,
            }
                : userId && drawerData.providerOn ? { line1: profileSlug ? `@${profileSlug}` : 'Meu perfil', line2: 'Modo prestador', image: avatarUrl, noRing: false, label: 'Meu perfil', modeIcon: <User size={22} /> }
                    : { line1: userId ? 'Bem-vindo de volta' : 'Bem-vindo ao iUser', line2: profileSlug ? `@${profileSlug}` : 'Visitante', image: avatarUrl, noRing: false, label: 'Meu perfil', modeIcon: <User size={22} /> }

    // Escolher o modo prestador (Meu perfil com o prestador ligado) leva pra página dele
    const closeAndMaybeGo = (mode: string, delay: number) => {
        const toPrestador = mode === 'perfil' && drawerData.providerOn && pathname !== '/modoprestador'
        window.setTimeout(() => {
            setDrawerOpen(false)
            if (toPrestador) router.push('/modoprestador')
        }, delay)
    }

    return (
        <>
        {/* Fundo do menu: degradê do iUser, atrás de tudo (só aparece quando a página desliza) */}
        <div
            aria-hidden={!drawerOpen}
            className="fixed inset-0"
            style={{ background: 'linear-gradient(160deg, #f97316 0%, #dc2626 100%)', zIndex: 0 }}
        />
        <div
            className="fixed left-0 top-0 h-dvh"
            style={{
                width: DRAWER_W, zIndex: 1,
                opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
                transform: drawerOpen ? 'translateX(0)' : 'translateX(-24px)',
                transition: 'opacity 350ms ease, transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
        >
            {userId && (
                <MenuDrawerContent
                    slug={profileSlug}
                    avatarUrl={avatarUrl}
                    data={drawerData}
                    active={activeMode}
                    onSelect={(mode) => {
                        // Meu perfil, loja e motorista se escolhem do mesmo jeito; só o prestador (Meu perfil com
                        // o modo ligado) também leva à página /modoprestador
                        if (mode === activeMode) { closeAndMaybeGo(mode, 0); return }
                        setActiveMode(mode)
                        setModeTick((n) => n + 1)
                        try { localStorage.setItem(`iuser_mode_${userId}`, mode) } catch { /* sem armazenamento */ }
                        // O menu espera a troca do ícone terminar antes de fechar
                        closeAndMaybeGo(mode, 850)
                    }}
                    onClose={() => setDrawerOpen(false)}
                />
            )}
        </div>

        {/* A página: desliza pra direita e encolhe um pouco, com cantos arredondados e sombra */}
        <div
            className="relative min-h-dvh pb-24"
            style={{
                background: colors.background, zIndex: 2,
                transformOrigin: 'left top',
                // desce um pouco (7% da altura) além de deslizar e encolher: a janela fica mais pra baixo, com folga em cima
                transform: drawerOpen ? `translateX(${DRAWER_W}) translateY(7dvh) scale(0.9)` : 'none',
                borderRadius: drawerOpen ? 32 : 0,
                boxShadow: drawerOpen ? '-12px 0 40px rgba(0,0,0,0.35)' : 'none',
                height: drawerOpen ? '100dvh' : undefined,
                overflow: drawerOpen ? 'hidden' : undefined,
                transition: 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 450ms ease, box-shadow 450ms ease',
            }}
        >
            {/* Toque na página (com o menu aberto) fecha o menu */}
            {drawerOpen && <div className="absolute inset-0 z-[60] cursor-pointer" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" />}
            <div className="max-w-5xl mx-auto px-4 pt-4">
                <header className="flex items-center gap-3">
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
                    <div className="min-w-0 flex-1">
                        <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{headerView.line1}</p>
                        <p className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{headerView.line2}</p>
                    </div>
                    {/* Atalhos que valem em qualquer tela: conversas (com não lidas) e carrinho (com itens) */}
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
                </header>

                {children}
            </div>
        </div>
        </>
    )
}
