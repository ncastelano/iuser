// app/(main)/modeloinicial/page.tsx
//
// MODELO INICIAL — proposta de página inicial pensada em quem usa: o que eu posso FAZER aqui, o que existe pra eu
// VER, e como distinguir cada coisa. Mesmos dados reais da home, outra organização:
//   1) cumprimento + busca;  2) "O que você quer fazer?" (4 ações grandes);  3) categorias;
//   4) vitrines, uma por tipo, cada tipo com a SUA cor e o seu rótulo (loja, produto, serviço, pedido, pessoa, comunidade).
// Todos os cartões têm o mesmo tamanho (nem miúdos, nem gigantes) pra a página ter ritmo.
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Search, ShoppingBag, Store as StoreIcon, Car, Wrench, Megaphone, Briefcase, Users, MessageCircle,
    ChevronRight, Star, MapPin, Eye, User, LogIn, Plus, LayoutDashboard, ExternalLink, type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias } from '@/lib/categorias'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { getAvatarUrl } from '@/lib/avatar'
import { loadProductCards, type ProductCard } from '../inicio/sections/ProductShowcase'
import { fetchOpenBoardItems, askedAgo, shortAddress, type BoardItem } from '@/lib/serviceBoard'
import { getRequestTitle } from '@/lib/serviceTypes'
import { fetchCommunitiesActivity, type CommunityActivity } from '@/lib/communityActivity'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import SearchResultsSection from '../inicio/SearchResultsSection'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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
interface StoreItem { id: string; name: string; slug: string; logo: string | null; category: string | null; rating: number | null; open: boolean }
interface ServiceItem { id: string; title: string; href: string; image: string | null; provider: string; price: number | null }
interface PersonItem { id: string; slug: string; avatar: string | null; points: number }
interface MyStore { id: string; name: string; slug: string; logo: string | null; open: boolean; active: boolean; pending: number }
interface CommunityItem { id: string; slug: string; name: string; city: string; members: number; image: string | null; activity: CommunityActivity | null }

const toPublicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ---------- peças visuais ----------
function SectionHeader({ type, title, subtitle, onSeeAll, colors }: { type: TypeKey; title: string; subtitle: string; onSeeAll?: () => void; colors: any }) {
    const t = TYPE[type]
    const Icon = t.icon
    return (
        <div className="flex items-center gap-3 mb-3">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${t.color}1f`, color: t.color }}>
                <Icon size={22} />
            </span>
            <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{subtitle}</p>
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
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {children}
        </div>
    )
}

function Tile({ type, onClick, image, fallback, children, colors, round = false }: {
    type: TypeKey; onClick: () => void; image?: string | null; fallback: ReactNode; children: ReactNode; colors: any; round?: boolean
}) {
    const t = TYPE[type]
    return (
        <button
            onClick={onClick}
            className="snap-start flex-shrink-0 w-[168px] sm:w-[188px] text-left rounded-3xl overflow-hidden border flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* Foto (mesma altura em todos), com o rótulo do tipo por cima */}
            <span className="relative block w-full h-[116px] sm:h-[128px] overflow-hidden flex-shrink-0" style={{ background: `${t.color}22` }}>
                {image ? (
                    <img src={image} alt="" className={`w-full h-full ${round ? 'object-contain p-3' : 'object-cover'}`} loading="lazy" />
                ) : (
                    <span className="w-full h-full flex items-center justify-center" style={{ color: t.color }}>{fallback}</span>
                )}
                <span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: t.color }}>
                    {t.label}
                </span>
            </span>
            <span className="block p-3 flex-1">{children}</span>
        </button>
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

    const [stores, setStores] = useState<StoreItem[] | null>(null)
    const [products, setProducts] = useState<ProductCard[] | null>(null)
    const [services, setServices] = useState<ServiceItem[] | null>(null)
    const [requests, setRequests] = useState<BoardItem[] | null>(null)
    const [people, setPeople] = useState<PersonItem[] | null>(null)
    const [communities, setCommunities] = useState<CommunityItem[] | null>(null)
    // "Meu espaço": minhas lojas (só quem está logado)
    const [myStores, setMyStores] = useState<MyStore[] | null>(null)

    useEffect(() => {
        let cancelled = false
        const safe = <T,>(fn: () => Promise<T>, set: (v: T) => void, empty: T) =>
            fn().then((v) => { if (!cancelled) set(v) }).catch(() => { if (!cancelled) set(empty) })

        safe(async () => {
            const { data } = await supabase
                .from('stores')
                .select('id, name, "storeSlug", logo_url, category, ratings_avg, business_hours, view_count')
                .eq('is_active', true)
                .order('view_count', { ascending: false })
                .limit(10)
            return (data || []).map((s: any) => ({
                id: s.id, name: s.name, slug: s.storeSlug,
                logo: toPublicImage('store-logos', s.logo_url),
                category: s.category || null,
                rating: s.ratings_avg ? Number(s.ratings_avg) : null,
                open: isStoreOpenNow(s.business_hours as BusinessHours | null),
            })) as StoreItem[]
        }, setStores, [])

        safe(async () => (await loadProductCards()).slice(0, 10), setProducts, [])

        safe(async () => {
            const { data: rows } = await supabase
                .from('products')
                .select('id, name, slug, image_url, price, owner_id, store_id, view_count')
                .eq('listing_type', 'service_offer')
                .eq('is_active', true)
                .order('view_count', { ascending: false })
                .limit(10)
            const list = rows || []
            const ownerIds = [...new Set(list.filter((r: any) => !r.store_id && r.owner_id).map((r: any) => r.owner_id))]
            const storeIds = [...new Set(list.filter((r: any) => r.store_id).map((r: any) => r.store_id))]
            const [{ data: profs }, { data: sts }] = await Promise.all([
                ownerIds.length ? supabase.from('profiles').select('id, "profileSlug"').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
                storeIds.length ? supabase.from('stores').select('id, name, "storeSlug"').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
            ])
            const profMap = new Map((profs || []).map((p: any) => [p.id, p.profileSlug]))
            const storeMap = new Map((sts || []).map((s: any) => [s.id, s]))
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
                .map((r) => {
                    const p: any = byId.get(r.id)
                    return p?.profileSlug ? { id: r.id, slug: p.profileSlug, avatar: getAvatarUrl(supabase, p.avatar_url) || null, points: Number(r.points) || 0 } : null
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
            return list
                .map((c: any) => ({
                    id: c.id, slug: c.slug, name: c.name, city: c.city,
                    members: counts.get(c.id) || 0, image: c.image_url || null, activity: act[c.id] || null,
                }))
                .sort((a: CommunityItem, b: CommunityItem) => (b.activity?.activityAt || 0) - (a.activity?.activityAt || 0)) as CommunityItem[]
        }, setCommunities, [])

        return () => { cancelled = true }
    }, [])

    // Minhas lojas + quantos pedidos novos cada uma tem
    useEffect(() => {
        if (!userId) { setMyStores(null); return }
        let cancelled = false
        ;(async () => {
            const { data } = await supabase
                .from('stores')
                .select('id, name, "storeSlug", logo_url, business_hours, is_active')
                .eq('owner_id', userId)
                .order('created_at', { ascending: true })
            const list = data || []
            let pending = new Map<string, number>()
            if (list.length > 0) {
                const { data: orders } = await supabase
                    .from('orders')
                    .select('store_id')
                    .in('store_id', list.map((s: any) => s.id))
                    .eq('status', 'pending')
                ;(orders || []).forEach((o: any) => pending.set(o.store_id, (pending.get(o.store_id) || 0) + 1))
            }
            if (cancelled) return
            setMyStores(list.map((s: any) => ({
                id: s.id, name: s.name, slug: s.storeSlug,
                logo: toPublicImage('store-logos', s.logo_url),
                open: isStoreOpenNow(s.business_hours as BusinessHours | null),
                active: s.is_active !== false,
                pending: pending.get(s.id) || 0,
            })))
        })().catch(() => { if (!cancelled) setMyStores([]) })
        return () => { cancelled = true }
    }, [userId])

    const go = (path: string) => router.push(path)

    const actions = useMemo(() => ([
        { type: 'loja' as TypeKey, title: 'Comprar', desc: 'Lojas e produtos perto de você', icon: ShoppingBag, color: TYPE.loja.color, href: '/lojas' },
        { type: 'pedido' as TypeKey, title: 'Pedir motorista', desc: 'Corrida rápida, preço combinado', icon: Car, color: '#ea580c', href: '/pedir-motorista' },
        { type: 'servico' as TypeKey, title: 'Contratar serviço', desc: 'Descreva e receba propostas', icon: Wrench, color: TYPE.servico.color, href: '/solicitar-servico' },
        { type: 'comunidade' as TypeKey, title: 'Oferecer meu serviço', desc: 'Divulgue e seja encontrado', icon: Megaphone, color: '#16a34a', href: profileSlug ? '/meus-servicos' : '/login' },
    ]), [profileSlug])

    const searching = query.trim().length > 0

    return (
        <div className="min-h-dvh pb-24" style={{ background: colors.background }}>
            <div className="max-w-5xl mx-auto px-4 pt-4">
                {/* ===== TOPO: quem sou eu + busca ===== */}
                <header className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0" style={{ background: GRADIENT }}>i</span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{userId ? 'Bem-vindo de volta' : 'Bem-vindo ao iUser'}</p>
                        <p className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{profileSlug ? `@${profileSlug}` : 'Visitante'}</p>
                    </div>
                    {userId ? (
                        <button onClick={() => go(profileSlug ? `/${profileSlug}` : '/')} aria-label="Meu perfil" className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}60` }}>
                            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <User size={18} style={{ color: colors.textSecondary }} />}
                        </button>
                    ) : (
                        <button onClick={() => go('/login')} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black text-white flex-shrink-0" style={{ background: GRADIENT }}>
                            <LogIn size={15} /> Entrar
                        </button>
                    )}
                </header>

                <div className="relative mt-4">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="O que você procura? Lojas, serviços, pessoas..."
                        className="w-full rounded-full py-3.5 pl-11 pr-4 text-sm focus:outline-none"
                        style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary, boxShadow: colors.shadow }}
                    />
                </div>

                {searching ? (
                    <div className="mt-6"><SearchResultsSection searchQuery={query} /></div>
                ) : (
                    <>
                        {/* ===== MEU ESPAÇO: meu perfil e minhas lojas (só logado) ===== */}
                        {userId && (
                            <section className="mt-7">
                                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>Meu espaço</h2>
                                <p className="text-xs mt-0.5 mb-3" style={{ color: colors.textSecondary }}>Seu perfil e as lojas que você criou.</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Meu perfil */}
                                    <div className="rounded-3xl border p-4 flex flex-col gap-3" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                                        <div className="flex items-center gap-3">
                                            <PlanAvatarRing userId={userId} width={3} linkToProfile={false}>
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
                                                ) : (
                                                    <span className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-black" style={{ background: GRADIENT }}>
                                                        {(profileSlug || '?').charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </PlanAvatarRing>
                                            <div className="min-w-0 flex-1">
                                                <span className="inline-block text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: TYPE.pessoa.color }}>Meu perfil</span>
                                                <p className="text-base font-black truncate mt-0.5" style={{ color: colors.textPrimary }}>@{profileSlug || '...'}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => profileSlug && go(`/${profileSlug}`)}
                                                className="flex-1 py-2.5 rounded-full text-sm font-black text-white flex items-center justify-center gap-1.5"
                                                style={{ background: GRADIENT }}
                                            >
                                                <ExternalLink size={14} /> Ver meu perfil
                                            </button>
                                            <button
                                                onClick={() => go('/?view=perfil')}
                                                className="flex-1 py-2.5 rounded-full text-sm font-black flex items-center justify-center gap-1.5 border-2"
                                                style={{ color: TYPE.pessoa.color, borderColor: TYPE.pessoa.color }}
                                            >
                                                <LayoutDashboard size={14} /> Meu painel
                                            </button>
                                        </div>
                                    </div>

                                    {/* Minhas lojas */}
                                    <div className="rounded-3xl border p-4 flex flex-col gap-3" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                                        <div className="flex items-center justify-between">
                                            <span className="inline-block text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: TYPE.loja.color }}>
                                                {myStores && myStores.length > 1 ? 'Minhas lojas' : 'Minha loja'}
                                            </span>
                                            <button onClick={() => go('/criar-loja')} className="flex items-center gap-1 text-xs font-black" style={{ color: TYPE.loja.color }}>
                                                <Plus size={14} /> Nova loja
                                            </button>
                                        </div>

                                        {myStores === null ? (
                                            <div className="h-16 rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />
                                        ) : myStores.length === 0 ? (
                                            <div className="flex items-center gap-3">
                                                <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${TYPE.loja.color}1f`, color: TYPE.loja.color }}>
                                                    <StoreIcon size={26} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Você ainda não tem loja</p>
                                                    <p className="text-xs" style={{ color: colors.textSecondary }}>Crie grátis e venda para quem está perto.</p>
                                                </div>
                                                <button onClick={() => go('/criar-loja')} className="px-4 py-2 rounded-full text-xs font-black text-white flex-shrink-0" style={{ background: TYPE.loja.color }}>
                                                    Criar loja
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {myStores.map((st) => (
                                                    <div key={st.id} className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `${TYPE.loja.color}1f`, color: TYPE.loja.color }}>
                                                                {st.logo ? <img src={st.logo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={26} />}
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-base font-black truncate" style={{ color: colors.textPrimary }}>{st.name}</p>
                                                                <p className="flex items-center gap-2 text-[11px] font-bold">
                                                                    <span className="flex items-center gap-1" style={{ color: st.active ? (st.open ? '#16a34a' : '#dc2626') : colors.textSecondary }}>
                                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.active ? (st.open ? '#16a34a' : '#dc2626') : colors.textSecondary }} />
                                                                        {!st.active ? 'Desativada' : st.open ? 'Aberta agora' : 'Fechada agora'}
                                                                    </span>
                                                                    {st.pending > 0 && (
                                                                        <span className="px-2 py-0.5 rounded-full text-white" style={{ background: '#ea580c' }}>
                                                                            {st.pending} {st.pending === 1 ? 'pedido novo' : 'pedidos novos'}
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => go(`/${st.slug}`)}
                                                                className="flex-1 py-2.5 rounded-full text-sm font-black text-white flex items-center justify-center gap-1.5"
                                                                style={{ background: TYPE.loja.color }}
                                                            >
                                                                <ExternalLink size={14} /> Ver loja
                                                            </button>
                                                            <button
                                                                onClick={() => go(`/?view=loja&store=${encodeURIComponent(st.slug)}`)}
                                                                className="flex-1 py-2.5 rounded-full text-sm font-black flex items-center justify-center gap-1.5 border-2"
                                                                style={{ color: TYPE.loja.color, borderColor: TYPE.loja.color }}
                                                            >
                                                                <LayoutDashboard size={14} /> Painel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Visitante: o mesmo lugar, convidando a entrar (é onde ficam o perfil e as lojas depois do login) */}
                        {!userId && (
                            <section className="mt-7">
                                <div className="rounded-3xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${TYPE.pessoa.color}1f`, color: TYPE.pessoa.color }}>
                                        <User size={24} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-black" style={{ color: colors.textPrimary }}>Meu espaço</p>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>Entre para ver o seu perfil e as lojas que você criou — ou crie a sua agora.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => go('/login')} className="px-4 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                                        <button onClick={() => go('/criar-loja')} className="px-4 py-2.5 rounded-full text-sm font-black border-2" style={{ color: TYPE.loja.color, borderColor: TYPE.loja.color }}>Criar loja</button>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* ===== 1. O QUE VOCÊ QUER FAZER? ===== */}
                        <section className="mt-7">
                            <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>O que você quer fazer?</h2>
                            <p className="text-xs mt-0.5 mb-3" style={{ color: colors.textSecondary }}>Escolha um caminho. É só tocar.</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {actions.map((a) => {
                                    const Icon = a.icon
                                    return (
                                        <button
                                            key={a.title}
                                            onClick={() => go(a.href)}
                                            className="text-left rounded-3xl p-4 border flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                                        >
                                            <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${a.color}1f`, color: a.color }}>
                                                <Icon size={24} />
                                            </span>
                                            <span>
                                                <span className="block text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.title}</span>
                                                <span className="block text-xs mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>{a.desc}</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        {/* ===== 2. CATEGORIAS ===== */}
                        <section className="mt-8">
                            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Explore por categoria</h2>
                            <div className="grid grid-cols-4 md:grid-cols-8 gap-x-2 gap-y-4 mt-3">
                                {categorias.filter((c) => c.slug !== 'comunidades').map((c) => {
                                    const Icon = c.icone
                                    return (
                                        <button
                                            key={c.slug}
                                            onClick={() => go(c.slug === 'social' ? '/social' : `/lojas/${c.slug}`)}
                                            className="flex flex-col items-center gap-1.5 text-center transition hover:scale-105 active:scale-95"
                                        >
                                            <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${c.color}1f`, color: c.color }}>
                                                <Icon size={26} />
                                            </span>
                                            <span className="text-[11px] font-bold leading-tight" style={{ color: colors.textPrimary }}>{c.nome}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        {/* ===== 3. VITRINES — uma por tipo, cada uma com a sua cor ===== */}
                        <section className="mt-9">
                            <SectionHeader type="loja" title="Lojas para conhecer" subtitle="As mais visitadas da plataforma" onSeeAll={() => go('/lojas')} colors={colors} />
                            {stores === null ? <Skeleton colors={colors} /> : stores.length === 0 ? null : (
                                <Strip>
                                    {stores.map((s) => (
                                        <Tile key={s.id} type="loja" colors={colors} image={s.logo} round fallback={<StoreIcon size={36} />} onClick={() => go(`/${s.slug}`)}>
                                            <span className="block text-sm font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{s.name}</span>
                                            {s.category && <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{s.category}</span>}
                                            <span className="flex items-center gap-2 mt-2 text-[11px] font-bold">
                                                <span className="flex items-center gap-1" style={{ color: s.open ? '#16a34a' : '#dc2626' }}>
                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.open ? '#16a34a' : '#dc2626' }} />
                                                    {s.open ? 'Aberto' : 'Fechado'}
                                                </span>
                                                {s.rating != null && (
                                                    <span className="flex items-center gap-0.5" style={{ color: colors.textPrimary }}>
                                                        <Star size={11} className="text-yellow-400 fill-yellow-400" />{s.rating.toFixed(1)}
                                                    </span>
                                                )}
                                            </span>
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="produto" title="Produtos em destaque" subtitle="Itens das lojas, prontos pra comprar" onSeeAll={() => go('/produtos')} colors={colors} />
                            {products === null ? <Skeleton colors={colors} /> : products.length === 0 ? null : (
                                <Strip>
                                    {products.map((p) => (
                                        <Tile key={p.id} type="produto" colors={colors} image={p.imageUrl} fallback={<ShoppingBag size={36} />} onClick={() => go(p.storeSlug && p.storeSlug !== '#' && p.slug ? `/${p.storeSlug}/${p.slug}` : `/${p.profileSlug || p.storeSlug}/${p.slug || p.id}`)}>
                                            <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</span>
                                            {money(p.price) && <span className="block text-sm font-black mt-1" style={{ color: TYPE.produto.color }}>{money(p.price)}</span>}
                                            <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{p.storeName}</span>
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="servico" title="Serviços para contratar" subtitle="Profissionais e lojas prontos pra te atender" onSeeAll={() => go('/produtos')} colors={colors} />
                            {services === null ? <Skeleton colors={colors} /> : services.length === 0 ? null : (
                                <Strip>
                                    {services.map((s) => (
                                        <Tile key={s.id} type="servico" colors={colors} image={s.image} fallback={<Wrench size={36} />} onClick={() => go(s.href)}>
                                            <span className="block text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{s.title}</span>
                                            {money(s.price) && <span className="block text-sm font-black mt-1" style={{ color: TYPE.servico.color }}>{money(s.price)}</span>}
                                            <span className="block text-[11px] truncate mt-0.5" style={{ color: colors.textSecondary }}>{s.provider}</span>
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="pedido" title="Quem está procurando serviço" subtitle="Pedidos abertos — você pode atender" onSeeAll={() => go('/procurar-servico')} colors={colors} />
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
                                        </Tile>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="pessoa" title="Pessoas para seguir" subtitle="Os perfis com mais pontos do iUser" onSeeAll={() => go('/social')} colors={colors} />
                            {people === null ? <Skeleton colors={colors} /> : people.length === 0 ? null : (
                                <Strip>
                                    {people.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => go(`/${p.slug}`)}
                                            className="snap-start flex-shrink-0 w-[132px] sm:w-[148px] rounded-3xl border p-3 flex flex-col items-center gap-2 text-center transition hover:-translate-y-0.5 hover:shadow-xl"
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
                                            <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: TYPE.pessoa.color }}>Pessoa</span>
                                            <span className="block w-full text-sm font-black truncate" style={{ color: colors.textPrimary }}>@{p.slug}</span>
                                            <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>⭐ {p.points} pts</span>
                                        </button>
                                    ))}
                                </Strip>
                            )}
                        </section>

                        <section className="mt-8">
                            <SectionHeader type="comunidade" title="Comunidades" subtitle="Converse com quem é da sua cidade, estado e país" onSeeAll={() => go('/comunidade')} colors={colors} />
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
                        <section className="mt-10 rounded-3xl p-5 text-white flex flex-col md:flex-row md:items-center gap-4" style={{ background: GRADIENT, boxShadow: '0 12px 32px #f9731640' }}>
                            <div className="flex-1">
                                <h2 className="text-xl font-black leading-tight">Tem uma loja ou um serviço?</h2>
                                <p className="text-sm opacity-90 mt-1">Cadastre grátis e seja encontrado por quem está perto de você.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => go('/criar-loja')} className="flex-1 md:flex-none px-5 py-3 rounded-full text-sm font-black bg-white" style={{ color: '#dc2626' }}>Criar minha loja</button>
                                <button onClick={() => go(profileSlug ? '/meus-servicos' : '/login')} className="flex-1 md:flex-none px-5 py-3 rounded-full text-sm font-black border-2 border-white text-white">Oferecer serviço</button>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    )
}
