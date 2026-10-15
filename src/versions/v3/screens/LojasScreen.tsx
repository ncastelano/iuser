// src/versions/v3/screens/LojasScreen.tsx
//
// /lojas na interface 3.0: um seletor de categorias que já está em todas as lojas (sem trocar de página), ordenação
// (mais vistas, mais compradas, recentes, melhores avaliadas), "abertas agora" e busca — no mesmo estilo limpo da home.
// A 2.0 segue com a página antiga (lojas-em-destaque).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Clock, Eye, LayoutGrid, Plus, Scissors, Search, ShoppingBag, Star, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria } from '@/lib/categorias'
import { getAvatarUrl } from '@/lib/avatar'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import StoreImageCard, { type StoreCardItem } from '@/components/StoreImageCard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE = 24

type Sort = 'vistos' | 'comprados' | 'recentes' | 'avaliadas'
interface Item extends StoreCardItem { views: number; orders: number; ratingsCount: number; createdAt: string; categorySlug: string | null }

const SORTS: { id: Sort; label: string; short: string; icon: typeof Eye }[] = [
    { id: 'vistos', label: 'Mais vistas', short: 'Vistas', icon: Eye },
    { id: 'comprados', label: 'Mais compradas', short: 'Compradas', icon: ShoppingBag },
    { id: 'recentes', label: 'Recentes', short: 'Recentes', icon: Clock },
    { id: 'avaliadas', label: 'Melhores avaliadas', short: 'Melhores', icon: Star },
]

const catList = categorias.filter((c) => c.slug !== 'comunidades' && c.slug !== 'social')
const catName = (slug: string) => (slug === 'transporte' ? 'Frete' : catList.find((c) => c.slug === slug)?.nome || slug)

export default function LojasScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [items, setItems] = useState<Item[] | null>(null)
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string>('todas')
    const [sort, setSort] = useState<Sort>('vistos')
    // Começa em "Todas" + "Abertas agora": mostra tudo o que está aberto
    const [onlyOpen, setOnlyOpen] = useState(true)
    const [menu, setMenu] = useState<'cat' | 'sort' | null>(null)
    const [limit, setLimit] = useState(PAGE)

    // categoria vinda do endereço (?categoria=alimentacao) — o link é compartilhável
    useEffect(() => {
        try {
            const c = new URLSearchParams(window.location.search).get('categoria')
            if (c && catList.some((x) => x.slug === c)) setCategory(c)
        } catch { /* sem window */ }
    }, [])
    const pickCategory = (slug: string) => {
        setCategory(slug)
        setLimit(PAGE)
        setMenu(null)
        try {
            const url = new URL(window.location.href)
            if (slug === 'todas') url.searchParams.delete('categoria'); else url.searchParams.set('categoria', slug)
            window.history.replaceState(null, '', url.toString())
        } catch { /* ignora */ }
    }

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const { data } = await supabase
                .from('stores')
                .select('id, name, "storeSlug", logo_url, category, ratings_avg, ratings_count, view_count, business_hours, created_at, owner_id')
                .eq('is_active', true)
                .limit(400)
            const rows = (data || []) as any[]
            const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean)))
            const [{ data: owners }, { data: counts }] = await Promise.all([
                ownerIds.length ? supabase.from('profiles').select('id, "profileSlug", avatar_url').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
                supabase.rpc('get_store_order_counts'),
            ])
            const ownerById = new Map((owners || []).map((o: any) => [o.id, o]))
            const ordersById = new Map(((counts as { store_id: string; orders_count: number }[]) || []).map((c) => [c.store_id, Number(c.orders_count) || 0]))
            const list: Item[] = rows.map((s) => {
                const o = ownerById.get(s.owner_id) as any
                const logo = s.logo_url ? (s.logo_url.startsWith('http') ? s.logo_url : supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl) : null
                return {
                    id: s.id, name: s.name, slug: s.storeSlug, logo,
                    category: s.category || null,
                    categorySlug: resolveCategoria(s.category)?.slug || null,
                    rating: s.ratings_avg ? Number(s.ratings_avg) : null,
                    ratingsCount: Number(s.ratings_count) || 0,
                    open: isStoreOpenNow(s.business_hours as BusinessHours | null),
                    ownerSlug: o?.profileSlug || null,
                    ownerAvatar: getAvatarUrl(supabase, o?.avatar_url) || null,
                    views: Number(s.view_count) || 0,
                    orders: ordersById.get(s.id) || 0,
                    createdAt: s.created_at,
                }
            })
            if (!cancelled) setItems(list)
        })().catch(() => { if (!cancelled) setItems([]) })
        return () => { cancelled = true }
    }, [])

    // quantas lojas cada categoria tem: as com loja vêm primeiro no seletor
    const countBySlug = useMemo(() => {
        const m: Record<string, number> = {}
        for (const it of items || []) if (it.categorySlug) m[it.categorySlug] = (m[it.categorySlug] || 0) + 1
        return m
    }, [items])
    const orderedCats = useMemo(
        () => [...catList].sort((a, b) => (countBySlug[b.slug] || 0) - (countBySlug[a.slug] || 0)),
        [countBySlug],
    )

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/^@/, '')
        let list = (items || []).filter((s) => {
            if (category !== 'todas' && s.categorySlug !== category) return false
            if (onlyOpen && !s.open) return false
            if (q) {
                const hay = `${s.name} ${s.ownerSlug || ''} ${resolveCategoria(s.category)?.nome || s.category || ''}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
        const byViews = (a: Item, b: Item) => b.views - a.views
        const sorters: Record<Sort, (a: Item, b: Item) => number> = {
            vistos: byViews,
            comprados: (a, b) => b.orders - a.orders || byViews(a, b),
            recentes: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            avaliadas: (a, b) => (b.rating || 0) - (a.rating || 0) || b.ratingsCount - a.ratingsCount || byViews(a, b),
        }
        list = [...list].sort(sorters[sort])
        return list
    }, [items, query, category, onlyOpen, sort])

    const metaOf = (s: Item): string | null => {
        if (sort === 'vistos') return `${s.views} ${s.views === 1 ? 'visita' : 'visitas'}`
        if (sort === 'comprados') return `${s.orders} ${s.orders === 1 ? 'pedido' : 'pedidos'}`
        if (sort === 'recentes') return formatDistanceToNow(new Date(s.createdAt), { addSuffix: true, locale: ptBR })
        return null
    }

    const createHere = () => {
        const target = `/criar-loja${category !== 'todas' ? `?categoria=${category}` : ''}`
        router.push(userId ? target : `/login?redirect=${encodeURIComponent(target)}`)
    }

    const chip = (selected: boolean, color: string) => ({
        background: selected ? color : `${color}14`,
        color: selected ? '#fff' : colors.textPrimary,
    })

    return (
        <div className="pb-6">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Lojas</h1>
                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {items === null ? 'Carregando...' : `${filtered.length} ${filtered.length === 1 ? 'loja' : 'lojas'}${onlyOpen ? (filtered.length === 1 ? ' aberta' : ' abertas') : ''}${category !== 'todas' ? ` em ${catName(category)}` : ''}`}
                    </p>
                </div>
            </div>

            {/* Busca */}
            <div className="mt-4 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: `${colors.border}40` }}>
                <Search size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
                    placeholder="Buscar loja, dono ou categoria"
                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                    style={{ color: colors.textPrimary }}
                />
                {query && (
                    <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>
                )}
            </div>

            {/* Filtros numa linha só: categoria, ordenação e "abertas agora" */}
            {(() => {
                const cur = category === 'todas' ? null : catList.find((c) => c.slug === category) || null
                const CurIcon = cur ? (cur.slug === 'servicos' ? Scissors : cur.icone) : LayoutGrid
                const curSort = SORTS.find((x) => x.id === sort)!
                const SortIcon = curSort.icon
                const pill = { background: `${colors.border}40`, color: colors.textPrimary }
                return (
                    <div className="mt-4 relative">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMenu(menu === 'cat' ? null : 'cat')}
                                aria-expanded={menu === 'cat'}
                                className="flex-1 min-w-0 h-10 pl-3 pr-2.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]"
                                style={cur ? { background: `${cur.color}1f`, color: colors.textPrimary } : pill}
                            >
                                <CurIcon size={15} className="flex-shrink-0" style={{ color: cur ? cur.color : colors.textSecondary }} />
                                <span className="truncate">{cur ? catName(cur.slug) : 'Todas'}</span>
                                <ChevronDown size={14} className="flex-shrink-0 ml-auto" style={{ color: colors.textSecondary }} />
                            </button>
                            <button
                                onClick={() => setMenu(menu === 'sort' ? null : 'sort')}
                                aria-expanded={menu === 'sort'}
                                className="flex-shrink-0 h-10 pl-3 pr-2.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]"
                                style={pill}
                            >
                                <SortIcon size={14} className="flex-shrink-0" />
                                {curSort.short}
                                <ChevronDown size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                            </button>
                            <button
                                onClick={() => { setOnlyOpen((v) => !v); setLimit(PAGE) }}
                                aria-pressed={onlyOpen}
                                className="flex-shrink-0 h-10 px-3.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-[0.98]"
                                style={onlyOpen ? { background: '#16a34a', color: '#fff' } : { background: '#16a34a1a', color: '#16a34a' }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: onlyOpen ? '#fff' : '#16a34a' }} />
                                Abertas
                            </button>
                        </div>

                        {menu && (
                            <>
                                <button aria-label="Fechar" onClick={() => setMenu(null)} className="fixed inset-0 z-30 cursor-default" />
                                <div
                                    className="absolute left-0 right-0 top-12 z-40 rounded-3xl p-2"
                                    style={{ background: colors.surface, boxShadow: '0 14px 40px rgba(0,0,0,0.18)' }}
                                >
                                    {menu === 'cat' ? (
                                        <div className="grid grid-cols-2 gap-1 max-h-[52dvh] overflow-y-auto">
                                            {[{ slug: 'todas', nome: 'Todas', color: colors.textSecondary, icone: LayoutGrid } as any, ...orderedCats].map((c) => {
                                                const Icon = c.slug === 'servicos' ? Scissors : c.icone
                                                const selected = category === c.slug
                                                const has = c.slug === 'todas' || (countBySlug[c.slug] || 0) > 0
                                                return (
                                                    <button
                                                        key={c.slug}
                                                        onClick={() => pickCategory(c.slug)}
                                                        className="flex items-center gap-2 min-h-11 py-1 px-2.5 rounded-2xl text-left text-xs font-black transition active:scale-[0.98]"
                                                        style={{ background: selected ? `${c.color}22` : 'transparent', color: colors.textPrimary, opacity: has || selected ? 1 : 0.5 }}
                                                    >
                                                        <Icon size={16} style={{ color: c.color }} className="flex-shrink-0" />
                                                        <span className="flex-1 leading-tight">{c.slug === 'todas' ? 'Todas' : catName(c.slug)}</span>
                                                        {selected && <Check size={14} strokeWidth={3} style={{ color: c.color }} className="flex-shrink-0" />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            {SORTS.map((x) => {
                                                const Icon = x.icon
                                                const selected = sort === x.id
                                                return (
                                                    <button
                                                        key={x.id}
                                                        onClick={() => { setSort(x.id); setLimit(PAGE); setMenu(null) }}
                                                        className="flex items-center gap-2.5 h-11 px-3 rounded-2xl text-left text-sm font-black transition active:scale-[0.98]"
                                                        style={{ background: selected ? `${colors.border}50` : 'transparent', color: colors.textPrimary }}
                                                    >
                                                        <Icon size={16} className="flex-shrink-0" />
                                                        <span className="flex-1">{x.label}</span>
                                                        {selected && <Check size={15} strokeWidth={3} />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )
            })()}

            {/* Lista */}
            <div className="mt-4">
                {items === null ? (
                    <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[236px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={{ background: `${colors.border}30` }}>
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                            {category !== 'todas' && !(countBySlug[category])
                                ? `Ainda não há loja em ${catName(category)}`
                                : onlyOpen && (items || []).some((s) => category === 'todas' || s.categorySlug === category)
                                    ? 'Nenhuma loja aberta agora'
                                    : 'Nenhuma loja com esses filtros'}
                        </p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {category !== 'todas' && !(countBySlug[category]) ? 'Que tal ser a primeira?' : onlyOpen ? 'Veja também as que estão fechadas.' : 'Tente outra categoria ou limpe os filtros.'}
                        </p>
                        {category !== 'todas' && !(countBySlug[category]) ? (
                            <button onClick={createHere} className="mt-2 h-11 px-5 rounded-full text-sm font-black text-white flex items-center gap-1.5" style={{ background: GRADIENT }}>
                                <Plus size={16} strokeWidth={3} /> Cadastrar minha loja
                            </button>
                        ) : (
                            <button
                                onClick={() => { setQuery(''); setOnlyOpen(false); pickCategory('todas') }}
                                className="mt-2 h-10 px-5 rounded-full text-xs font-black" style={{ background: `${colors.border}60`, color: colors.textPrimary }}
                            >
                                {onlyOpen ? 'Mostrar também as fechadas' : 'Limpar filtros'}
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {filtered.slice(0, limit).map((s) => (
                                <StoreImageCard key={s.id} s={s} fluid meta={metaOf(s)} onClick={() => router.push(`/${s.slug}`)} />
                            ))}
                        </div>
                        {filtered.length > limit && (
                            <div className="flex justify-center mt-5">
                                <button onClick={() => setLimit((l) => l + PAGE)} className="h-11 px-6 rounded-full text-sm font-black" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>
                                    Ver mais lojas
                                </button>
                            </div>
                        )}
                        {category !== 'todas' && (
                            <button onClick={createHere} className="mt-6 w-full h-12 rounded-full text-sm font-black flex items-center justify-center gap-1.5" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                <Plus size={16} strokeWidth={3} /> Cadastrar minha loja em {catName(category)}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
