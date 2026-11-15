// src/versions/shared/screens/LojasScreen.tsx
//
// /lojas — UMA tela só para as duas versões (a moldura muda, a lógica não): o Outdoor de lojas, o filtro padrão de uma linha (`ListFilters`: categoria, ordenação e
// "Abertas", igual a /produtos e /servicos-disponiveis) e a grade de cartões de imagem (`StoreImageCard`). A categoria vai no endereço (?categoria=alimentacao), então o link
// é compartilhável. Dados: `fetchStoreCards` (UMA consulta para todas as lojas; a página antiga fazia duas consultas por loja, 200 lojas = 400 consultas).
//   ui = 'v3': dentro da casca, com a linha "voltar + busca" no topo (a casca já tem navbar).   ui = 'v2': cabeçalho do app com a busca e o fundo animado.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, Eye, Plus, Search, ShoppingBag, Star, Store as StoreIcon, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias, resolveCategoria } from '@/lib/categorias'
import { fetchStoreCards, type StoreCardData } from '@/lib/storeCards'
import StoreImageCard from '@/components/StoreImageCard'
import ListFilters, { type SortOption } from '@/components/ListFilters'
import Outdoor from '@/components/outdoor/Outdoor'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE = 24

type Sort = 'vistos' | 'comprados' | 'recentes' | 'avaliadas'

const SORTS: SortOption[] = [
    { id: 'vistos', label: 'Mais vistas', short: 'Vistas', icon: Eye },
    { id: 'comprados', label: 'Mais compradas', short: 'Compradas', icon: ShoppingBag },
    { id: 'recentes', label: 'Recentes', short: 'Recentes', icon: Clock },
    { id: 'avaliadas', label: 'Melhores avaliadas', short: 'Melhores', icon: Star },
]

const catList = categorias.filter((c) => c.slug !== 'comunidades' && c.slug !== 'social')
const catName = (slug: string) => (slug === 'transporte' ? 'Frete' : catList.find((c) => c.slug === slug)?.nome || slug)

export default function LojasScreen({ ui }: { ui: 'v2' | 'v3' }) {
    const v3 = ui === 'v3'
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [items, setItems] = useState<StoreCardData[] | null>(null)
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string>('todas')
    const [sort, setSort] = useState<Sort>('vistos')
    // Começa em "Todas" + "Abertas": mostra tudo o que está aberto agora (a vazia oferece mostrar as fechadas também)
    const [onlyOpen, setOnlyOpen] = useState(true)
    const [limit, setLimit] = useState(PAGE)

    // categoria vinda do endereço (?categoria=alimentacao)
    useEffect(() => {
        try {
            const c = new URLSearchParams(window.location.search).get('categoria')
            if (c && catList.some((x) => x.slug === c)) setCategory(c)
        } catch { /* sem window */ }
    }, [])
    const pickCategory = (slug: string) => {
        setCategory(slug)
        setLimit(PAGE)
        try {
            const url = new URL(window.location.href)
            if (slug === 'todas') url.searchParams.delete('categoria'); else url.searchParams.set('categoria', slug)
            window.history.replaceState(null, '', url.toString())
        } catch { /* ignora */ }
    }

    // Onde a pessoa está (endereço salvo no perfil): serve para o valor da entrega e o tempo estimado de cada loja
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
    const [meLoaded, setMeLoaded] = useState(false)
    useEffect(() => {
        if (profileLoading) return
        if (!userId) { setMeLoaded(true); return }
        let cancelled = false
        supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
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

    // quantas lojas cada categoria tem (as que têm vêm primeiro no seletor)
    const countBySlug = useMemo(() => {
        const m: Record<string, number> = {}
        for (const it of items || []) if (it.categorySlug) m[it.categorySlug] = (m[it.categorySlug] || 0) + 1
        return m
    }, [items])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/^@/, '')
        const list = (items || []).filter((s) => {
            if (category !== 'todas' && s.categorySlug !== category) return false
            if (onlyOpen && !s.open) return false
            if (q) {
                const hay = `${s.name} ${resolveCategoria(s.category)?.nome || s.category || ''}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
        const byViews = (a: StoreCardData, b: StoreCardData) => b.views - a.views
        const sorters: Record<Sort, (a: StoreCardData, b: StoreCardData) => number> = {
            vistos: byViews,
            comprados: (a, b) => b.orders - a.orders || byViews(a, b),
            recentes: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            avaliadas: (a, b) => (b.rating || 0) - (a.rating || 0) || b.ratingsCount - a.ratingsCount || byViews(a, b),
        }
        return [...list].sort(sorters[sort])
    }, [items, query, category, onlyOpen, sort])

    const createHere = () => {
        const target = `/criar-loja${category !== 'todas' ? `?categoria=${category}` : ''}`
        router.push(userId ? target : `/login?redirect=${encodeURIComponent(target)}`)
    }
    const noStoresInCategory = category !== 'todas' && !countBySlug[category]

    const body = (
        <>
            {/* Outdoor Lojas: as lojas mais bem pontuadas (some com o texto da busca, para não competir com o resultado) */}
            {!query.trim() && <Outdoor kind="lojas" className="mb-2" />}

            <div className="mb-3">
                <ListFilters
                    sorts={SORTS} sort={sort} onSort={(id) => { setSort(id as Sort); setLimit(PAGE) }}
                    counts={countBySlug} category={category} onCategory={pickCategory}
                    toggle={{ label: 'Abertas', active: onlyOpen, onToggle: () => { setOnlyOpen((v) => !v); setLimit(PAGE) } }}
                />
            </div>

            {items === null ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-[270px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                    <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><StoreIcon size={26} /></span>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                        {noStoresInCategory
                            ? `Ainda não há loja em ${catName(category)}`
                            : onlyOpen && (items || []).some((s) => category === 'todas' || s.categorySlug === category)
                                ? 'Nenhuma loja aberta agora'
                                : 'Nenhuma loja com esses filtros'}
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        {noStoresInCategory ? 'Que tal ser a primeira?' : onlyOpen ? 'Veja também as que estão fechadas.' : 'Tente outra categoria ou limpe os filtros.'}
                    </p>
                    {noStoresInCategory ? (
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
                    <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                        {filtered.length} {filtered.length === 1 ? 'loja' : 'lojas'}{query.trim() ? ` para “${query.trim()}”` : ''}
                    </p>
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
        </>
    )

    if (v3) {
        return (
            <div className="pb-6">
                {/* Voltar + busca na mesma linha, no mesmo estilo (cápsulas cinza-claras) */}
                <div className="flex items-center gap-2 mb-4">
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
                        {query && <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                    </div>
                </div>
                {body}
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>
            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Lojas"
                    showBack
                    onBack={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push('/'))}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch
                    searchPlaceholder="Buscar loja ou categoria"
                    searchValue={query}
                    onSearch={(v: string) => { setQuery(v); setLimit(PAGE) }}
                />
                <section className="px-4 md:px-6 mt-3 pb-24">{body}</section>
            </main>
        </div>
    )
}
