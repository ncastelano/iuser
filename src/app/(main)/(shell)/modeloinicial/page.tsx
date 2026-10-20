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
    Search, ShoppingBag, Store as StoreIcon, Car, Wrench, Megaphone, Briefcase, Users, MessageCircle,
    ChevronRight, Star, MapPin, Eye, User, LogIn, LogOut, Radar, UserPlus, X, Package, ShoppingCart, Scissors, Check,
    UtensilsCrossed, Shirt, Smartphone, Hand, Sparkles, Bike, Motorbike, type LucideIcon,
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
import { fetchOpenBoardItems, askedAgo, shortAddress, notifyServiceRequestsChanged, type BoardItem } from '@/lib/serviceBoard'
import { notifyServiceApplication } from '@/lib/notifyRideStatus'
import { getRequestTitle } from '@/lib/serviceTypes'
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'
import PlanAvatarRing, { usePlanRing } from '@/components/PlanAvatarRing'
import SearchResultsSection from '../../inicio/SearchResultsSection'
import { rankStyle } from '../../social/SocialProfileCard'
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

// "Vender": o que a pessoa quer mostrar — uma loja, um produto (precisa de uma loja) ou um serviço dela.
function SellDialog({ open, onClose, userId, colors, go, mode = 'all' }: { open: boolean; onClose: () => void; userId: string | null; colors: any; go: (p: string) => void; mode?: 'all' | 'product' }) {
    const [myStores, setMyStores] = useState<{ id: string; name: string; storeSlug: string }[] | null>(null)
    const [pickStore, setPickStore] = useState(false)

    useEffect(() => {
        if (!open) { setPickStore(false); return }
        if (!userId) { setMyStores([]); return }
        let cancelled = false
        supabase.from('stores').select('id, name, "storeSlug"').eq('owner_id', userId).then(({ data }) => {
            if (!cancelled) setMyStores((data as any[]) || [])
        })
        return () => { cancelled = true }
    }, [open, userId])

    // Vindo do "Vender produto": com mais de uma loja, já cai na escolha de qual loja
    useEffect(() => {
        if (open && mode === 'product' && myStores && myStores.length > 1) setPickStore(true)
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

    const product = () => {
        if (!userId) return go('/criar-loja-com-cadastro')
        if (!myStores || myStores.length === 0) return go('/criar-loja')
        if (myStores.length === 1) return go(`/${myStores[0].storeSlug}/criar-produto`)
        setPickStore(true)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
            <div className="w-full max-w-md rounded-3xl p-5" style={{ background: colors.background }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>{pickStore ? 'Em qual loja?' : 'O que você quer vender?'}</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{pickStore ? 'Escolha a loja que vai receber o produto.' : 'Escolha o que quer mostrar no iUser.'}</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-1" style={{ color: colors.textSecondary }}><X size={20} /></button>
                </div>
                <div className="flex flex-col gap-2.5">
                    {pickStore
                        ? (myStores || []).map((st) => option(st.id, <StoreIcon size={20} />, TYPE.loja.color, st.name, `/${st.storeSlug}`, () => go(`/${st.storeSlug}/criar-produto`)))
                        : (
                            <>
                                {option('loja', <StoreIcon size={20} />, TYPE.loja.color, 'Uma loja', 'Crie sua loja e organize tudo num só lugar', () => go(userId ? '/criar-loja' : '/criar-loja-com-cadastro'))}
                                {option('produto', <Package size={20} />, TYPE.produto.color, 'Um produto', myStores === null || myStores.length > 0 ? 'Publique na sua loja' : 'Precisa de uma loja — a gente leva você pra criar', product)}
                                {option('servico', <Wrench size={20} />, TYPE.servico.color, 'Um serviço', 'Divulgue o que você faz e seja encontrado', () => go(userId ? '/meus-servicos' : '/login'))}
                            </>
                        )}
                </div>
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
interface CommunityItem { id: string; slug: string; name: string; city: string; members: number; image: string | null; activity: CommunityActivity | null; last: { author: string; text: string } | null }

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

function Tile({ type, onClick, image, fallback, children, colors, round = false, badge }: {
    type: TypeKey; onClick: () => void; image?: string | null; fallback: ReactNode; children: ReactNode; colors: any; round?: boolean
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
            const ordered = ((newest || []).map((r: any) => byId.get(r.id)).filter(Boolean) as ProductCard[]).slice(0, 10)

            // A loja que vende está aberta agora? (produto de perfil, sem loja, fica sem essa informação)
            const slugs = [...new Set(ordered.filter((p) => !p.isProfileProduct && p.storeSlug && p.storeSlug !== '#').map((p) => p.storeSlug))]
            const open = new Map<string, boolean>()
            if (slugs.length) {
                const { data: sts } = await supabase.from('stores').select('"storeSlug", business_hours').in('storeSlug', slugs)
                ;(sts || []).forEach((st: any) => open.set(st.storeSlug, isStoreOpenNow(st.business_hours as BusinessHours | null)))
            }
            return ordered.map((p) => ({ ...p, storeOpen: open.has(p.storeSlug) ? open.get(p.storeSlug)! : null }))
        }, setProducts, [])

        safe(async () => {
            const { data: rows } = await supabase
                .from('products')
                .select('id, name, slug, image_url, price, owner_id, store_id, view_count')
                .eq('listing_type', 'service_offer')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(10)
            const list = rows || []
            const ownerIds = [...new Set(list.filter((r: any) => !r.store_id && r.owner_id).map((r: any) => r.owner_id))]
            const storeIds = [...new Set(list.filter((r: any) => r.store_id).map((r: any) => r.store_id))]
            const [{ data: profs }, { data: sts }] = await Promise.all([
                ownerIds.length ? supabase.from('profiles').select('id, "profileSlug"').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
                storeIds.length ? supabase.from('stores').select('id, name, "storeSlug", business_hours').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
            ])
            const profMap = new Map((profs || []).map((p: any) => [p.id, p.profileSlug]))
            const storeMap = new Map((sts || []).map((s: any) => [s.id, s]))
            // Quem presta o serviço (perfil) está online agora? Respeita a escolha de "visto por último" de cada pessoa:
            // quem não mostra a presença aparece como offline.
            const online = new Map<string, boolean>()
            if (ownerIds.length) {
                const { data: seen } = await supabase.rpc('get_last_seen_for', { p_ids: ownerIds })
                ;((seen as { profile_id: string; online: boolean }[]) || []).forEach((r) => online.set(r.profile_id, !!r.online))
            }
            return list.map((r: any) => {
                const store: any = r.store_id ? storeMap.get(r.store_id) : null
                const slug = store ? store.storeSlug : profMap.get(r.owner_id)
                return {
                    id: r.id,
                    title: r.name,
                    href: slug && r.slug ? `/${slug}/${r.slug}` : '/',
                    image: toPublicImage('product-images', r.image_url),
                    provider: store ? store.name : slug ? `@${slug}` : 'Prestador',
                    price: r.price != null ? Number(r.price) : null,
                    storeOpen: store ? isStoreOpenNow(store.business_hours as BusinessHours | null) : null,
                    ownerId: store ? null : r.owner_id,
                    ownerOnline: store ? null : (online.get(r.owner_id) ?? false),
                }
            }) as ServiceItem[]
        }, setServices, [])

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
            // última mensagem de cada sala (links viram palavra: o endereço inteiro não cabe nem ajuda)
            const { data: msgs } = await supabase.from('community_messages').select('community_id, profile_id, content, created_at').in('community_id', ids).order('created_at', { ascending: false }).limit(80)
            const lastBy = new Map<string, { profile_id: string; content: string }>()
            ;(msgs || []).forEach((m: any) => { if (!lastBy.has(m.community_id)) lastBy.set(m.community_id, m) })
            const authorIds = [...new Set([...lastBy.values()].map((m) => m.profile_id))]
            const { data: authors } = authorIds.length ? await supabase.from('profiles').select('id, "profileSlug", name').in('id', authorIds) : { data: [] as any[] }
            const authorName = new Map((authors || []).map((a: any) => [a.id, a.profileSlug ? `@${a.profileSlug}` : (a.name || 'Alguém')]))
            const say = (t: string) => (t || '').replace(/(https?:\/\/[^\s<>"']+)/gi, (u) => (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u) ? '📷 imagem' : '🔗 link do iUser')).trim()
            return list
                .map((c: any) => ({
                    id: c.id, slug: c.slug, name: c.name, city: c.city,
                    members: counts.get(c.id) || 0, image: c.image_url || null, activity: act[c.id] || null,
                    last: lastBy.has(c.id) ? { author: authorName.get(lastBy.get(c.id)!.profile_id) || 'Alguém', text: say(lastBy.get(c.id)!.content) } : null,
                }))
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
    type Action = { title: string; desc: string; icon: LucideIcon; icons?: LucideIcon[]; color: string; onClick: () => void }
    // Quem PRECISA de algo (o visitante chega por aqui)
    const needs: Action[] = [
        { title: 'Comprar', desc: 'Lojas e produtos perto de você', icon: ShoppingBag, icons: [ShoppingBag, UtensilsCrossed, Shirt, Smartphone], color: TYPE.loja.color, onClick: () => go('/comprar') },
        { title: 'Contratar serviço', desc: 'Descreva o que você precisa', icon: Wrench, icons: [Wrench, Scissors, Hand, Sparkles], color: TYPE.servico.color, onClick: () => go('/solicitar-servico') },
        { title: 'Pedir motorista', desc: 'Corrida rápida, preço combinado', icon: Car, icons: [Car, Bike, Motorbike, Package], color: '#ea580c', onClick: () => go('/pedir-motorista') },
        { title: 'Ver ao redor', desc: 'Mapa com lojas, serviços e pessoas', icon: Radar, icons: [Radar, MapPin, StoreIcon, Users], color: '#0891b2', onClick: () => go('/radar') },
    ]
    // Quem QUER GANHAR com o iUser
    const earns: Action[] = [
        { title: 'Vender', desc: 'Mostre seu produto, serviço ou loja', icon: Megaphone, color: '#16a34a', onClick: () => setSellOpen(true) },
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {needs.map((a) => {
                                    const Icon = a.icon
                                    return (
                                        <button
                                            key={a.title}
                                            onClick={a.onClick}
                                            className="text-left rounded-3xl p-4 border flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
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
                                                <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{a.desc}</span>
                                            </span>
                                        </button>
                                    )
                                })}
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
                                <Strip>
                                    {products.map((p) => (
                                        <Tile key={p.id} type="produto" colors={colors} image={p.imageUrl} fallback={<ShoppingBag size={36} />} badge={p.storeOpen == null ? undefined : { label: p.storeOpen ? 'Aberto' : 'Fechado', color: p.storeOpen ? '#16a34a' : '#dc2626' }} onClick={() => go(p.storeSlug && p.storeSlug !== '#' && p.slug ? `/${p.storeSlug}/${p.slug}` : `/${p.profileSlug || p.storeSlug}/${p.slug || p.id}`)}>
                                            <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</span>
                                            {money(p.price) && <span className="block text-sm font-black mt-1" style={{ color: TYPE.produto.color }}>{money(p.price)}</span>}
                                            <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{p.storeName}</span>
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="servico" title="Serviços que você pode gostar" subtitle="Profissionais divulgando os melhores serviços" onSeeAll={() => go('/produtos')} colors={colors} />
                            {services === null ? <Skeleton colors={colors} /> : services.length === 0 ? null : (
                                <Strip>
                                    {services.map((s) => (
                                        <Tile key={s.id} type="servico" colors={colors} image={s.image} fallback={<Wrench size={36} />} badge={s.storeOpen != null ? { label: s.storeOpen ? 'Aberto' : 'Fechado', color: s.storeOpen ? '#16a34a' : '#dc2626' } : s.ownerOnline != null ? { label: s.ownerOnline ? 'Online' : 'Offline', color: s.ownerOnline ? '#16a34a' : '#6b7280' } : undefined} onClick={() => go(s.href)}>
                                            <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{s.title}</span>
                                            {money(s.price) && <span className="block text-sm font-black mt-1" style={{ color: TYPE.servico.color }}>{money(s.price)}</span>}
                                            <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{s.provider}</span>
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="pedido" title="Quem está procurando serviço" subtitle="Ganhe dinheiro fazendo serviços" onSeeAll={() => go('/procurar-servico')} colors={colors} />
                            {requests === null ? <Skeleton colors={colors} /> : requests.length === 0 ? null : (
                                <Strip>
                                    {requests.map((r) => (
                                        <Tile key={r.id} type="pedido" colors={colors} image={r.photo_urls?.[0] || null} fallback={<Briefcase size={36} />} onClick={() => go(`/procurar-servico?ver=${r.id}`)}>
                                            <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>
                                                {getRequestTitle(r.description, r.service_type, r.custom_service)}
                                            </span>
                                            <span className="block text-[11px] truncate mt-1" style={{ color: colors.textSecondary }}>
                                                {r.requester?.profileSlug ? `@${r.requester.profileSlug}` : 'Alguém'} · {askedAgo(r.created_at).replace('pediu ', '')}
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>
                                                <MapPin size={10} className="flex-shrink-0" />{shortAddress(r.location_address).replace(/[,\s]+\d+\s*\w*$/, '')}
                                            </span>
                                            {r.requester_id === userId ? (
                                                <span className="mt-2 w-full h-9 rounded-full flex items-center justify-center text-[12px] font-black" style={{ background: `${colors.border}40`, color: colors.textSecondary }}>Seu pedido</span>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (!applied.has(r.id)) applyTo(r.id) }}
                                                    disabled={applied.has(r.id) || applying === r.id}
                                                    className="mt-2 w-full h-9 rounded-full text-[12px] font-black transition active:scale-95 disabled:opacity-70"
                                                    style={applied.has(r.id) ? { background: `${colors.border}40`, color: colors.textSecondary } : { background: '#f97316', color: '#fff' }}
                                                >
                                                    {applying === r.id ? '...' : applied.has(r.id) ? 'Inscrição enviada' : 'Inscrever-se'}
                                                </button>
                                            )}
                                        </Tile>
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
                                        <Tile key={c.id} type="comunidade" colors={colors} image={c.image} fallback={<MessageCircle size={36} />} onClick={() => go(`/comunidade/${c.slug}`)}>
                                            <span className="block text-sm font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{c.name}</span>
                                            <span className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                <Users size={11} /> {c.members} {c.members === 1 ? 'membro' : 'membros'}
                                            </span>
                                            {c.activity?.photoVoteActive && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-black mt-1.5 px-2 py-0.5 rounded-full" style={{ background: '#f9731618', color: '#ea580c' }}>
                                                    <Eye size={10} /> Votação de foto
                                                </span>
                                            )}
                                        </Tile>
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
