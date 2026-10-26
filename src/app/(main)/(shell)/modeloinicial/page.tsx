// app/(main)/modeloinicial/page.tsx
//
// MODELO INICIAL — proposta de página inicial pensada em quem usa: o que ela pode
// FAZER aqui e o que existe pra ela VER. Mesmos dados reais da home, outra organização:
//   topo: selo (logo/foto), cumprimento, atalhos de conversas e carrinho (com selos) e sair; busca;
//   1) "Precisando..." / "Quero ganhar com o iUser", as vitrines (Social = "OUTDOOR iUSER", Comunidades, pedidos de serviço...);
//   2) categorias;  3) vitrines, uma por tipo, cada tipo com a SUA cor e o seu rótulo;  4) convite final.
// Todos os cartões das vitrines têm o mesmo tamanho (nem miúdos, nem gigantes) pra a página ter ritmo.
'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Search, ShoppingBag, Store as StoreIcon, Car, Wrench, Briefcase, Users, MessageCircle,
    Home as HomeIcon, ChevronRight, Star, MapPin, Eye, User, LogIn, LogOut, Radar, UserPlus, X, Plus, Package, ShoppingCart, Scissors, Check,
    UtensilsCrossed, Shirt, Smartphone, Hand, Sparkles, Bike, Motorbike, CircleDollarSign, type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria } from '@/lib/categorias'
import StoreImageCard, { type StoreCardItem } from '@/components/StoreImageCard'
import { fetchStoreCards } from '@/lib/storeCards'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { getAvatarUrl } from '@/lib/avatar'
import { loadProductCards, type ProductCard } from '../../inicio/sections/ProductShowcase'
import { fetchOpenBoardItems, askedAgo, shortAddress, notifyServiceRequestsChanged, SERVICE_REQUESTS_CHANGED, type BoardItem } from '@/lib/serviceBoard'
import { notifyServiceApplication } from '@/lib/notifyRideStatus'
import { getRequestTitle, getServiceIcon } from '@/lib/serviceTypes'
import { loadMyRequests, type MyRequest } from '@/modules/service-requests'
import { useCartStore, cartItemLineTotal } from '@/store/useCartStore'
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import ListingRowCard from '@/components/ListingRowCard'
import NearbyAroundCard from '@/components/v3/NearbyAroundCard'
import RentalsPreviewCard from '@/components/v3/RentalsPreviewCard'
import { loadServiceCards } from '@/lib/serviceCards'
import SearchResultsSection from '../../inicio/SearchResultsSection'
import { rankStyle } from '../../social/SocialProfileCard'
import ServiceRequestShareButton from '@/components/ServiceRequestShareButton'
import ShareLinkDialog, { copyText } from '@/components/ShareLinkDialog'
import { toast } from 'sonner'
import { useShellSearch } from '@/versions/v3/shell/ShellFrame'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Chamada final: quem tem loja, vende produto ou oferece serviço. Segue o desenho do resto da página — cabeçalho de seção
// (ícone em caixa tingida + título + subtítulo, como nas vitrines) e as opções no mesmo formato dos cards de "Quero
// ganhar", cada uma na cor do SEU tipo (loja, serviço, produto). Só elementos nativos; ícones Lucide.
function SellCta({ colors, onStore, onService, onProduct }: { colors: any; onStore: () => void; onService: () => void; onProduct: () => void }) {
    const options: { key: string; title: string; desc: string; icon: LucideIcon; color: string; onClick: () => void }[] = [
        { key: 'loja', title: 'Criar minha loja', desc: 'Venda seus produtos e receba pedidos.', icon: StoreIcon, color: TYPE.loja.color, onClick: onStore },
        { key: 'servico', title: 'Oferecer serviço', desc: 'Divulgue seu trabalho e encontre novos clientes.', icon: Wrench, color: TYPE.servico.color, onClick: onService },
        { key: 'produto', title: 'Vender produto', desc: 'Anuncie seus produtos e alcance mais pessoas.', icon: Package, color: TYPE.produto.color, onClick: onProduct },
    ]
    return (
        <section aria-labelledby="sell-cta-title" className="mt-10">
            <div className="mb-3">
                <h2 id="sell-cta-title" className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>
                    Tem uma loja, vende produtos ou oferece serviços?
                </h2>
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                    Cadastre-se grátis no iUser e conecte-se com pessoas que estão perto de você.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {options.map((o) => {
                    const Icon = o.icon
                    return (
                        <button
                            key={o.key}
                            type="button"
                            onClick={o.onClick}
                            className="group text-left rounded-2xl p-3.5 border flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                            style={{ background: colors.surface, borderColor: `${o.color}55`, boxShadow: colors.shadow, ['--tw-ring-color' as any]: o.color }}
                        >
                            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${o.color}1f`, color: o.color }}>
                                <Icon size={22} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{o.title}</span>
                                <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{o.desc}</span>
                            </span>
                            <ChevronRight size={16} aria-hidden className="flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1" style={{ color: o.color }} />
                        </button>
                    )
                })}
            </div>
        </section>
    )
}

// "Vender": produto ou serviço. Produto sempre vive numa loja (sem loja, a gente leva a pessoa a criar uma). Serviço pode ser
// publicado pelo perfil da pessoa ou por uma loja — então ela escolhe (ou cria uma loja só para isso).
type SellView = 'root' | 'service' | 'pickStore'
function SellDialog({ open, onClose, userId, colors, go, mode = 'all' }: { open: boolean; onClose: () => void; userId: string | null; colors: any; go: (p: string) => void; mode?: 'all' | 'product' }) {
    const [myStores, setMyStores] = useState<{ id: string; name: string; storeSlug: string }[] | null>(null)
    const [view, setView] = useState<SellView>('root')
    // O que a escolha de loja vai criar: um produto ou um serviço
    const [pickFor, setPickFor] = useState<'product' | 'service'>('product')

    useEffect(() => {
        if (!open) { setView('root'); setPickFor('product'); return }
        if (!userId) { setMyStores([]); return }
        let cancelled = false
        supabase.from('stores').select('id, name, "storeSlug"').eq('owner_id', userId).then(({ data }) => {
            if (!cancelled) setMyStores((data as any[]) || [])
        })
        return () => { cancelled = true }
    }, [open, userId])

    // Vindo do "Vender produto": quem já tem loja cai direto na escolha (uma loja sua ou criar outra)
    useEffect(() => {
        if (open && mode === 'product' && myStores && myStores.length > 0) { setPickFor('product'); setView('pickStore') }
    }, [open, mode, myStores])

    if (!open) return null
    const option = (key: string, icon: ReactNode, color: string, title: string, desc: string, onClick: () => void) => (
        <button key={key} onClick={onClick} className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left border transition hover:-translate-y-0.5 active:scale-[0.98]" style={{ background: colors.surface, borderColor: colors.border }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, color }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{title}</span>
                <span className="block text-xs leading-snug" style={{ color: colors.textSecondary }}>{desc}</span>
            </span>
            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
        </button>
    )

    const createPath = (slug: string, kind: 'product' | 'service') => `/${slug}/criar-produto${kind === 'service' ? '?type=service' : ''}`
    const createStore = () => go(userId ? '/criar-loja' : '/criar-loja-com-cadastro')

    // Quem já tem loja escolhe: publicar numa loja sua ou criar outra (sem loja, vai direto criar)
    const product = () => {
        if (!userId) return go('/criar-loja-com-cadastro')
        if (!myStores || myStores.length === 0) return go('/criar-loja')
        setPickFor('product')
        setView('pickStore')
    }

    const serviceByStore = () => {
        if (!myStores || myStores.length === 0) return createStore()
        setPickFor('service')
        setView('pickStore')
    }

    const hasStores = !!myStores && myStores.length > 0
    const title = view === 'pickStore' ? 'Em qual loja?' : view === 'service' ? 'Onde publicar o serviço?' : 'O que você quer vender?'
    const subtitle = view === 'pickStore'
        ? (pickFor === 'service' ? 'Use uma loja que você já tem ou crie outra para o serviço.' : 'Use uma loja que você já tem ou crie outra para o produto.')
        : view === 'service' ? 'Pelo seu perfil ou por uma loja.' : 'Escolha o que quer mostrar no iUser.'
    const back = view === 'root' ? null : () => setView(view === 'pickStore' && pickFor === 'service' ? 'service' : 'root')

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
            <div className="w-full max-w-md rounded-3xl p-5" style={{ background: colors.background }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>{title}</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{subtitle}</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-1" style={{ color: colors.textSecondary }}><X size={20} /></button>
                </div>
                <div className="flex flex-col gap-2.5">
                    {view === 'pickStore' && (
                        <>
                            {(myStores || []).map((st) => option(st.id, <StoreIcon size={20} />, TYPE.loja.color, st.name, `Publicar ${pickFor === 'service' ? 'o serviço' : 'o produto'} nesta loja · /${st.storeSlug}`, () => go(createPath(st.storeSlug, pickFor))))}
                            {option('nova-loja', <Plus size={20} />, TYPE.produto.color, 'Criar outra loja', `Uma loja nova para ${pickFor === 'service' ? 'este serviço' : 'este produto'}`, createStore)}
                        </>
                    )}
                    {view === 'service' && (
                        <>
                            {option('perfil', <User size={20} />, TYPE.servico.color, 'Pelo meu perfil', 'Aparece no seu perfil, sem precisar de loja', () => go(userId ? '/meus-servicos' : '/login'))}
                            {option('loja', <StoreIcon size={20} />, TYPE.loja.color, hasStores ? 'Por uma loja' : 'Criar uma loja', hasStores ? 'Em uma loja sua ou em uma loja nova' : 'Crie uma loja para publicar o serviço', serviceByStore)}
                        </>
                    )}
                    {view === 'root' && (
                        <>
                            {option('produto', <Package size={20} />, TYPE.produto.color, 'Produto', hasStores ? 'Em uma loja sua ou em uma loja nova' : myStores === null ? 'Publique na sua loja' : 'Precisa de uma loja — a gente leva você pra criar', product)}
                            {option('servico', <Wrench size={20} />, TYPE.servico.color, 'Serviço', 'Divulgue o que você faz e seja encontrado', () => setView('service'))}
                        </>
                    )}
                </div>
                {back && (
                    <button onClick={back} className="mt-3 w-full py-2 text-xs font-black rounded-full" style={{ color: colors.textSecondary }}>Voltar</button>
                )}
            </div>
        </div>
    )
}

// Cada tipo de coisa tem uma cor e um rótulo só seus — é o que deixa a página "legível" de relance.
const TYPE: Record<'loja' | 'produto' | 'servico' | 'pedido' | 'pessoa' | 'comunidade', { label: string; color: string; icon: LucideIcon }> = {
    loja: { label: 'Loja', color: '#2563eb', icon: StoreIcon },
    produto: { label: 'Produto', color: '#059669', icon: ShoppingBag },
    servico: { label: 'Serviço', color: '#7c3aed', icon: Wrench },
    pedido: { label: 'Pedido', color: '#ea580c', icon: Briefcase },
    pessoa: { label: 'Pessoa', color: '#db2777', icon: Users },
    comunidade: { label: 'Comunidade', color: '#0d9488', icon: MessageCircle },
}
type TypeKey = keyof typeof TYPE

const money = (v: number | null | undefined) => (v != null && v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null)

// ---------- dados das vitrines ----------
type StoreItem = StoreCardItem
interface ServiceItem {
    id: string; title: string; href: string; image: string | null; provider: string; price: number | null
    /** A loja que oferece está aberta agora? (null = serviço de perfil, sem loja) */
    storeOpen: boolean | null
    /** Serviço de perfil: quem presta está online agora? (null = de loja, ou a pessoa não mostra a presença) */
    ownerOnline?: boolean | null
    ownerId?: string | null
}
interface PersonItem { id: string; slug: string; avatar: string | null; points: number; rank: number }
interface CommunityTalk { id: string; author: string; avatar: string | null; text: string; at: number }
interface CommunityItem { id: string; slug: string; name: string; city: string; members: number; image: string | null; activity: CommunityActivity | null; last: { author: string; text: string } | null; /** As últimas mensagens da sala (a mais nova por último) */ talk: CommunityTalk[]; /** Gente diferente que falou nas últimas mensagens */ talkers: number }

const toPublicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ---------- peças visuais ----------
function SectionHeader({ type, title, subtitle, onSeeAll, colors }: { type: TypeKey; title: string; subtitle?: string; onSeeAll?: () => void; colors: any }) {
    const t = TYPE[type]
    return (
        <div className="flex items-center gap-3 mb-3">
            <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                {subtitle && <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{subtitle}</p>}
            </div>
            {onSeeAll && (
                <button onClick={onSeeAll} className="flex items-center gap-0.5 text-xs font-black flex-shrink-0 px-3 py-1.5 rounded-full transition hover:scale-105" style={{ color: t.color, background: `${t.color}14` }}>
                    Ver tudo <ChevronRight size={14} />
                </button>
            )}
        </div>
    )
}

// Faixa que rola de lado; os cartões encaixam (snap) pra ficar fácil de passar com o dedo
function Strip({ children }: { children: ReactNode }) {
    return (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-pl-4 scroll-pr-4 pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {children}
        </div>
    )
}

function Tile({ type, onClick, image, fallback, children, colors, round = false, badge, textHero }: {
    type: TypeKey; onClick: () => void; image?: string | null; fallback: ReactNode; children: ReactNode; colors: any; round?: boolean
    /** Sem imagem, o título ocupa o lugar da foto (cartão só de texto) */
    textHero?: ReactNode
    /** Troca o rótulo do tipo por outro (ex.: Aberto/Fechado nas lojas) */
    badge?: { label: string; color: string }
}) {
    const t = TYPE[type]
    return (
        // div com role=button (e não <button>) para o cartão poder ter um botão de verdade dentro (ex.: "Inscrever-se" nos pedidos)
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
            className="snap-start flex-shrink-0 w-[168px] sm:w-[188px] text-left rounded-3xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] cursor-pointer"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* Foto (mesma altura em todos), com o rótulo do tipo por cima */}
            <span className="relative block w-full h-[116px] sm:h-[128px] overflow-hidden flex-shrink-0" style={{ background: `${t.color}22` }}>
                {image ? (
                    <img src={image} alt="" className={`w-full h-full ${round ? 'object-contain p-3' : 'object-cover'}`} loading="lazy" />
                ) : textHero ? (
                    <span className="w-full h-full flex items-center px-3 pt-9 pb-2">{textHero}</span>
                ) : (
                    <span className="w-full h-full flex items-center justify-center" style={{ color: t.color }}>{fallback}</span>
                )}
                <span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: badge?.color || t.color }}>
                    {badge?.label || t.label}
                </span>
            </span>
            <span className="block p-3 flex-1">{children}</span>
        </div>
    )
}

// Cartão alto padrão das vitrines de serviço ("Serviços que você pode gostar" e "Quem está procurando serviço"): a parte de
// cima (imagem) ocupa 2/3 do cartão; sem imagem, o próprio título vira a imagem (o texto cabe no espaço). Embaixo ficam os
// detalhes e o botão, compactos e colados no rodapé, na mesma posição em todos os cartões (o que sobra de altura vai para a imagem).
function TallTile({ type, colors, image, title, badge, meta, action, onClick }: {
    type: TypeKey; colors: any; image?: string | null; title: string; badge?: { label: string; color: string }
    /** Linha de detalhes do rodapé (preço, quem oferece, local...) */
    meta?: ReactNode
    /** Botão do rodapé */
    action: ReactNode
    onClick: () => void
}) {
    const t = TYPE[type]
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
            className="snap-start flex-shrink-0 w-[168px] sm:w-[188px] h-[320px] sm:h-[336px] text-left rounded-3xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] cursor-pointer"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            <span className="relative block w-full flex-1 min-h-0 overflow-hidden" style={{ background: `linear-gradient(150deg, ${t.color}2e, ${t.color}0f)` }}>
                {image ? (
                    <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <span className="w-full h-full flex items-center px-3.5 pt-10 pb-3">
                        <span className={`block font-black leading-tight ${title.length > 70 ? 'text-[15px] line-clamp-8' : 'text-[19px] line-clamp-6'}`} style={{ color: colors.textPrimary }}>{title}</span>
                    </span>
                )}
                <span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: badge?.color || t.color }}>
                    {badge?.label || t.label}
                </span>
            </span>
            <span className="flex-shrink-0 px-2.5 pt-2 pb-2.5 flex flex-col gap-1">
                {image && <span className="block text-[13px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{title}</span>}
                {meta}
                <span className="block pt-0.5">{action}</span>
            </span>
        </div>
    )
}

// Cartão de comunidade que mostra o que está acontecendo dentro dela: quem falou por último e o que disse (as 3 mensagens mais
// novas), há quanto tempo a sala está movimentada e quantos membros tem. Tocar abre a conversa.
function CommunityTalkCard({ c, colors, onClick }: { c: CommunityItem; colors: any; onClick: () => void }) {
    const t = TYPE.comunidade
    const lastAt = c.talk.length ? c.talk[c.talk.length - 1].at : 0
    const live = lastAt > 0 && Date.now() - lastAt < 15 * 60 * 1000
    const ago = (at: number) => {
        const m = Math.max(1, Math.round((Date.now() - at) / 60000))
        if (m < 60) return `${m} min`
        const h = Math.round(m / 60)
        return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`
    }
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
            className="snap-start self-start flex-shrink-0 w-[264px] sm:w-[292px] rounded-3xl border p-3 flex flex-col gap-2 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${t.color}22`, color: t.color }}>
                    {c.image ? <img src={c.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <MessageCircle size={20} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{c.name}</span>
                    <span className="flex items-center gap-1 text-[11px] mt-0.5 whitespace-nowrap min-w-0" style={{ color: colors.textSecondary }}>
                        <Users size={11} className="flex-shrink-0" /> <span className="truncate">{c.members} {c.members === 1 ? 'membro' : 'membros'}{c.talkers > 1 ? ` · ${c.talkers} falando` : ''}</span>
                    </span>
                </span>
                {c.talk.length > 0 && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={live ? { background: '#16a34a1f', color: '#16a34a' } : { background: `${colors.border}40`, color: colors.textSecondary }}>
                        {live && <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />}
                        {live ? 'ao vivo' : `há ${ago(lastAt)}`}
                    </span>
                )}
            </span>

            <span className="flex flex-col gap-1">
                {c.talk.length === 0 ? (
                    <span className="rounded-2xl py-3 flex items-center justify-center text-center px-3 text-xs" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>
                        Ninguém falou ainda. Comece a conversa!
                    </span>
                ) : c.talk.map((m, i) => (
                    <span key={m.id} className="flex items-start gap-2" style={{ opacity: 0.55 + (i + 1) * (0.45 / c.talk.length) }}>
                        <span className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white" style={{ background: t.color }}>
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" loading="lazy" /> : m.author.replace('@', '').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 rounded-2xl rounded-tl-md px-2.5 py-1" style={{ background: `${colors.border}30` }}>
                            <span className="block text-[10px] font-black truncate" style={{ color: t.color }}>{m.author}</span>
                            <span className="block text-[12px] leading-snug truncate" style={{ color: colors.textPrimary }}>{m.text}</span>
                        </span>
                    </span>
                ))}
            </span>
        </div>
    )
}

function Skeleton({ colors }: { colors: any }) {
    return (
        <Strip>
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex-shrink-0 w-[168px] sm:w-[188px] h-[210px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
            ))}
        </Strip>
    )
}

export default function ModeloInicialPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, avatarUrl } = useProfile()
    const [query, setQuery] = useState('')
    // A lupa da barra do topo (que vive no layout) abre o campo de busca desta página
    const searchInputRef = useRef<HTMLInputElement>(null)
    useShellSearch({ value: query, onChange: setQuery, placeholder: 'O que você procura? Lojas, serviços, pessoas...', inline: true, focus: () => searchInputRef.current?.focus() })
    const [stores, setStores] = useState<StoreItem[] | null>(null)
    // Quantas lojas ativas cada categoria tem (null = carregando)
    const [catCounts, setCatCounts] = useState<Record<string, number> | null>(null)
    const [products, setProducts] = useState<(ProductCard & { storeOpen: boolean | null })[] | null>(null)
    const [services, setServices] = useState<ServiceItem[] | null>(null)
    const [requests, setRequests] = useState<BoardItem[] | null>(null)
    const [people, setPeople] = useState<PersonItem[] | null>(null)
    const [communities, setCommunities] = useState<CommunityItem[] | null>(null)
    // Pedidos de serviço em que eu já me inscrevi (para o botão "Inscrever-se" das vitrines)
    const [applied, setApplied] = useState<Set<string>>(new Set())
    // Meus pedidos de contratação de serviço (o cartão "Contratar serviço" e a lista logo abaixo mostram como estão)
    const [myRequests, setMyRequests] = useState<MyRequest[]>([])
    useEffect(() => {
        if (!userId) { setMyRequests([]); return }
        const load = () => loadMyRequests(supabase, userId).then(setMyRequests).catch(() => setMyRequests([]))
        load()
        window.addEventListener(SERVICE_REQUESTS_CHANGED, load)
        return () => window.removeEventListener(SERVICE_REQUESTS_CHANGED, load)
    }, [userId])
    // Corrida em andamento (pedida por mim e ainda aberta): o cartão "Pedir motorista" mostra como está e leva de volta a ela
    type ActiveRide = { id: string; status: string; destination: string | null; enRoute: boolean; arrived: boolean; started: boolean; candidates: number }
    const [activeRide, setActiveRide] = useState<ActiveRide | null>(null)
    useEffect(() => {
        if (!userId) { setActiveRide(null); return }
        let cancelled = false
        const load = async () => {
            if (document.hidden) return
            const { data } = await supabase
                .from('ride_requests')
                .select('id, status, destination_address, driver_en_route, driver_arrived_at, ride_started_at')
                .eq('requester_id', userId)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (cancelled) return
            if (!data) { setActiveRide(null); return }
            let candidates = 0
            if (data.status === 'pending') {
                const { count } = await supabase.from('ride_applications').select('id', { count: 'exact', head: true }).eq('ride_request_id', data.id).eq('status', 'pending')
                candidates = count || 0
            }
            if (cancelled) return
            setActiveRide({ id: data.id, status: data.status, destination: data.destination_address, enRoute: !!data.driver_en_route, arrived: !!data.driver_arrived_at, started: !!data.ride_started_at, candidates })
        }
        load()
        const t = setInterval(load, 30_000)
        return () => { cancelled = true; clearInterval(t) }
    }, [userId])
    // Carrinho (só depois de hidratar, para o servidor e o navegador mostrarem o mesmo)
    const cartItems = useCartStore((st) => st.itemsByStore)
    const [cartReady, setCartReady] = useState(false)
    useEffect(() => setCartReady(true), [])
    const cartCount = cartReady ? Object.values(cartItems).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0
    const cartTotal = cartReady ? Object.values(cartItems).reduce((a, items) => a + items.reduce((n, i) => n + cartItemLineTotal(i), 0), 0) : 0
    const cartImages = cartReady ? Object.values(cartItems).flat().map((i) => i.product.image_url).filter((u): u is string => !!u).slice(0, 3) : []
    const [applying, setApplying] = useState<string | null>(null)
    useEffect(() => {
        if (!userId) { setApplied(new Set()); return }
        supabase.from('service_applications').select('service_request_id').eq('applicant_id', userId)
            .then(({ data }) => setApplied(new Set(((data as any[]) || []).map((r) => r.service_request_id))))
    }, [userId])
    const applyTo = async (requestId: string) => {
        if (!userId) { router.push(`/login?redirect=${encodeURIComponent('/')}`); return }
        setApplying(requestId)
        const { error } = await supabase.from('service_applications').insert({ service_request_id: requestId, applicant_id: userId })
        setApplying(null)
        if (error) {
            toast.error(error.code === '42501' || error.code === 'PGRST301'
                ? 'Não foi possível se inscrever agora. Se você tem uma dívida do Pós-pago, quite para continuar.'
                : 'Erro ao se inscrever: ' + (error.message || 'tente novamente'))
            return
        }
        setApplied((prev) => new Set(prev).add(requestId))
        notifyServiceApplication(requestId)
        notifyServiceRequestsChanged()
        toast.success('Inscrição enviada! Acompanhe em "Me inscrevi".')
    }

    useEffect(() => {
        let cancelled = false
        const safe = <T,>(fn: () => Promise<T>, set: (v: T) => void, empty: T) =>
            fn().then((v) => { if (!cancelled) set(v) }).catch(() => { if (!cancelled) set(empty) })

        // As abertas agora vão sempre na frente; dentro de cada grupo, das mais novas para as mais antigas
        safe(async () => {
            const all = (await fetchStoreCards({ limit: 60 })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            return [...all.filter((x) => x.open), ...all.filter((x) => !x.open)].slice(0, 10)
        }, setStores, [])

        // Quais categorias já têm loja (a coluna category ora vem como slug, ora como nome: resolveCategoria unifica)
        safe(async () => {
            const { data } = await supabase.from('stores').select('category').eq('is_active', true).limit(5000)
            const counts: Record<string, number> = {}
            for (const r of (data || []) as { category: string | null }[]) {
                const slug = resolveCategoria(r.category)?.slug
                if (slug) counts[slug] = (counts[slug] || 0) + 1
            }
            return counts
        }, setCatCounts, {})

        // Do mais novo para o mais velho: loadProductCards (compartilhada com a home) ordena por visitas, então a ordem
        // por data de criação é aplicada aqui, em cima dos mesmos cartões.
        safe(async () => {
            const [cards, { data: newest }] = await Promise.all([
                loadProductCards(),
                supabase.from('products').select('id').eq('listing_type', 'sale').order('created_at', { ascending: false }).limit(60),
            ])
            const byId = new Map(cards.map((c) => [c.id, c]))
            const ordered = ((newest || []).map((r: any) => byId.get(r.id)).filter(Boolean) as ProductCard[]).slice(0, 12)

            // A loja que vende está aberta agora? (produto de perfil, sem loja, fica sem essa informação)
            const slugs = [...new Set(ordered.filter((p) => !p.isProfileProduct && p.storeSlug && p.storeSlug !== '#').map((p) => p.storeSlug))]
            const open = new Map<string, boolean>()
            if (slugs.length) {
                const { data: sts } = await supabase.from('stores').select('"storeSlug", business_hours').in('storeSlug', slugs)
                ;(sts || []).forEach((st: any) => open.set(st.storeSlug, isStoreOpenNow(st.business_hours as BusinessHours | null)))
            }
            return ordered.map((p) => ({ ...p, storeOpen: open.has(p.storeSlug) ? open.get(p.storeSlug)! : null }))
        }, setProducts, [])

        // Os mesmos serviços de /servicos-disponiveis (de lojas e de pessoas), os mais vistos na frente
        safe(async () => (await loadServiceCards()).slice(0, 12).map((c) => ({
            id: c.id, title: c.name, href: c.href, image: c.imageUrl, provider: c.seller, price: c.price,
            storeOpen: c.storeOpen, ownerOnline: c.ownerOnline,
        })) as ServiceItem[], setServices, [])

        safe(() => fetchOpenBoardItems(10), setRequests, [])

        safe(async () => {
            const { data: ranked } = await supabase.rpc('get_best_profiles', { p_limit: 10 })
            const rows = (ranked as { id: string; points: number }[]) || []
            if (rows.length === 0) return []
            const { data: profs } = await supabase.from('profiles').select('id, "profileSlug", avatar_url').in('id', rows.map((r) => r.id))
            const byId = new Map((profs || []).map((p: any) => [p.id, p]))
            return rows
                .map((r, i) => {
                    const p: any = byId.get(r.id)
                    return p?.profileSlug ? { id: r.id, slug: p.profileSlug, avatar: getAvatarUrl(supabase, p.avatar_url) || null, points: Number(r.points) || 0, rank: i } : null
                })
                .filter(Boolean) as PersonItem[]
        }, setPeople, [])

        safe(async () => {
            const { data } = await supabase
                .from('communities')
                .select('id, slug, name, city, image_url, is_listed, requires_password')
                .eq('is_listed', true)
                .eq('requires_password', false)
                .limit(8)
            const list = data || []
            if (list.length === 0) return []
            const ids = list.map((c: any) => c.id)
            const [{ data: mem }, act] = await Promise.all([
                supabase.from('community_members').select('community_id').in('community_id', ids),
                fetchCommunitiesActivity(ids),
            ])
            const counts = new Map<string, number>()
            ;(mem || []).forEach((m: any) => counts.set(m.community_id, (counts.get(m.community_id) || 0) + 1))
            // as últimas mensagens de cada sala (links viram palavra: o endereço inteiro não cabe nem ajuda)
            const { data: msgs } = await supabase.from('community_messages').select('id, community_id, profile_id, content, created_at').in('community_id', ids).order('created_at', { ascending: false }).limit(160)
            const byRoom = new Map<string, any[]>()
            ;(msgs || []).forEach((m: any) => { const l = byRoom.get(m.community_id) || []; if (l.length < 3) { l.push(m); byRoom.set(m.community_id, l) } })
            const authorIds = [...new Set([...byRoom.values()].flat().map((m: any) => m.profile_id))]
            const { data: authors } = authorIds.length ? await supabase.from('profiles').select('id, "profileSlug", name, avatar_url').in('id', authorIds) : { data: [] as any[] }
            const authorById = new Map((authors || []).map((a: any) => [a.id, a]))
            const nameOf = (a: any) => (a?.profileSlug ? `@${a.profileSlug}` : (a?.name || 'Alguém'))
            const say = (t: string) => (t || '').replace(/(https?:\/\/[^\s<>"']+)/gi, (u) => (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u) ? '📷 imagem' : '🔗 link do iUser')).trim()
            return list
                .map((c: any) => {
                    const recent = (byRoom.get(c.id) || []).slice().reverse()
                    const talk: CommunityTalk[] = recent.map((m: any) => {
                        const a = authorById.get(m.profile_id)
                        return { id: m.id, author: nameOf(a), avatar: getAvatarUrl(supabase, a?.avatar_url) || null, text: say(m.content), at: new Date(m.created_at).getTime() }
                    })
                    return {
                        id: c.id, slug: c.slug, name: c.name, city: c.city,
                        members: counts.get(c.id) || 0, image: c.image_url || null, activity: act[c.id] || null,
                        last: talk.length ? { author: talk[talk.length - 1].author, text: talk[talk.length - 1].text } : null,
                        talk, talkers: new Set(recent.map((m: any) => m.profile_id)).size,
                    }
                })
                .sort((a: CommunityItem, b: CommunityItem) => (b.activity?.activityAt || 0) - (a.activity?.activityAt || 0)) as CommunityItem[]
        }, setCommunities, [])

        return () => { cancelled = true }
    }, [])

    const go = (path: string) => router.push(path)

    const [sellOpen, setSellOpen] = useState(false)
    const [sellMode, setSellMode] = useState<'all' | 'product'>('all')
    // "Vender produto": produto precisa de loja — sem conta, cadastro; sem loja, criar loja; uma loja, direto; várias, escolher
    const sellProduct = async () => {
        if (!userId) return go('/criar-loja-com-cadastro')
        const { data } = await supabase.from('stores').select('storeSlug').eq('owner_id', userId)
        if (!data || data.length === 0) return go('/criar-loja')
        if (data.length === 1) return go(`/${data[0].storeSlug}/criar-produto`)
        setSellMode('product')
        setSellOpen(true)
    }
    const [inviteOpen, setInviteOpen] = useState(false)
    const inviteUrl = typeof window !== 'undefined' && profileSlug ? `${window.location.origin}/convite?ref=${profileSlug}` : ''

    // `icons`: quatro ícones (quadrado 2x2) no lugar do ícone único — dão uma ideia do que cabe naquele cartão
    type Action = { /** Cartão próprio: o que tem por perto (um de cada tipo) */ nearby?: boolean; /** Cartão próprio: vitrine com alguns imóveis para alugar */ rentals?: boolean; /** Com algo em andamento o cartão vira um retângulo horizontal: fotos do que está em andamento + botão de voltar a isso */ wide?: { images: string[]; cta: string; hot?: boolean; sub?: string; /** O botão da ponta leva a outro lugar que o cartão (ex.: Comprar abre a loja, "Finalizar" abre o carrinho) */ onCta?: () => void }; title: string; desc: string; icon: LucideIcon; icons?: LucideIcon[]; color: string; onClick: () => void; /** Algo esperando a pessoa (ex.: candidatos a escolher) */ alert?: boolean; /** Destaca o texto (o cartão está mostrando o andamento, não só a chamada) */ live?: boolean }
    // Quem PRECISA de algo (o visitante chega por aqui)
    // Os cartões se moldam ao que a pessoa tem em andamento: pedidos de serviço e carrinho
    const reqBuscando = myRequests.filter((r) => r.stage === 'buscando').length
    const reqContratado = myRequests.filter((r) => r.stage === 'contratado').length
    const reqAvaliar = myRequests.filter((r) => r.needsReview).length
    const reqEscolher = myRequests.filter((r) => r.stage === 'buscando' && r.candidates.some((c) => c.status === 'pending')).length
    const serviceParts = [
        reqBuscando > 0 ? `${reqBuscando} buscando` : '',
        reqContratado > 0 ? `${reqContratado} ${reqContratado === 1 ? 'contratado' : 'contratados'}` : '',
        reqAvaliar > 0 ? `${reqAvaliar} para avaliar` : '',
    ].filter(Boolean)
    // O que pede a atenção primeiro: candidatos para escolher, serviço para avaliar, buscando, contratado
    const activeRequests = myRequests.filter((r) => r.stage !== 'concluido' || r.needsReview)
    const reqImages = [...activeRequests].sort((a, b) => Number(b.candidates.some((c) => c.status === 'pending') || b.needsReview) - Number(a.candidates.some((c) => c.status === 'pending') || a.needsReview))
        .map((r) => r.photoUrl).filter((u): u is string => !!u).slice(0, 3)
    const rideStatus = !activeRide ? null
        : activeRide.status === 'pending'
            ? (activeRide.candidates > 0 ? `${activeRide.candidates} ${activeRide.candidates === 1 ? 'motorista quer' : 'motoristas querem'} te levar` : 'Buscando motorista...')
            : activeRide.started ? 'Em viagem' : activeRide.arrived ? 'O motorista chegou' : activeRide.enRoute ? 'Motorista a caminho' : 'Motorista escolhido'
    const needs: Action[] = [
        {
            title: 'Comprar', desc: cartCount > 0 ? `${cartCount} ${cartCount === 1 ? 'item' : 'itens'} no carrinho${money(cartTotal) ? ` · ${money(cartTotal)}` : ''}` : 'Lojas e produtos perto de você', live: cartCount > 0,
            wide: cartCount > 0 ? { images: cartImages, cta: 'Finalizar', onCta: () => go('/carrinho') } : undefined,
            icon: ShoppingBag, icons: [ShoppingBag, UtensilsCrossed, Shirt, Smartphone], color: TYPE.loja.color, onClick: () => go('/comprar') },
        { title: 'Contratar serviço', desc: serviceParts.length > 0 ? serviceParts.join(' · ') : 'Descreva o que você precisa', live: serviceParts.length > 0, alert: reqEscolher > 0 || reqAvaliar > 0,
            wide: serviceParts.length > 0 ? { images: reqImages, cta: reqEscolher > 0 ? 'Escolher' : reqAvaliar > 0 ? 'Avaliar' : 'Ver', hot: reqEscolher > 0 || reqAvaliar > 0 } : undefined,
            icon: Wrench, icons: [Wrench, Scissors, Hand, Sparkles], color: TYPE.servico.color, onClick: () => go('/solicitar-servico') },
        { title: 'Pedir motorista', desc: rideStatus ?? 'Corrida rápida, preço combinado', live: !!activeRide,
            wide: activeRide ? { images: [], cta: activeRide.status === 'pending' ? (activeRide.candidates > 0 ? 'Escolher' : 'Ver') : 'Acompanhar', hot: activeRide.candidates > 0 || activeRide.arrived, sub: activeRide.destination ? `Para ${shortAddress(activeRide.destination)}` : undefined } : undefined,
            icon: Car, icons: [Car, Bike, Motorbike, Package], color: '#ea580c', onClick: () => go('/pedir-motorista') },
        { title: 'Ver ao redor', desc: 'Mapa com lojas, serviços e pessoas', nearby: true, icon: Radar, icons: [Radar, MapPin, StoreIcon, Users], color: '#0891b2', onClick: () => go('/radar') },
        { title: 'Buscar imóvel', desc: 'Casa, apartamento, salas comerciais, kitnets, etc.', rentals: true, icon: HomeIcon, color: '#16a34a', onClick: () => go('/imoveis') },
    ]
    // Quem QUER GANHAR com o iUser
    const earns: Action[] = [
        { title: 'Vender', desc: 'Mostre seu produto, serviço ou loja', icon: CircleDollarSign, color: '#16a34a', onClick: () => setSellOpen(true) },
        { title: 'Anunciar imóvel', desc: 'Alugue sua casa, apto ou sala', icon: HomeIcon, color: '#16a34a', onClick: () => go('/anunciar-imovel') },
        { title: 'Ser motorista', desc: 'Receba corridas na sua região', icon: Car, color: '#ea580c', onClick: () => go('/painel-motorista') },
        {
            title: 'Indicar e ganhar', desc: 'Convide e receba comissão', icon: UserPlus, color: '#7c3aed',
            onClick: async () => {
                if (!userId || !inviteUrl) return go('/login')
                if (await copyText(inviteUrl)) toast.success('Link de convite copiado!')
                setInviteOpen(true)
            },
        },
    ]

    const searching = query.trim().length > 0

    return (
        <>

                <SellDialog open={sellOpen} onClose={() => { setSellOpen(false); setSellMode('all') }} userId={userId} colors={colors} go={go} mode={sellMode} />
                <ShareLinkDialog
                    open={inviteOpen}
                    onClose={() => setInviteOpen(false)}
                    url={inviteUrl}
                    title="Convidar para o iUser"
                    text={`@${profileSlug} te chama pro iUser — compre, venda, preste serviço ou dirija, tudo numa plataforma só, sem taxa escondida.\n\nEntre pelo meu link e comece agora:`}
                />

                {/* Busca sempre à mão, em cima de Comprar / Contratar serviço (a lupa da barra leva o foco pra cá) */}
                <div className="mt-2 mb-3 flex items-center gap-2 px-4 rounded-full" style={{ height: 48, background: colors.surface, border: `1.5px solid ${colors.border}` }}>
                    <Search size={18} className="flex-shrink-0" style={{ color: colors.accent }} />
                    <input
                        ref={searchInputRef}
                        type="search"
                        inputMode="search"
                        enterKeyHint="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="O que você procura? Lojas, serviços, pessoas..."
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none appearance-none [&::-webkit-search-cancel-button]:hidden"
                        style={{ color: colors.textPrimary }}
                    />
                    {query && <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={17} /></button>}
                </div>


                {searching ? (
                    <div className="mt-6"><SearchResultsSection searchQuery={query} /></div>
                ) : (
                    <>
                        {/* ===== 1. O QUE VOCÊ QUER FAZER? — dois blocos: quem precisa / quem quer ganhar ===== */}
                        <section className="mt-2">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 grid-flow-dense">
                                {needs.map((a) => {
                                    const Icon = a.icon
                                    if (a.nearby) return <NearbyAroundCard key={a.title} userId={userId} />
                                    if (a.rentals) return <RentalsPreviewCard key={a.title} title={a.title} desc={a.desc} />
                                    // Sobrou um quadrado sozinho na linha (os outros viraram retângulos): ele também vira retângulo, só sem botão
                                    const squares = needs.filter((n) => !n.wide && !n.nearby && !n.rentals)
                                    const lonely = !a.wide && squares.length % 2 === 1 && squares[squares.length - 1] === a
                                    if (a.wide || lonely) {
                                        const Ic = a.icon
                                        const w = a.wide || { images: [] as string[], cta: '' }
                                        return (
                                            <button
                                                key={a.title}
                                                onClick={a.onClick}
                                                className="relative col-span-2 text-left rounded-3xl p-3.5 border flex items-center gap-3.5 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                                                style={{ background: colors.surface, borderColor: a.wide ? `${a.color}66` : colors.border, boxShadow: colors.shadow }}
                                            >
                                                {w.images.length > 0 ? (
                                                    <span className="flex flex-shrink-0 -space-x-4">
                                                        {w.images.map((u, i) => (
                                                            <img key={i} src={u} alt="" loading="lazy" className="w-14 h-14 rounded-2xl object-cover" style={{ border: `2.5px solid ${colors.surface}`, zIndex: 3 - i }} />
                                                        ))}
                                                    </span>
                                                ) : (
                                                    <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}1f`, color: a.color }}><Ic size={26} /></span>
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.title}</span>
                                                    <span className={`block text-xs mt-0.5 leading-snug ${a.wide ? 'font-black' : ''}`} style={{ color: a.wide ? a.color : colors.textSecondary }}>{a.desc}</span>
                                                    {w.sub && <span className="block text-[11px] mt-0.5 truncate" style={{ color: colors.textSecondary }}>{w.sub}</span>}
                                                </span>
                                                {w.cta
                                                    ? <span
                                                        role={w.onCta ? 'button' : undefined}
                                                        onClick={w.onCta ? (e) => { e.stopPropagation(); w.onCta!() } : undefined}
                                                        className="flex-shrink-0 h-9 px-4 rounded-full flex items-center text-[13px] font-black text-white"
                                                        style={{ background: w.hot ? '#ef4444' : '#f97316' }}
                                                    >{w.cta}</span>
                                                    : <ChevronRight size={16} className="flex-shrink-0" style={{ color: colors.textSecondary }} />}
                                            </button>
                                        )
                                    }
                                    return (
                                        <button
                                            key={a.title}
                                            onClick={a.onClick}
                                            className="relative text-left rounded-3xl p-4 border flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                                        >
                                            {a.icons && a.icons.length === 4 ? (
                                                <span className="w-14 h-14 rounded-2xl grid grid-cols-2 grid-rows-2 gap-1 p-1.5 place-items-center" style={{ background: `${a.color}1f`, color: a.color }}>
                                                    {a.icons.map((Ic, i) => <Ic key={i} size={18} />)}
                                                </span>
                                            ) : (
                                                <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${a.color}1f`, color: a.color }}>
                                                    <Icon size={24} />
                                                </span>
                                            )}
                                            <span>
                                                <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.title}</span>
                                                <span className={`block text-xs mt-0.5 leading-snug ${a.live ? 'font-black' : ''}`} style={{ color: a.live ? a.color : colors.textSecondary }}>{a.desc}</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                        <div className="mt-7">
                            <SectionHeader type="servico" title="Serviços que você pode gostar" subtitle="Profissionais divulgando os melhores serviços" onSeeAll={() => go('/servicos-disponiveis')} colors={colors} />
                            {services === null ? <Skeleton colors={colors} /> : services.length === 0 ? null : (
                                <Strip>
                                    {services.map((s) => (
                                        <TallTile
                                            key={s.id}
                                            type="servico"
                                            colors={colors}
                                            image={s.image}
                                            title={s.title}
                                            badge={s.storeOpen != null ? { label: s.storeOpen ? 'Aberto' : 'Fechado', color: s.storeOpen ? '#16a34a' : '#dc2626' } : s.ownerOnline != null ? { label: s.ownerOnline ? 'Online' : 'Offline', color: s.ownerOnline ? '#16a34a' : '#6b7280' } : undefined}
                                            onClick={() => go(s.href)}
                                            meta={
                                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>
                                                    {money(s.price) && <span className="font-black text-[12px]" style={{ color: TYPE.servico.color }}>{money(s.price)} · </span>}{s.provider}
                                                </span>
                                            }
                                            action={<span className="w-full h-8 rounded-full flex items-center justify-center text-[12px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Ver serviço</span>}
                                        />
                                    ))}
                                </Strip>
                            )}
                        </div>

                            <h2 className="text-xl font-black mt-6 mb-3" style={{ color: colors.textPrimary }}>Quero ganhar com o iUser</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {earns.map((a) => {
                                    const Icon = a.icon
                                    return (
                                        <button
                                            key={a.title}
                                            onClick={a.onClick}
                                            className="text-left rounded-2xl p-3.5 border flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                                            style={{ background: colors.surface, borderColor: `${a.color}55`, boxShadow: colors.shadow }}
                                        >
                                            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}1f`, color: a.color }}>
                                                <Icon size={22} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.title}</span>
                                                <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{a.desc}</span>
                                            </span>
                                            <ChevronRight size={16} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                        </button>
                                    )
                                })}
                            </div>


                        </section>

                        {/* ===== 2. CATEGORIAS — as que já têm loja em destaque; as vazias convidam a abrir a primeira ===== */}
                        {(() => {
                            const list = categorias.filter((c) => c.slug !== 'comunidades' && c.slug !== 'social')
                            const nameOf = (c: (typeof list)[number]) => (c.slug === 'transporte' ? 'Frete' : c.nome)
                            const iconOf = (c: (typeof list)[number]) => (c.slug === 'servicos' ? Scissors : c.icone)
                            const withStores = catCounts ? list.filter((c) => (catCounts[c.slug] || 0) > 0).sort((a, b) => (catCounts[b.slug] || 0) - (catCounts[a.slug] || 0)) : []
                            const empty = catCounts ? list.filter((c) => !(catCounts[c.slug] || 0)) : []
                            const createIn = (slug: string) => go(userId ? `/criar-loja?categoria=${slug}` : `/login?redirect=${encodeURIComponent(`/criar-loja?categoria=${slug}`)}`)
                            return (
                                <section className="mt-8">
                                    <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Explore lojas por categoria</h2>

                                    {catCounts === null ? (
                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[76px] rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                                        </div>
                                    ) : (
                                        <>
                                            {withStores.length > 0 && (
                                                <div className="grid grid-cols-2 gap-3 mt-3">
                                                    {withStores.map((c) => {
                                                        const Icon = iconOf(c)
                                                        return (
                                                            <button
                                                                key={c.slug}
                                                                onClick={() => go(`/lojas/${c.slug}`)}
                                                                className="text-left rounded-2xl p-3 flex items-center gap-3 transition hover:-translate-y-0.5 active:scale-[0.98]"
                                                                style={{ background: `${c.color}14` }}
                                                            >
                                                                <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: c.color }}>
                                                                    <Icon size={24} />
                                                                </span>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block text-sm font-black leading-tight" style={{ color: colors.textPrimary }}>{nameOf(c)}</span>
                                                                </span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {/* Só pra quem ainda não entrou: um convite curto pra abrir a primeira loja de cada categoria vazia */}
                                            {!userId && empty.length > 0 && (
                                                <div className="mt-4">
                                                    <p className="text-xs" style={{ color: colors.textSecondary }}>Sem loja ainda — seja a primeira:</p>
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {empty.map((c) => {
                                                            const Icon = iconOf(c)
                                                            return (
                                                                <button
                                                                    key={c.slug}
                                                                    onClick={() => createIn(c.slug)}
                                                                    className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-[11px] font-bold transition active:scale-95"
                                                                    style={{ background: `${c.color}14`, color: colors.textPrimary }}
                                                                >
                                                                    <Icon size={14} style={{ color: c.color }} />
                                                                    {nameOf(c)}
                                                                    <span style={{ color: c.color }}>+</span>
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </section>
                            )
                        })()}

                        {/* ===== 3. VITRINES — uma por tipo, cada uma com a sua cor ===== */}
                        <section className="mt-9">
                            <SectionHeader type="loja" title="Lojas para conhecer" subtitle="Quem vende perto de você" onSeeAll={() => go('/lojas')} colors={colors} />
                            {stores === null ? <Skeleton colors={colors} /> : stores.length === 0 ? null : (
                                <Strip>
                                    {stores.map((s) => <StoreImageCard key={s.id} s={s} onClick={() => go(`/${s.slug}`)} />)}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="produto" title="Produtos que você pode gostar" subtitle="Itens para você" onSeeAll={() => go('/produtos')} colors={colors} />
                            {products === null ? <Skeleton colors={colors} /> : products.length === 0 ? null : (
                                // Mesmo cartão da página /produtos, em colunas de 3: rola de lado e cada coluna tem 3 produtos
                                <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-pl-4 scroll-pr-4 pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                                    {Array.from({ length: Math.ceil(products.length / 3) }, (_, col) => products.slice(col * 3, col * 3 + 3)).map((group, col) => (
                                        <div key={col} className="snap-start flex-shrink-0 w-[88%] sm:w-[380px] flex flex-col">
                                            {group.map((p) => (
                                                <ListingRowCard
                                                    key={p.id}
                                                    title={p.name}
                                                    description={p.description}
                                                    imageUrl={p.imageUrl || p.storeLogoUrl}
                                                    fallbackIcon={<Package size={30} />}
                                                    priceLabel={money(p.price)}
                                                    sellerName={p.storeName}
                                                    sellerImageUrl={p.storeLogoUrl}
                                                    rating={p.rating}
                                                    views={p.viewCount}
                                                    tag={p.storeOpen == null ? null : p.storeOpen ? 'Aberto' : 'Fechado'}
                                                    onClick={() => go(p.storeSlug && p.storeSlug !== '#' && p.slug ? `/${p.storeSlug}/${p.slug}` : `/${p.profileSlug || p.storeSlug}/${p.slug || p.id}`)}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>


                        <section className="mt-8">
                            <SectionHeader type="pedido" title="Quem está procurando serviço" subtitle="Ganhe dinheiro fazendo serviços" onSeeAll={() => go('/procurar-servico')} colors={colors} />
                            {requests === null ? <Skeleton colors={colors} /> : requests.length === 0 ? null : (
                                <Strip>
                                    {requests.map((r) => (
                                        <TallTile
                                            key={r.id}
                                            type="pedido"
                                            colors={colors}
                                            image={r.photo_urls?.[0] || null}
                                            title={getRequestTitle(r.description, r.service_type, r.custom_service)}
                                            onClick={() => go(`/procurar-servico?ver=${r.id}`)}
                                            meta={
                                                <span className="flex items-center gap-1 text-[11px]" style={{ color: colors.textSecondary }}>
                                                    <MapPin size={10} className="flex-shrink-0" />
                                                    <span className="truncate">{shortAddress(r.location_address).replace(/[,\s]+\d+\s*\w*$/, '')}</span>
                                                    <span className="flex-shrink-0">· {askedAgo(r.created_at).replace('pediu ', '').replace('há ', '')}</span>
                                                </span>
                                            }
                                            action={<div className="w-full flex items-center gap-1.5">{r.requester_id === userId ? (
                                                <span className="flex-1 h-8 rounded-full flex items-center justify-center text-[12px] font-black" style={{ background: `${colors.border}40`, color: colors.textSecondary }}>Seu pedido</span>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (!applied.has(r.id)) applyTo(r.id) }}
                                                    disabled={applied.has(r.id) || applying === r.id}
                                                    className="flex-1 min-w-0 h-8 rounded-full text-[12px] font-black transition active:scale-95 disabled:opacity-70"
                                                    style={applied.has(r.id) ? { background: `${colors.border}40`, color: colors.textSecondary } : { background: '#f97316', color: '#fff' }}
                                                >
                                                    {applying === r.id ? '...' : applied.has(r.id) ? 'Inscrição enviada' : 'Quero me inscrever'}
                                                </button>
                                            )}<ServiceRequestShareButton item={r} size={32} /></div>}
                                        />
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="pessoa" title="OUTDOOR iUSER" subtitle="Os perfis com mais pontos do iUser" onSeeAll={() => go('/social')} colors={colors} />
                            {people === null ? <Skeleton colors={colors} /> : people.length === 0 ? null : (
                                <Strip>
                                    {people.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => go(`/${p.slug}`)}
                                            className="relative snap-start flex-shrink-0 w-[132px] sm:w-[148px] rounded-3xl border p-3 flex flex-col items-center gap-2 text-center transition hover:-translate-y-0.5 hover:shadow-xl"
                                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                                        >
                                            <PlanAvatarRing userId={p.id} width={3} linkToProfile={false}>
                                                {p.avatar ? (
                                                    <img src={p.avatar} alt="" className="w-[76px] h-[76px] rounded-full object-cover" loading="lazy" />
                                                ) : (
                                                    <span className="w-[76px] h-[76px] rounded-full flex items-center justify-center text-white text-2xl font-black" style={{ background: GRADIENT }}>
                                                        {p.slug.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </PlanAvatarRing>
                                            {/* Colocação em Melhores perfis, no canto: 1º dourado, 2º prata, 3º bronze; o resto, degradê do iUser */}
                                            <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full text-[11px] font-black" style={rankStyle(p.rank)} title={`${p.rank + 1}º lugar em Melhores perfis`}>
                                                #{p.rank + 1}
                                            </span>
                                            <span className="block w-full text-sm font-black truncate" style={{ color: colors.textPrimary }}>@{p.slug}</span>
                                            <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>⭐ {p.points} pts</span>
                                        </button>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="comunidade" title="Comunidades" subtitle="Veja o que estão falando na sua região" onSeeAll={() => go('/comunidade')} colors={colors} />
                            {communities === null ? <Skeleton colors={colors} /> : communities.length === 0 ? null : (
                                <Strip>
                                    {communities.map((c) => (
                                        <CommunityTalkCard key={c.id} c={c} colors={colors} onClick={() => go(`/comunidade/${c.slug}`)} />
                                    ))}
                                </Strip>
                            )}
                        </section>

                        {/* ===== 4. CONVITE FINAL ===== */}
                        <SellCta
                            colors={colors}
                            onStore={() => go(userId ? '/criar-loja' : '/criar-loja-com-cadastro')}
                            onService={() => go(profileSlug ? '/meus-servicos' : '/login')}
                            onProduct={sellProduct}
                        />
                    </>
                )}
        </>
    )
}
