// src/versions/v3/screens/ComprarScreen.tsx
//
// /comprar na interface 3.0: a página de COMPRAS. Responde "o que eu quero comprar agora?": busca por produto ou loja,
// categorias e filtros na própria página, "pedir de novo" (do histórico de pedidos), lojas abertas, o que está em alta
// e as novidades — e a barra do carrinho pra fechar a compra. Produtos simples entram no carrinho com um toque; os
// com adicionais abrem a página do produto. A regra (busca, ranking, o que é "um toque") mora em modules/shopping.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, Clock, Flame, LayoutGrid, Package, Plus, RotateCcw, Search, ShoppingCart, Sparkles, Store as StoreIcon, Truck, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme, type ThemeColors } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { categorias } from '@/lib/categorias'
import { useCartStore, cartItemLineTotal } from '@/store/useCartStore'
import StoreImageCard from '@/components/StoreImageCard'
import { Spinner } from '@/components/Spinner'
import {
    isQuickAddable, matchesQuery, sortTrending, limitPerStore, loadShop,
    type ShopData, type ShopProduct,
} from '@/modules/shopping'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE = 24

const catList = categorias.filter((c) => c.slug !== 'comunidades' && c.slug !== 'social')
const brl = (n: number | null) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

function Section({ colors, icon: Icon, title, subtitle, onAll, children }: { colors: ThemeColors; icon: any; title: string; subtitle?: string; onAll?: () => void; children: React.ReactNode }) {
    return (
        <section className="mt-6">
            <div className="flex items-end justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-1.5 text-base font-black" style={{ color: colors.textPrimary }}><Icon size={16} style={{ color: '#f97316' }} /> {title}</h2>
                    {subtitle && <p className="text-[11px]" style={{ color: colors.textSecondary }}>{subtitle}</p>}
                </div>
                {onAll && <button onClick={onAll} className="text-xs font-black flex items-center gap-0.5 flex-shrink-0" style={{ color: colors.accent }}>Ver todas <ChevronRight size={13} /></button>}
            </div>
            {children}
        </section>
    )
}

export default function ComprarScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const soft = `${colors.border}40`

    const [data, setData] = useState<ShopData | null>(null)
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string>('todas')
    const [onlyOpen, setOnlyOpen] = useState(false)
    const [freeDelivery, setFreeDelivery] = useState(false)
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
        try {
            const url = new URL(window.location.href)
            if (slug === 'todas') url.searchParams.delete('categoria'); else url.searchParams.set('categoria', slug)
            window.history.replaceState(null, '', url.toString())
        } catch { /* ignora */ }
    }

    // Onde a pessoa está (endereço salvo no perfil): serve pro valor da entrega e o tempo de cada loja
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
    const [meLoaded, setMeLoaded] = useState(false)
    useEffect(() => {
        if (profileLoading) return
        if (!userId) { setMeLoaded(true); return }
        let cancelled = false
        supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data: d }) => {
            if (cancelled) return
            const row = d as { store_lat: number | null; store_lng: number | null } | null
            if (row?.store_lat != null && row?.store_lng != null) setMe({ lat: Number(row.store_lat), lng: Number(row.store_lng) })
            setMeLoaded(true)
        })
        return () => { cancelled = true }
    }, [userId, profileLoading])

    useEffect(() => {
        if (!meLoaded) return
        let cancelled = false
        loadShop(supabase, userId || null, me).then((d) => { if (!cancelled) setData(d) }).catch(() => { if (!cancelled) setData({ stores: [], products: [], reorder: [] }) })
        return () => { cancelled = true }
    }, [meLoaded, me, userId])

    // ----- carrinho -----
    const itemsByStore = useCartStore((st) => st.itemsByStore)
    const addItem = useCartStore((st) => st.addItem)
    const [cartReady, setCartReady] = useState(false)
    useEffect(() => setCartReady(true), [])
    const cartCount = cartReady ? Object.values(itemsByStore).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0
    const cartTotal = cartReady ? Object.values(itemsByStore).reduce((a, items) => a + items.reduce((n, i) => n + cartItemLineTotal(i), 0), 0) : 0
    const inCart = useCallback((productId: string) => {
        if (!cartReady) return 0
        let n = 0
        for (const items of Object.values(itemsByStore)) for (const i of items) if (i.product.id === productId) n += i.quantity
        return n
    }, [itemsByStore, cartReady])

    const quickAdd = (p: ShopProduct) => {
        addItem(p.storeSlug, { name: p.storeName, logo_url: p.storeLogo }, { id: p.id, name: p.name, price: p.price || 0, image_url: p.imageUrl, slug: p.slug })
        toast.success(`${p.name} no carrinho`)
    }
    const openProduct = (p: ShopProduct) => router.push(`/${p.storeSlug}/${p.slug}`)

    // ----- filtros -----
    const passes = useCallback((p: ShopProduct) => {
        if (category !== 'todas' && p.storeCategorySlug !== category) return false
        if (onlyOpen && !p.storeOpen) return false
        if (freeDelivery && !/gr[aá]tis/i.test(p.delivery || '')) return false
        return true
    }, [category, onlyOpen, freeDelivery])

    const view = useMemo(() => {
        if (!data) return null
        const q = query.trim()
        const products = data.products.filter(passes).filter((p) => !q || matchesQuery([p.name, p.storeName, p.category], q))
        const stores = data.stores.filter((s) => {
            if (category !== 'todas' && s.categorySlug !== category) return false
            if (onlyOpen && !s.open) return false
            if (freeDelivery && !/gr[aá]tis/i.test(s.delivery || '')) return false
            return !q || matchesQuery([s.name, s.category], q)
        }).sort((a, b) => Number(b.open) - Number(a.open) || b.orders - a.orders || b.views - a.views)
        return {
            products,
            stores,
            reorder: data.reorder.filter(passes),
            trending: limitPerStore(sortTrending(products), 2).slice(0, 8),
            fresh: [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
        }
    }, [data, passes, query, category, onlyOpen, freeDelivery])

    const back = () => (window.history.length > 1 ? router.back() : router.push('/'))
    const searching = query.trim().length > 0

    // categorias que têm loja primeiro
    const orderedCats = useMemo(() => {
        const n: Record<string, number> = {}
        for (const s of data?.stores || []) if (s.categorySlug) n[s.categorySlug] = (n[s.categorySlug] || 0) + 1
        return [...catList].sort((a, b) => (n[b.slug] || 0) - (n[a.slug] || 0)).filter((c) => (n[c.slug] || 0) > 0 || !data)
    }, [data])

    // ----- peças -----
    const chip = (active: boolean, color?: string) => (active
        ? { background: color || GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }
        : { background: soft, color: colors.textPrimary })

    const renderTile = (p: ShopProduct) => {
        const n = inCart(p.id)
        const quick = isQuickAddable(p)
        return (
            <div key={p.id} className="rounded-3xl overflow-hidden flex flex-col text-left" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <button onClick={() => openProduct(p)} className="relative block w-full aspect-square overflow-hidden" style={{ background: GRADIENT }}>
                    {p.imageUrl
                        ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <span className="absolute inset-0 flex items-center justify-center text-white/90"><Package size={34} /></span>}
                    {!p.storeOpen && <span className="absolute left-2 top-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ background: '#dc2626' }}>Fechada</span>}
                </button>
                <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <button onClick={() => openProduct(p)} className="text-left">
                        <span className="block text-[13px] font-black leading-snug" style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</span>
                    </button>
                    <button onClick={() => router.push(`/${p.storeSlug}`)} className="flex items-center gap-1.5 text-left min-w-0">
                        <span className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: GRADIENT }}>
                            {p.storeLogo ? <img src={p.storeLogo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={9} color="#fff" />}
                        </span>
                        <span className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{p.storeName}</span>
                    </button>
                    {(p.delivery || p.time) && (
                        <span className="flex items-center gap-1 text-[10px] truncate" style={{ color: colors.textSecondary }}>
                            {p.delivery?.toLowerCase().includes('grátis') ? <Truck size={10} className="flex-shrink-0" style={{ color: '#16a34a' }} /> : <Clock size={10} className="flex-shrink-0" />}
                            <span className="truncate">{[p.delivery, p.time].filter(Boolean).join(' · ')}</span>
                        </span>
                    )}
                    <div className="mt-auto pt-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-black" style={{ color: colors.textPrimary }}>{p.price != null ? brl(p.price) : 'Sob consulta'}</span>
                        {quick ? (
                            <button
                                onClick={() => quickAdd(p)}
                                aria-label={`Adicionar ${p.name} ao carrinho`}
                                className="relative h-9 min-w-9 px-2 rounded-full flex items-center justify-center gap-1 text-white text-xs font-black transition active:scale-90"
                                style={{ background: GRADIENT }}
                            >
                                {n > 0 ? <>{n}<Plus size={13} strokeWidth={3} /></> : <Plus size={17} strokeWidth={3} />}
                            </button>
                        ) : (
                            <button onClick={() => openProduct(p)} aria-label="Ver produto" className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: soft, color: colors.textPrimary }}>
                                <ChevronRight size={17} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    const grid = (items: ShopProduct[]) => (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{items.map((p) => renderTile(p))}</div>
    )
    const storeRow = (stores: ShopData['stores']) => (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x scroll-pl-4 scroll-pr-4 -mx-4 px-4 pb-1">
            {stores.slice(0, 12).map((s) => <StoreImageCard key={s.id} s={s} onClick={() => router.push(`/${s.slug}`)} />)}
        </div>
    )
    const productRow = (items: ShopProduct[]) => (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x scroll-pl-4 scroll-pr-4 -mx-4 px-4 pb-1">
            {items.map((p) => <div key={p.id} className="flex-shrink-0 w-40 snap-start">{renderTile(p)}</div>)}
        </div>
    )

    const empty = view && view.products.length === 0 && view.stores.length === 0

    return (
        <div className="pb-28">
            {/* Voltar + busca */}
            <div className="flex items-center gap-2">
                <button onClick={back} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: soft, color: colors.textPrimary }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: soft }}>
                    <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                    <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
                        placeholder="O que você quer comprar?"
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                        style={{ color: colors.textPrimary }}
                    />
                    {query && <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                </div>
            </div>

            {/* Filtros e categorias numa linha só (rola pro lado): "Aberto agora" e "Entrega grátis" primeiro, pra ficarem à mão */}
            <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ overflowAnchor: 'none' }}>
                <button onClick={() => setOnlyOpen((v) => !v)} className="flex-shrink-0 h-10 px-3.5 rounded-full text-[13px] font-black flex items-center gap-1.5 whitespace-nowrap transition active:scale-95" style={onlyOpen ? { background: '#16a34a', color: '#fff' } : { background: soft, color: colors.textPrimary }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: onlyOpen ? '#fff' : '#16a34a' }} /> Aberto agora
                </button>
                <button onClick={() => setFreeDelivery((v) => !v)} className="flex-shrink-0 h-10 px-3.5 rounded-full text-[13px] font-black flex items-center gap-1.5 whitespace-nowrap transition active:scale-95" style={freeDelivery ? { background: '#16a34a', color: '#fff' } : { background: soft, color: colors.textPrimary }}>
                    <Truck size={14} /> Entrega grátis
                </button>
                <span aria-hidden className="flex-shrink-0 w-px h-6" style={{ background: colors.border }} />
                <button onClick={() => pickCategory('todas')} className="flex-shrink-0 h-10 pl-3 pr-4 rounded-full flex items-center gap-1.5 text-[13px] font-black whitespace-nowrap transition active:scale-95" style={chip(category === 'todas')}>
                    <LayoutGrid size={14} /> Tudo
                </button>
                {orderedCats.map((c) => {
                    const Icon = c.icone
                    const active = category === c.slug
                    return (
                        <button key={c.slug} onClick={() => pickCategory(c.slug)} className="flex-shrink-0 h-10 pl-3 pr-4 rounded-full flex items-center gap-1.5 text-[13px] font-black whitespace-nowrap transition active:scale-95" style={chip(active, c.color)}>
                            <Icon size={14} /> {c.nome}
                        </button>
                    )
                })}
            </div>

            {/* Conteúdo */}
            {view === null ? (
                <div className="flex justify-center py-16"><Spinner size={26} color={colors.accent} /></div>
            ) : empty ? (
                <div className="mt-6 rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={{ background: soft }}>
                    <Package size={34} style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nada encontrado</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Tente outra palavra ou tire algum filtro.</p>
                    <button onClick={() => { setQuery(''); pickCategory('todas'); setOnlyOpen(false); setFreeDelivery(false) }} className="mt-1 text-xs font-black" style={{ color: colors.accent }}>Limpar tudo</button>
                </div>
            ) : searching ? (
                <>
                    {view.stores.length > 0 && (
                        <Section colors={colors} icon={StoreIcon} title={`Lojas (${view.stores.length})`}>{storeRow(view.stores)}</Section>
                    )}
                    {view.products.length > 0 && (
                        <Section colors={colors} icon={Package} title={`Produtos (${view.products.length})`}>
                            {grid(view.products.slice(0, limit))}
                            {view.products.length > limit && (
                                <button onClick={() => setLimit((l) => l + PAGE)} className="mt-3 w-full h-11 rounded-full text-sm font-black" style={{ background: soft, color: colors.textPrimary }}>Ver mais</button>
                            )}
                        </Section>
                    )}
                </>
            ) : (
                <>
                    {view.reorder.length > 0 && (
                        <Section colors={colors} icon={RotateCcw} title="Pedir de novo" subtitle="O que você já pediu">{productRow(view.reorder)}</Section>
                    )}
                    {view.stores.length > 0 && (
                        <Section colors={colors} icon={StoreIcon} title={onlyOpen ? 'Lojas abertas' : 'Lojas'} subtitle="Entrega, tempo e nota de cada uma" onAll={() => router.push(category !== 'todas' ? `/lojas?categoria=${category}` : '/lojas')}>
                            {storeRow(view.stores)}
                        </Section>
                    )}
                    {view.trending.length > 0 && (
                        <Section colors={colors} icon={Flame} title="Em alta" subtitle="O que mais sai agora">{productRow(view.trending)}</Section>
                    )}
                    {view.fresh.length > 0 && (
                        <Section colors={colors} icon={Sparkles} title="Novidades" subtitle="Chegou há pouco">{productRow(view.fresh)}</Section>
                    )}
                    {view.products.length > 0 && (
                        <Section colors={colors} icon={Package} title="Todos os produtos" subtitle={`${view.products.length} ${view.products.length === 1 ? 'produto' : 'produtos'}`}>
                            {grid(view.products.slice(0, limit))}
                            {view.products.length > limit && (
                                <button onClick={() => setLimit((l) => l + PAGE)} className="mt-3 w-full h-11 rounded-full text-sm font-black" style={{ background: soft, color: colors.textPrimary }}>Ver mais</button>
                            )}
                        </Section>
                    )}
                </>
            )}

            {/* Carrinho: aparece quando tem item */}
            {cartCount > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-6 pointer-events-none" style={{ background: `linear-gradient(to top, ${colors.background} 55%, transparent)` }}>
                    <div className="max-w-lg mx-auto pointer-events-auto">
                        <button
                            onClick={() => router.push('/carrinho')}
                            className="w-full h-14 rounded-full px-5 flex items-center gap-3 text-white font-black text-sm transition active:scale-[0.98]"
                            style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731655' }}
                        >
                            <span className="relative"><ShoppingCart size={20} /></span>
                            <span className="flex-1 text-left">Ver carrinho · {cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
                            <span>{brl(cartTotal)}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
