// src/versions/v3/screens/LojasScreen.tsx
//
// /lojas na interface 3.0: um seletor de categorias que já está em todas as lojas (sem trocar de página), ordenação
// (mais vistas, mais compradas, recentes, melhores avaliadas), "abertas agora" e busca — no mesmo estilo limpo da home.
// A 2.0 segue com a página antiga (lojas-em-destaque).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronDown, Clock, Eye, LayoutGrid, Plus, Scissors, Search, ShoppingBag, Star, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria } from '@/lib/categorias'
import StoreImageCard from '@/components/StoreImageCard'
import { fetchStoreCards, type StoreCardData } from '@/lib/storeCards'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE = 24

type Sort = 'vistos' | 'comprados' | 'recentes' | 'avaliadas'
type Item = StoreCardData

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
    const { userId, loading: profileLoading } = useProfile()
    const [items, setItems] = useState<StoreCardData[] | null>(null)
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

    // Onde a pessoa está (endereço salvo no perfil): serve pro valor da entrega e o tempo estimado de cada loja
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
    const [meLoaded, setMeLoaded] = useState(false)
    useEffect(() => {
        if (profileLoading) return
        if (!userId) { setMeLoaded(true); return }
        let cancelled = false
        supabase.from('profiles').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
            if (cancelled) return
            const d = data as { store_lat: number | null; store_lng: number | null } | null
            if (d?.store_lat != null && d?.store_lng != null) setMe({ lat: Number(d.store_lat), lng: Number(d.store_lng) })
            setMeLoaded(true)
        })
        return () => { cancelled = true }
    }, [userId, profileLoading])

    useEffect(() => {
        if (!meLoaded) return
        let cancelled = false
        fetchStoreCards({ me }).then((list) => { if (!cancelled) setItems(list) }).catch(() => { if (!cancelled) setItems([]) })
        return () => { cancelled = true }
    }, [meLoaded, me])

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
                const hay = `${s.name} ${resolveCategoria(s.category)?.nome || s.category || ''}`.toLowerCase()
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
            {/* Voltar + busca na mesma linha, no mesmo estilo (cápsulas cinza-claras) */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push('/'))}
                    aria-label="Voltar"
                    className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95"
                    style={{ width: 46, height: 46, background: `${colors.border}40`, color: colors.textPrimary }}
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: `${colors.border}40` }}>
                    <Search size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                    <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
                        placeholder="Buscar loja ou categoria"
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                        style={{ color: colors.textPrimary }}
                    />
                    {query && (
                        <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>
                    )}
                </div>
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
                        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[270px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
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
                                <StoreImageCard key={s.id} s={s} fluid onClick={() => router.push(`/${s.slug}`)} />
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
