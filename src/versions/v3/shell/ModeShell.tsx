// src/versions/v3/shell/ModeShell.tsx
//
// Casca das páginas "de modo" (/modeloinicial, /modoprestador...): o topo com selo (logo/foto), cumprimento do modo,
// atalhos de conversas e carrinho, e o menu lateral (drawer) em que a pessoa escolhe o modo — Meu perfil/prestador,
// loja ou motorista. O menu empurra a página pra direita. O conteúdo de cada página entra como `children`.
'use client'

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
    Store as StoreIcon, Car, Wrench, MessageCircle, ShoppingCart, User, LogIn, LogOut, ChevronRight, X, Check, Search, RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useCartStore } from '@/store/useCartStore'
import { hexToRgb } from '@/lib/color'
import { getRecentClicks, type RecentClickItem } from '@/components/LastSearched'
import { switchVersion, versionLabel } from '@/versions/client'

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

function MenuDrawerContent({ slug, avatarUrl, data, active, recent, onSelect, onGo, onClose, onSwitchVersion }: {
    onSwitchVersion: () => Promise<void>
    slug: string | null; avatarUrl: string | null | undefined; data: DrawerData
    /** Modo selecionado: 'perfil' | 'prestador' | 'loja:<slug>' | 'motorista:<vehicle_slug>' */
    active: string
    /** As últimas coisas que a pessoa abriu pela busca (avatares do Explorar) */
    recent: RecentClickItem[]
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
        <div className="h-full w-full flex flex-col px-4 pb-8 overflow-y-auto" style={{ paddingTop: 'calc(66px + env(safe-area-inset-top) + 8px)' }}>
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

            <DrawerExplorar recent={recent} onGo={onGo} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
    )
}

// Explorar: a lupa + as 5 últimas coisas buscadas; leva ao /modeloinicial
function DrawerExplorar({ recent, onGo }: { recent: RecentClickItem[]; onGo: (path: string) => void }) {
    return (
        <>
            <button
                type="button"
                onClick={() => onGo('/modeloinicial')}
                className="mt-4 w-full rounded-full px-4 py-3 flex items-center gap-3 text-white font-black text-sm transition active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
                <Search size={20} className="flex-shrink-0" />
                <span className="flex-1 text-left">Explorar</span>
                {recent.length > 0 && (
                    <span className="flex flex-shrink-0">
                        {recent.map((r, i) => (
                            <span
                                key={`${r.type}-${r.id}`}
                                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-black flex-shrink-0"
                                style={{ marginLeft: i === 0 ? 0 : -10, background: 'rgba(255,255,255,0.35)', boxShadow: '0 0 0 2px #ea580c' }}
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
            className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-white transition active:scale-[0.98] disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.28)' }}
        >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
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
        <div className="h-full w-full flex flex-col px-4 pb-8 overflow-y-auto" style={{ paddingTop: 'calc(66px + env(safe-area-inset-top) + 8px)' }}>
            <div className="flex justify-end">
                <button onClick={onClose} aria-label="Fechar menu" className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/15 flex-shrink-0">
                    <X size={20} />
                </button>
            </div>

            <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}>
                <DrawerLabel>Modo visitante</DrawerLabel>
                <div className="flex flex-col gap-1.5">
                    <DrawerRow
                        mode="visitante"
                        active="visitante"
                        onSelect={() => onClose()}
                        icon={<User size={20} color="#fff" />}
                        title="Visitante"
                        desc="Navegando sem conta"
                        dot="#fde68a"
                    />
                </div>
            </section>

            <section className="mt-4 rounded-3xl p-2 pb-1.5" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}>
                <DrawerLabel>Minha conta</DrawerLabel>
                <div className="flex flex-col gap-1.5">
                    <DrawerCta icon={<LogIn size={20} color="#fff" />} title="Entrar" desc="Já tenho conta no iUser" onClick={() => onGo('/login')} />
                    <DrawerCta icon={<User size={20} color="#fff" />} title="Criar conta" desc="Grátis, leva um minuto" onClick={() => onGo('/cadastrar')} />
                </div>
            </section>

            <DrawerExplorar recent={recent} onGo={onGo} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
            <DrawerVersionSwitch onSwitch={onSwitchVersion} />
        </div>
    )
}

// Selo redondo do topo, do tamanho de um avatar. Visitante: só a logo do iUser. Logado: a cada 5 s a "página vira"
// (giro em 3D, a logo numa face e a foto do perfil na outra). Tocar leva ao perfil (foto) ou à home (logo).
// A borda do plano é desenhada POR FORA da foto (3 px de cada lado) — por isso a foto fica menor quando tem borda,
// pro conjunto ter exatamente o mesmo tamanho da logo.
const BADGE = 48
// Degradê do menu: o fundo atrás do cartão do app e a cor da navbar do topo
// Borda branca em volta da logo do selo: ela aparece bem em cima do degradê laranja da barra
const LOGO_RING = { border: '2px solid #fff', background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' } as const
// Distância do ícone da direita até a borda da tela (px-4 da barra + a sobra quando a página é mais larga que 5xl)
const EDGE_GAP = 'calc(16px + max(0px, (100vw - 1024px) / 2))'
// Altura da aba (ícone selecionado): do alto da barra até o pé dela, onde encontra o cartão do app
const TAB_H = 58
const FILLET = 12
// Ícone da barra do topo. A aba clara (selecionado) é UM indicador só, que desliza entre os três (`indicator`, dentro da barra)
function NavTab({ selected, label, onClick, badge = 0, badgeColor = '#ef4444', pulse = false, toEdge = false, btnRef, children }: {
    btnRef?: React.Ref<HTMLButtonElement>
    /** Aba do canto direito: estica até a borda da tela pra aba clara se fundir ao canto do cartão */
    toEdge?: boolean
    selected: boolean; label: string; onClick: () => void; badge?: number; badgeColor?: string; pulse?: boolean; children: ReactNode
}) {
    return (
        <button
            ref={btnRef}
            onClick={onClick}
            aria-label={label}
            aria-current={selected ? 'page' : undefined}
            className={`relative flex items-center justify-center flex-shrink-0 transition active:scale-95 ${pulse && !selected ? 'animate-pulse' : ''}`}
            style={{
                width: toEdge ? `calc(${TAB_W}px + ${EDGE_GAP})` : TAB_W,
                paddingRight: toEdge ? EDGE_GAP : undefined,
                marginRight: toEdge ? `calc(-1 * ${EDGE_GAP})` : undefined,
                height: '100%', paddingBottom: 8,
                color: selected ? '#ea580c' : '#fff',
                transition: 'color 300ms ease',
            }}
        >
            {children}
            {badge > 0 && (
                <span className="absolute top-1.5 right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: badgeColor, boxShadow: '0 0 0 2px #ea580c' }}>
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </button>
    )
}

// Largura de cada ícone da barra (px)
const TAB_W = 48
// Raio dos cantos côncavos da barra do topo (px)
const CORNER = 24
const MENU_GRADIENT = 'linear-gradient(160deg, #f97316 0%, #dc2626 100%)'
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
                    <button onClick={onHome} aria-label="iUser" className="flex items-center justify-center rounded-full" style={{ ...face, ...LOGO_RING }}>
                        <img src="/logo.png" alt="iUser" className="w-full h-full object-contain rounded-full" />
                    </button>
                )}
                {/* Verso: a logo (só existe pra quem está logado) */}
                {userId && (
                    <button onClick={onHome} aria-label="iUser" className="flex items-center justify-center rounded-full" style={{ ...face, ...LOGO_RING, transform: 'rotateY(180deg)' }}>
                        <img src="/logo.png" alt="iUser" className="w-full h-full object-contain rounded-full" />
                    </button>
                )}
            </div>
        </div>
    )
}


export default function ModeShell({ children, search }: {
    children: ReactNode
    /** Busca da página: vira uma lupa na navegação de baixo e abre o campo ao tocar */
    search?: { value: string; onChange: (v: string) => void; placeholder?: string }
}) {
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
    // O cartão do app só solta o recorte (altura + overflow) DEPOIS da animação de fechar: se soltasse na hora, o
    // conteúdo de baixo pularia pra dentro do cartão ainda encolhido e ele ficava "bugado"
    const [cardClipped, setCardClipped] = useState(false)
    useEffect(() => {
        if (drawerOpen) { setCardClipped(true); return }
        const t = setTimeout(() => setCardClipped(false), 480)
        return () => clearTimeout(t)
    }, [drawerOpen])
    const [searchOpen, setSearchOpen] = useState(false)
    // As 5 últimas coisas que a pessoa abriu pela busca (perfil, loja, produto) — vão no Explorar do menu
    const [recent, setRecent] = useState<RecentClickItem[]>([])
    useEffect(() => {
        const read = () => setRecent(getRecentClicks().filter((i) => i.type !== 'ride').slice(0, 5))
        read()
        window.addEventListener('focus', read)
        window.addEventListener('storage', read)
        return () => { window.removeEventListener('focus', read); window.removeEventListener('storage', read) }
    }, [])
    const searchInputRef = useRef<HTMLInputElement>(null)
    // Saiu de uma página com busca: o campo fecha (o layout é o mesmo entre as páginas)
    useEffect(() => { if (!search) setSearchOpen(false) }, [search])
    useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])
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
    // Altura da barra do topo: o cartão do app (tudo que está abaixo dela) começa nela, e a barra fica de fora do cartão.
    // Fica em CIMA (e não embaixo) pra o teclado não cobrir a barra quando a busca está aberta.
    const NAV_H = 'calc(66px + env(safe-area-inset-top))'
    // Qual ícone da barra é o da página atual (o "selecionado")
    // (a 3.0 serve /carrinho por /v3/carrinho e a home por /modeloinicial; o endereço visível é o canônico)
    const shellPath = (pathname || '').replace(/^\/v3(?=\/|$)/, '') || '/'
    const activeTab: 'cart' | 'chat' | 'search' | null =
        shellPath.startsWith('/carrinho') ? 'cart' : shellPath.startsWith('/conversas') ? 'chat' : (shellPath === '/modeloinicial' || shellPath === '/') ? 'search' : null
    // Na página do modo escolhido (painel do perfil, loja, veículo...), o botão do menu (selo + nome) também é uma aba
    const modeSelected = !!userId && dataLoaded && !!pathname && modePath(activeMode, drawerData) === pathname
    // Qual aba está selecionada: ao tocar num ícone ela já sai andando (antes da página nova abrir). O layout é o mesmo
    // entre as páginas, então o estado se mantém e a aba desliza de verdade de um lugar pro outro.
    type TabKey = 'mode' | 'cart' | 'chat' | 'search'
    const [pendingTab, setPendingTab] = useState<TabKey | null>(null)
    useEffect(() => { setPendingTab(null) }, [pathname])
    const target: TabKey | null = pendingTab ?? (modeSelected ? 'mode' : activeTab)
    const indicatorOn = target !== null && !drawerOpen && !searchOpen
    const leftTabOn = indicatorOn && target === 'mode'
    const pickTab = (tab: 'cart' | 'chat' | 'search', then: () => void) => {
        setPendingTab(tab)
        then()
    }
    // Posição da aba clara: medida nos próprios botões (o grupo do menu esquerdo, o carrinho, as conversas e a lupa)
    const modeRef = useRef<HTMLDivElement>(null)
    const cartRef = useRef<HTMLButtonElement>(null)
    const chatRef = useRef<HTMLButtonElement>(null)
    const lupaRef = useRef<HTMLButtonElement>(null)
    const [ind, setInd] = useState<{ left: number; width: number } | null>(null)
    const lastTarget = useRef<TabKey | null>(null)
    if (target) lastTarget.current = target
    const measureKey = lastTarget.current
    useLayoutEffect(() => {
        const measure = () => {
            const key = lastTarget.current
            if (!key) return
            const el = key === 'mode' ? modeRef.current : key === 'cart' ? cartRef.current : key === 'chat' ? chatRef.current : lupaRef.current
            if (!el) return
            const r = el.getBoundingClientRect()
            if (r.width === 0) return
            const W = window.innerWidth
            // o menu esquerdo e a lupa esticam até a borda da tela; o carrinho e as conversas ficam do tamanho do ícone
            const left = key === 'mode' ? 0 : r.left
            const width = key === 'mode' ? r.right : key === 'search' ? W - r.left : r.width
            setInd((p) => (p && Math.abs(p.left - left) < 0.5 && Math.abs(p.width - width) < 0.5 ? p : { left, width }))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    })

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
    // Seletor de versão (o único da 3.0): mesmo mecanismo central da 2.0
    // Só a home, o carrinho e as conversas existem nas duas; qualquer outra página do shell é só da 3.0 → home da 2.0
    const onSwitchVersion = () => switchVersion('v2', {
        pathname: pathname || '/',
        loggedIn: !!userId,
        destination: ['/', '/carrinho', '/conversas'].includes(shellPath) ? shellPath : '/',
    })

    return (
        <>
        {/* Fundo do menu: degradê do iUser, atrás de tudo (só aparece quando a página desliza) */}
        <div
            aria-hidden={!drawerOpen}
            className="fixed inset-0"
            style={{ background: MENU_GRADIENT, zIndex: 0 }}
        />
        {/* O menu fica no lado ESQUERDO e a página desliza pra direita */}
        <div
            className="fixed left-0 top-0 h-dvh"
            style={{
                width: DRAWER_W, zIndex: 1,
                opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
                transform: drawerOpen ? 'translateX(0)' : 'translateX(-24px)',
                transition: 'opacity 350ms ease, transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
        >
            {!userId && (
                <VisitorDrawerContent recent={recent} onGo={goAndClose} onClose={() => setDrawerOpen(false)} onSwitchVersion={onSwitchVersion} />
            )}
            {userId && (
                <MenuDrawerContent
                    slug={profileSlug}
                    avatarUrl={avatarUrl}
                    data={drawerData}
                    active={activeMode}
                    recent={recent}
                    onSelect={selectMode}
                    onGo={goAndClose}
                    onClose={() => setDrawerOpen(false)}
                    onSwitchVersion={onSwitchVersion}
                />
            )}
        </div>

        {/* A página: desliza pra direita e encolhe um pouco, com cantos arredondados e sombra */}
        <div
            className="relative pb-10"
            style={{
                background: colors.background, zIndex: 2,
                marginTop: NAV_H,
                minHeight: `calc(100dvh - ${NAV_H})`,
                transformOrigin: 'left center',
                // vira um cartão abaixo da barra do topo: desliza pra direita e encolhe um pouco, mostrando o menu atrás
                transform: drawerOpen ? `translateX(${DRAWER_W}) scale(0.9)` : 'none',
                // aberto: cartão com os 4 cantos; fechado: só os de cima, que se encaixam nos cantos côncavos da barra
                borderRadius: drawerOpen ? '32px' : `${target === 'mode' ? 0 : CORNER}px ${target === 'search' ? 0 : CORNER}px 0px 0px`,
                boxShadow: drawerOpen ? '-12px 0 40px rgba(0,0,0,0.35)' : 'none',
                height: cardClipped ? `calc(100dvh - ${NAV_H})` : undefined,
                overflow: cardClipped ? 'hidden' : undefined,
                transition: 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 450ms ease',
            }}
        >
            {/* Toque na página (com o menu aberto) fecha o menu */}
            {drawerOpen && <div className="absolute inset-0 z-[60] cursor-pointer" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu" />}

            <div className="max-w-5xl mx-auto px-4 pt-4">
                {children}
            </div>

        </div>

        {/* Navegação no TOPO, FORA do cartão do app (fica fixa na tela; o cartão desliza por cima do menu e termina nela): o botão do menu (selo + nome), o carrinho, as mensagens e a lupa. Na página com busca,
            a lupa se EXPANDE no lugar e vira o campo; nas outras, leva ao /modeloinicial. */}
        <nav
            className="fixed top-0 left-0 right-0 z-40"
            style={{
                // Sempre da cor do menu (o mesmo degradê do fundo, preso à tela): parece que a barra vem de fora do app
                backgroundImage: MENU_GRADIENT,
                backgroundSize: '100vw 100dvh',
                backgroundPosition: 'left top',
                backgroundRepeat: 'no-repeat',
                backgroundColor: '#dc2626',
                paddingTop: 'env(safe-area-inset-top)',
                boxSizing: 'border-box',
                height: NAV_H,
            }}
        >
            <div className="relative z-[1] max-w-5xl mx-auto px-4 h-full flex items-center">
                {/* Grupo da esquerda: some (encolhe) quando a lupa vira o campo de busca */}
                <div
                    ref={modeRef}
                    className="relative self-stretch flex items-center gap-2.5 min-w-0"
                    style={{
                        flex: searchOpen ? '0 0 0px' : '1 1 0%',
                        maxWidth: searchOpen ? 0 : '100%',
                        opacity: searchOpen ? 0 : 1,
                        overflow: searchOpen ? 'hidden' : 'visible',
                        marginRight: searchOpen ? 0 : 10,
                        transition: 'flex 320ms cubic-bezier(0.22, 1, 0.36, 1), max-width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease, margin 320ms ease',
                    }}
                >
                    <HeaderBadge
                        userId={userId}
                        avatarUrl={headerView.image}
                        colors={colors}
                        noRing={headerView.noRing}
                        label={headerView.label}
                        modeIcon={headerView.modeIcon}
                        popToken={modeTick}
                        onProfile={() => { window.scrollTo({ top: 0 }); setDrawerOpen(true) }}
                        // A logo (outra face do selo) também abre o menu
                        onHome={() => { window.scrollTo({ top: 0 }); setDrawerOpen(true) }}
                    />

                    {/* Nome, frase e triângulo: um botão só — abre/fecha o menu (igual ao selo) */}
                        <button
                            type="button"
                            onClick={() => {
                                // Numa das abas (carrinho, conversas, busca): tocar aqui volta pra página do modo escolhido
                                // no menu — a aba clara desliza de volta pra cá. Na página do modo, abre/fecha o menu.
                                if (userId && dataLoaded && activeTab !== null && !drawerOpen) {
                                    const back = modePath(activeMode, drawerData)
                                    if (back && back !== '/') { setPendingTab('mode'); go(back); return }
                                }
                                window.scrollTo({ top: 0 }); setDrawerOpen((v) => !v)
                            }}
                            aria-label={drawerOpen ? 'Fechar menu' : activeTab !== null ? 'Voltar ao modo escolhido' : 'Abrir menu'}
                            aria-expanded={drawerOpen}
                            className="relative min-w-0 flex-1 text-left rounded-xl py-1 transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
                        >
                            <span className="block text-xs truncate" style={{ color: leftTabOn ? colors.textSecondary : 'rgba(255,255,255,0.85)', transition: 'color 120ms ease' }}>{headerView.line1}</span>
                            <span className="flex items-center gap-1.5 min-w-0">
                                <span className="text-base font-black truncate" style={{ color: leftTabOn ? colors.textPrimary : '#fff', transition: 'color 120ms ease' }}>{headerView.line2}</span>
                                <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: leftTabOn ? `${colors.border}66` : 'rgba(255,255,255,0.22)', transition: 'background 300ms ease' }}>
                                    <svg
                                        width="10" height="9" viewBox="0 0 10 9" aria-hidden
                                        style={{ transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)', transform: drawerOpen ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                                    >
                                        <polygon points="5,0 10,9 0,9" fill={leftTabOn ? colors.textPrimary : '#fff'} />
                                    </svg>
                                </span>
                            </span>
                        </button>
                                </div>

                {/* Carrinho, conversas e lupa, juntos. O da página atual fica "selecionado": vira uma aba com a cor do cartão
                    do app e se funde a ele (com curvas de encaixe nos pés). Com busca na página, a lupa expande no lugar e
                    vira o campo (o carrinho e as conversas encolhem); nas outras páginas, leva ao /modeloinicial. */}
                <div
                    className={`relative flex ${searchOpen ? 'items-center self-center rounded-full' : 'items-stretch self-end'}`}
                    style={{
                        flex: searchOpen ? '1 1 0%' : '0 0 auto',
                        height: searchOpen ? 48 : TAB_H,
                        padding: searchOpen ? 2 : 0,
                        background: searchOpen ? colors.surface : 'transparent',
                        border: searchOpen ? `1.5px solid ${colors.border}` : '0px solid transparent',
                        color: searchOpen ? colors.textPrimary : '#fff',
                        transition: 'flex 320ms cubic-bezier(0.22, 1, 0.36, 1), background 350ms ease, border-color 250ms ease',
                    }}
                >
                    <div
                        className="flex items-stretch"
                        style={{
                            maxWidth: searchOpen ? 0 : 160,
                            opacity: searchOpen ? 0 : 1,
                            overflow: searchOpen ? 'hidden' : 'visible',
                            transition: 'max-width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                        }}
                    >
                        <NavTab btnRef={cartRef} selected={indicatorOn && target === 'cart'} label="Carrinho" onClick={() => pickTab('cart', () => go('/carrinho'))} badge={topCart}>
                            <ShoppingCart size={20} />
                        </NavTab>
                        <NavTab btnRef={chatRef} selected={indicatorOn && target === 'chat'} label="Conversas" onClick={() => pickTab('chat', () => go(userId ? '/conversas' : '/login'))} badge={topUnread} badgeColor="#16a34a" pulse={topUnread > 0}>
                            <MessageCircle size={20} />
                        </NavTab>
                    </div>

                    {search && searchOpen ? (
                        <>
                            <Search size={18} className="ml-3 flex-shrink-0" style={{ color: colors.textSecondary }} />
                            <input
                                ref={searchInputRef}
                                type="search"
                                value={search.value}
                                onChange={(e) => search.onChange(e.target.value)}
                                placeholder={search.placeholder || 'Buscar...'}
                                className="flex-1 min-w-0 bg-transparent px-2.5 text-sm focus:outline-none"
                                style={{ color: colors.textPrimary }}
                            />
                            <button
                                onClick={() => { search.onChange(''); setSearchOpen(false) }}
                                aria-label="Fechar busca"
                                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ color: colors.textPrimary }}
                            >
                                <X size={18} />
                            </button>
                        </>
                    ) : (
                        <NavTab btnRef={lupaRef} toEdge selected={indicatorOn && target === 'search'} label="Buscar" onClick={() => pickTab('search', () => (search ? setSearchOpen(true) : go('/modeloinicial')))}>
                            <Search size={20} />
                        </NavTab>
                    )}
                </div>
            </div>
            {/* A aba clara: UMA peça só que desliza (left/width) entre o menu da esquerda e os três ícones, fundida ao
                cartão do app (desce 1px nele pra não deixar fresta) e com curvas côncavas nos pés */}
            {ind && (
                <span
                    aria-hidden
                    className="absolute pointer-events-none"
                    style={{
                        top: 'calc(8px + env(safe-area-inset-top))', bottom: -1,
                        left: ind.left, width: ind.width,
                        background: colors.background, borderRadius: '18px 18px 0 0',
                        // some rápido (e de vez, com `visibility`): o menu abrindo não deixa a aba clara boiando nem uma linha
                        opacity: indicatorOn ? 1 : 0,
                        visibility: indicatorOn ? 'visible' : 'hidden',
                        transition: indicatorOn
                            ? 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease'
                            : 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 90ms ease, visibility 0s linear 90ms',
                    }}
                >
                    {(['left', 'right'] as const).map((side) => {
                        const hidden = (side === 'left' && measureKey === 'mode') || (side === 'right' && measureKey === 'search')
                        return (
                            <span
                                key={side}
                                className="absolute"
                                style={{
                                    bottom: 0, [side === 'left' ? 'right' : 'left']: '100%', width: FILLET, height: FILLET + 1,
                                    background: colors.background,
                                    WebkitMaskImage: `radial-gradient(circle at ${side === 'left' ? '0% 0%' : '100% 0%'}, transparent ${FILLET - 0.5}px, #000 ${FILLET}px)`,
                                    maskImage: `radial-gradient(circle at ${side === 'left' ? '0% 0%' : '100% 0%'}, transparent ${FILLET - 0.5}px, #000 ${FILLET}px)`,
                                    opacity: hidden ? 0 : 1,
                                    transition: 'opacity 420ms ease',
                                }}
                            />
                        )
                    })}
                </span>
            )}
            {/* Cantos CÔNCAVOS: a borda de baixo da barra "entra" na página — o cartão do app tem os cantos de cima
                arredondados, preenchidos com o degradê da barra, e parece que a parte de baixo está subindo */}
            {(['left', 'right'] as const).map((side) => (
                <span
                    key={side}
                    aria-hidden
                    className="absolute pointer-events-none"
                    style={{
                        top: '100%', [side]: 0, width: CORNER, height: CORNER,
                        backgroundImage: MENU_GRADIENT,
                        backgroundSize: '100vw 100dvh',
                        backgroundRepeat: 'no-repeat',
                        backgroundColor: '#dc2626',
                        backgroundPosition: side === 'left' ? `0 calc(-1 * ${NAV_H})` : `calc(${CORNER}px - 100vw) calc(-1 * ${NAV_H})`,
                        WebkitMaskImage: `radial-gradient(circle at ${side === 'left' ? '100% 100%' : '0% 100%'}, transparent ${CORNER - 0.5}px, #000 ${CORNER}px)`,
                        maskImage: `radial-gradient(circle at ${side === 'left' ? '100% 100%' : '0% 100%'}, transparent ${CORNER - 0.5}px, #000 ${CORNER}px)`,
                        // com a lupa selecionada, a aba dela chega na borda da tela e ocupa esse canto
                        opacity: drawerOpen || (side === 'right' && target === 'search') || (side === 'left' && target === 'mode') ? 0 : 1,
                        transition: 'opacity 420ms ease',
                    }}
                />
            ))}
        </nav>
        </>
    )
}
