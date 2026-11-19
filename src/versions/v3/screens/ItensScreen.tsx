// versions/v3/screens/ItensScreen.tsx — a subaba ITENS (/atividade?aba=itens; 19/11/2026, decisão do dono): TUDO o que a pessoa já tem,
// separado por tipo — Produtos (comprados em pedidos pagos), Digitais (cursos, músicas, livros, programas liberados) e Serviços
// (agendamentos confirmados e feitos) — e o HISTÓRICO dos pedidos dentro dela. A parte aberta vai na URL (`?ver=`, modules/items).
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, ShoppingBag, PlayCircle, CalendarCheck, History, ChevronRight, RotateCcw } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useOrderStatusCounts } from '@/hooks/useOrderStatusCounts'
import { Spinner } from '@/components/Spinner'
import DigitalLibrary from '@/components/digital/DigitalLibrary'
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'
import { ITEMS_VIEWS, loadFavoriteOrders, repeatOrder, type FavoriteOrder, loadMyServices, loadOwnedProducts, viewFromLegacy, type ItemsView, type MyService, type OwnedProductCard } from '@/modules/items'

const ORANGE = '#f97316'
const fmtDate = (iso: string) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ItensScreen({ abaParam }: { abaParam: string | null }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId } = useProfile()
    const orders = useOrderStatusCounts(userId)
    const [view, setView] = useState<ItemsView>('tudo')
    const [products, setProducts] = useState<OwnedProductCard[] | null>(null)
    const [services, setServices] = useState<MyService[] | null>(null)
    const [favorites, setFavorites] = useState<FavoriteOrder[]>([])
    useEffect(() => {
        if (!userId) return
        const f = () => loadFavoriteOrders().then(setFavorites).catch(() => setFavorites([]))
        f(); window.addEventListener('iuser-order-favorites', f); return () => window.removeEventListener('iuser-order-favorites', f)
    }, [userId])
    const again = async (id: string) => {
        try { const r = await repeatOrder(id); if (!r.added) return; router.push('/atividade?aba=carrinho') } catch { /* o cartão do histórico mostra o erro */ }
    }

    useEffect(() => { setView(viewFromLegacy(abaParam, new URLSearchParams(window.location.search).get('ver'))) }, [abaParam])
    useEffect(() => {
        if (!userId) return
        loadOwnedProducts(userId).then(setProducts).catch(() => setProducts([]))
        loadMyServices(userId).then(setServices).catch(() => setServices([]))
    }, [userId])

    const pick = (v: ItemsView) => { setView(v); router.replace(v === 'tudo' ? '/atividade?aba=itens' : `/atividade?aba=itens&ver=${v}`, { scroll: false }) }
    const active = orders.pending + orders.preparing + orders.ready
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }

    const head = (Icon: typeof ShoppingBag, title: string, color: string, more?: ItemsView, count?: number) => (
        <div className="flex items-center gap-2 mt-5 mb-2">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}1f`, color }}><Icon size={17} /></span>
            <h2 className="flex-1 text-[15px] font-black" style={{ color: colors.textPrimary }}>{title}{typeof count === 'number' && count > 0 ? <span className="font-bold" style={{ color: colors.textSecondary }}> · {count}</span> : null}</h2>
            {more && <button onClick={() => pick(more)} className="text-[12.5px] font-black flex items-center" style={{ color: ORANGE }}>Ver todos <ChevronRight size={15} /></button>}
        </div>
    )
    const empty = (text: string) => <p className="rounded-3xl p-4 text-[13px]" style={{ ...card, color: colors.textSecondary }}>{text}</p>
    const loading = <div className="py-6 flex justify-center"><Spinner size={22} color={ORANGE} /></div>

    const productList = (list: OwnedProductCard[]) => (
        <div className="flex flex-col gap-2">
            {list.map((p) => (
                <div key={p.key} className="rounded-3xl p-3 flex items-center gap-3" style={card}>
                    {p.image ? <img src={p.image} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" /> : <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textSecondary }}><ShoppingBag size={22} /></div>}
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{p.name}</p>
                        <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{p.storeName || 'Loja'}</p>
                        <p className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>{p.times > 1 ? `Comprou ${p.times} vezes` : `${p.quantity} ${p.quantity === 1 ? 'unidade' : 'unidades'}`} · última em {fmtDate(p.lastAt)} · {brl(p.lastPrice)}</p>
                    </div>
                    {p.storeSlug && (
                        <button onClick={() => router.push(p.slug ? `/${p.storeSlug}/${p.slug}` : `/${p.storeSlug}`)} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1 flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}>
                            <RotateCcw size={13} /> De novo
                        </button>
                    )}
                </div>
            ))}
        </div>
    )
    // "Tudo" em FILEIRAS que rolam para o lado (19/11/2026, decisão do dono: ocupa menos espaço)
    const row = (children: React.ReactNode) => <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1 snap-x">{children}</div>
    const tile = 'w-[148px] flex-shrink-0 snap-start rounded-3xl p-2.5 text-left flex flex-col gap-1.5'
    const productRow = (list: OwnedProductCard[]) => row(list.map((p) => (
        <button key={p.key} onClick={() => p.storeSlug && router.push(p.slug ? `/${p.storeSlug}/${p.slug}` : `/${p.storeSlug}`)} className={tile} style={card}>
            {p.image ? <img src={p.image} alt="" className="w-full h-24 rounded-2xl object-cover" /> : <div className="w-full h-24 rounded-2xl flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textSecondary }}><ShoppingBag size={22} /></div>}
            <p className="text-[13px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</p>
            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{p.storeName || 'Loja'} · {brl(p.lastPrice)}</p>
            <span className="mt-auto text-[11.5px] font-black flex items-center gap-1" style={{ color: ORANGE }}><RotateCcw size={12} /> De novo</span>
        </button>
    )))
    const serviceRow = (list: MyService[]) => row(list.map((s) => (
        <button key={s.id} onClick={() => router.push(`/compromisso/${s.id}`)} className={tile} style={card}>
            {s.logo ? <img src={s.logo} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} className="w-12 h-12 rounded-full object-cover" style={{ background: '#0ea5e91f' }} /> : <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#0ea5e91f', color: '#0ea5e9' }}><CalendarCheck size={20} /></div>}
            <p className="text-[13px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{s.name}</p>
            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{fmtDate(s.date)} às {s.time}</p>
            <span className="mt-auto text-[11px] font-black" style={{ color: s.status === 'completed' ? '#2563eb' : '#16a34a' }}>{s.status === 'completed' ? 'Feito' : 'Agendado'}</span>
        </button>
    )))
    const favoriteRow = (list: FavoriteOrder[]) => row(list.map((f) => (
        <div key={f.orderId} className={tile + ' w-[200px]'} style={card}>
            <div className="flex items-center gap-2">
                {f.logo ? <img src={f.logo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: '#eab3081f', color: '#ca8a04' }}><Star size={16} /></div>}
                <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{f.storeName}</p>
            </div>
            <p className="text-[11.5px] line-clamp-2" style={{ color: colors.textSecondary }}>{f.items}</p>
            <button onClick={() => again(f.orderId)} className="mt-auto h-8 rounded-full text-[12px] font-black flex items-center justify-center gap-1" style={{ background: `${ORANGE}1f`, color: ORANGE }}><RotateCcw size={12} /> Pedir de novo · {brl(f.total)}</button>
        </div>
    )))
    const serviceList = (list: MyService[]) => (
        <div className="flex flex-col gap-2">
            {list.map((s) => (
                <button key={s.id} onClick={() => router.push(`/compromisso/${s.id}`)} className="rounded-3xl p-3 flex items-center gap-3 text-left" style={card}>
                    {s.logo ? <img src={s.logo} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" style={{ background: '#0ea5e91f' }} /> : <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center" style={{ background: '#0ea5e91f', color: '#0ea5e9' }}><CalendarCheck size={20} /></div>}
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</p>
                        <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{s.with || ''}{s.with ? ' · ' : ''}{fmtDate(s.date)} às {s.time}</p>
                    </div>
                    <span className="px-2 h-6 rounded-full text-[11px] font-black flex items-center flex-shrink-0" style={s.status === 'completed' ? { background: '#2563eb1f', color: '#2563eb' } : { background: '#16a34a1f', color: '#16a34a' }}>{s.status === 'completed' ? 'Feito' : 'Agendado'}</span>
                </button>
            ))}
        </div>
    )

    if (!userId) return <p className="py-10 text-center text-[13.5px]" style={{ color: colors.textSecondary }}>Entre na sua conta para ver os seus itens.</p>

    return (
        <div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-0.5">
                {ITEMS_VIEWS.map((v) => (
                    <button key={v.key} onClick={() => pick(v.key)} className="relative h-9 px-3.5 rounded-full text-[12.5px] font-black whitespace-nowrap flex-shrink-0"
                        style={view === v.key ? { background: ORANGE, color: '#fff' } : { background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                        {v.label}
                        {v.key === 'historico' && active > 0 && <span className="ml-1.5 inline-flex min-w-[16px] h-4 px-1 rounded-full text-[9.5px] text-white items-center justify-center" style={{ background: orders.ready > 0 ? '#a855f7' : '#16a34a' }}>{active}</span>}
                    </button>
                ))}
            </div>

            {view === 'historico' ? (
                <div className="mt-3">{favorites.length > 0 && <div className="mb-3">{favoriteRow(favorites)}</div>}<CarrinhoScreen hideTabs tab={abaParam === 'avaliacoes' ? 'avaliacoes' : 'pedidos'} /></div>
            ) : view === 'digitais' ? (
                <div className="mt-3"><DigitalLibrary userId={userId} /></div>
            ) : view === 'produtos' ? (
                <div className="mt-3">{products === null ? loading : products.length ? productList(products) : empty('Os produtos que você comprar aparecem aqui depois que o pedido for concluído.')}</div>
            ) : view === 'servicos' ? (
                <div className="mt-3">{services === null ? loading : services.length ? serviceList(services) : empty('Os serviços que você agendar aparecem aqui quando forem confirmados.')}</div>
            ) : (
                <>
                    {active > 0 && (
                        <button onClick={() => pick('historico')} className="mt-3 w-full rounded-3xl p-3.5 flex items-center gap-3 text-left" style={{ background: `${orders.ready > 0 ? '#a855f7' : '#16a34a'}14`, border: `1.5px solid ${orders.ready > 0 ? '#a855f7' : '#16a34a'}` }}>
                            <History size={20} style={{ color: orders.ready > 0 ? '#a855f7' : '#16a34a' }} />
                            <span className="flex-1 text-[14px] font-black" style={{ color: colors.textPrimary }}>{active} {active === 1 ? 'pedido em andamento' : 'pedidos em andamento'}{orders.ready > 0 ? ` · ${orders.ready} pronto${orders.ready > 1 ? 's' : ''}` : ''}</span>
                            <ChevronRight size={17} style={{ color: colors.textSecondary }} />
                        </button>
                    )}
                    {favorites.length > 0 && <>{head(Star, 'Pedidos favoritos', '#eab308')}{favoriteRow(favorites)}</>}
                    {head(History, 'Histórico de pedidos', '#64748b', 'historico')}
                    <button onClick={() => pick('historico')} className="w-full rounded-3xl p-3 flex items-center gap-3 text-left" style={card}>
                        <span className="flex-1 text-[12.5px]" style={{ color: colors.textSecondary }}>Seus pedidos, para acompanhar, avaliar e repetir.</span>
                        <ChevronRight size={17} style={{ color: colors.textSecondary }} />
                    </button>
                    {head(ShoppingBag, 'Produtos', '#22c55e', products && products.length > 8 ? 'produtos' : undefined, products?.length)}
                    {products === null ? loading : products.length ? productRow(products.slice(0, 8)) : empty('Você ainda não comprou produtos.')}
                    {head(CalendarCheck, 'Serviços', '#0ea5e9', services && services.length > 8 ? 'servicos' : undefined, services?.length)}
                    {services === null ? loading : services.length ? serviceRow(services.slice(0, 8)) : empty('Nenhum serviço agendado ainda.')}
                    {head(PlayCircle, 'Digitais', '#8b5cf6', 'digitais')}
                    <DigitalLibrary userId={userId} />
                </>
            )}
        </div>
    )
}
