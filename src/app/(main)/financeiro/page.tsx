'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    TrendingUp,
    DollarSign,
    Users,
    ArrowUpRight,
    Plus,
    Pencil,
    ChevronRight,
    Clock,
    Store as StoreIcon,
    Package,
    Settings,
    ShoppingBag,
    MapPinned,
    MapPin,
    X
} from 'lucide-react'
import { useMerchantStore } from '@/store/useMerchantStore'
import { parseCoords } from '@/lib/geo'

interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    is_open: boolean
}

interface Sale {
    id: string
    created_at: string
    price: number
    quantity: number
    product_name: string
    buyer_id: string
    buyer_name: string
    buyer_profile_slug: string
    store_id: string
    status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'paid' | 'rejected'
    checkout_id: string
}

interface GroupedOrder {
    checkout_id: string
    buyer_name: string
    buyer_profile_slug: string
    created_at: string
    status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'paid' | 'rejected'
    items: Sale[]
    totalPrice: number
    store_name?: string
}

// ── COMPONENT: ORDER MODAL (MOBILE OTIMIZADO) ────────────────────────────────
function OrderModal({ order, onClose, onAction }: { order: GroupedOrder, onClose: () => void, onAction: (status: string) => void }) {
    const statusMap = {
        'pending': { label: 'Novo Convite', color: 'bg-blue-500/10 text-blue-600', next: 'preparing', nextLabel: 'Aceitar' },
        'preparing': { label: 'Em Preparo', color: 'bg-yellow-500/10 text-yellow-600', next: 'ready', nextLabel: 'Pronto' },
        'ready': { label: 'Pronto', color: 'bg-purple-500/10 text-purple-600', next: 'paid', nextLabel: 'Finalizar' },
        'paid': { label: 'Finalizado', color: 'bg-green-500/10 text-green-500', next: null, nextLabel: '' },
        'rejected': { label: 'Recusado', color: 'bg-destructive/10 text-destructive', next: null, nextLabel: '' }
    }

    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={onClose} />
            <div className="relative bg-card border-t sm:border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-none shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
                {/* Status Timeline Header - Compacto */}
                <div className="bg-secondary/30 p-4 flex justify-around items-center border-b border-border/50">
                    {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                        const isCurrent = order.status === s;
                        const isCompleted = ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx;

                        let dotColor = 'bg-muted text-muted-foreground opacity-30';
                        let textColor = 'text-muted-foreground opacity-50';

                        if (isCurrent || isCompleted) {
                            if (s === 'pending') dotColor = 'bg-blue-500 text-white';
                            if (s === 'preparing') dotColor = 'bg-yellow-500 text-white';
                            if (s === 'ready') dotColor = 'bg-purple-500 text-white';
                            if (s === 'paid') dotColor = 'bg-green-500 text-white';

                            if (isCurrent) {
                                dotColor += ' scale-110 shadow-md';
                                if (s === 'pending') textColor = 'text-blue-500';
                                if (s === 'preparing') textColor = 'text-yellow-500';
                                if (s === 'ready') textColor = 'text-purple-500';
                                if (s === 'paid') textColor = 'text-green-500';
                            } else {
                                if (s === 'pending') textColor = 'text-blue-500 opacity-70';
                                if (s === 'preparing') textColor = 'text-yellow-500 opacity-70';
                                if (s === 'ready') textColor = 'text-purple-500 opacity-70';
                                if (s === 'paid') textColor = 'text-green-500 opacity-70';
                            }
                        }

                        return (
                            <div key={s} className="flex flex-col items-center gap-1">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black transition-all duration-300 ${dotColor}`}>
                                    {idx + 1}
                                </div>
                                <span className={`text-[6px] font-black uppercase tracking-wider transition-all duration-300 ${textColor}`}>
                                    {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Prep' : s === 'ready' ? 'Pronto' : 'Pago'}
                                </span>
                            </div>
                        )
                    })}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">#{order.checkout_id.slice(0, 8)}</p>
                            <h2 className="text-xl font-black italic uppercase tracking-tighter">@{order.buyer_profile_slug}</h2>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${currentStatus.color}`}>
                            {currentStatus.label}
                        </div>
                    </div>

                    <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border border-border/30">
                                <div className="flex-1">
                                    <p className="text-sm font-black uppercase tracking-tight">{item.product_name}</p>
                                    <p className="text-[9px] text-muted-foreground font-bold">{item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)}</p>
                                </div>
                                <p className="text-base font-black italic">R$ {item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-border flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Total</span>
                        <span className="text-2xl font-black italic tracking-tighter">R$ {order.totalPrice.toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {currentStatus.next && (
                            <button
                                onClick={() => onAction(currentStatus.next!)}
                                className="py-4 bg-foreground text-background rounded-lg font-black uppercase text-xs tracking-wider hover:bg-green-500 hover:text-white transition-all active:scale-98"
                            >
                                {currentStatus.nextLabel}
                            </button>
                        )}

                        {order.status === 'pending' && (
                            <button
                                onClick={() => onAction('rejected')}
                                className="py-3 bg-destructive/5 text-destructive border border-destructive/10 rounded-lg font-black uppercase text-[9px] tracking-wider hover:bg-destructive hover:text-white transition-all"
                            >
                                Recusar
                            </button>
                        )}

                        <button onClick={onClose} className="py-3 text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── COMPONENT: STORE FINANCIAL CARD (MOBILE COMPACTO) ────────────────────────
function StoreFinancialCard({
    store,
    sales,
    supabase,
    onToggleStatus,
    profile,
    onUpdateOrder
}: {
    store: Store,
    sales: Sale[],
    supabase: any,
    onToggleStatus: () => void,
    profile: any,
    onUpdateOrder: () => void
}) {
    const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null)

    const groupedOrders = useMemo(() => {
        const groups: Record<string, GroupedOrder> = {}
        sales.forEach(s => {
            if (!groups[s.checkout_id]) {
                groups[s.checkout_id] = {
                    checkout_id: s.checkout_id,
                    buyer_name: s.buyer_name,
                    buyer_profile_slug: s.buyer_profile_slug,
                    created_at: s.created_at,
                    status: s.status,
                    items: [],
                    totalPrice: 0
                }
            }
            groups[s.checkout_id].items.push(s)
            groups[s.checkout_id].totalPrice += s.price
        })
        return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [sales])

    const invites = groupedOrders.filter(o => o.status === 'pending')
    const inPreparo = groupedOrders.filter(o => o.status === 'preparing')
    const forReady = groupedOrders.filter(o => o.status === 'ready')
    const accepted = groupedOrders.filter(o => o.status === 'paid')

    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

        const filterByDate = (start: number) => sales.filter(s => new Date(s.created_at).getTime() >= start && (s.status === 'paid' || s.status === 'ready' || s.status === 'preparing'))

        const daily = filterByDate(today)
        const calcTotal = (list: Sale[]) => list.reduce((acc, s) => acc + s.price, 0)
        const calcOrders = (list: Sale[]) => new Set(list.map(d => d.checkout_id)).size

        const dailyRev = calcTotal(daily)
        const dailyOrd = calcOrders(daily)

        return {
            daily: { revenue: dailyRev, orders: dailyOrd, avgTicket: dailyOrd > 0 ? dailyRev / dailyOrd : 0 },
            total: { revenue: calcTotal(sales.filter(s => s.status === 'paid')), orders: calcOrders(sales.filter(s => s.status === 'paid')) }
        }
    }, [sales])

    const topItems = useMemo(() => {
        const counts: Record<string, { count: number, total: number }> = {}
        sales.filter(s => s.status === 'paid' || s.status === 'ready').slice(0, 20).forEach(s => {
            if (!counts[s.product_name]) counts[s.product_name] = { count: 0, total: 0 }
            counts[s.product_name].count += s.quantity
            counts[s.product_name].total += s.price
        })
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 3)
    }, [sales])

    const handleAction = async (status: string) => {
        if (!selectedOrder) return

        await supabase
            .from('store_sales')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        await supabase
            .from('orders')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        // toast.success('Status do pedido atualizado!')

        setSelectedOrder(null)
        onUpdateOrder()
    }

    return (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            {/* Header Compacto */}
            <div className="p-4 border-b border-border/50 bg-secondary/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-background border border-border">
                            {store.logo_url && <img src={supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl} className="w-full h-full object-cover" />}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${store.is_open ? 'bg-green-500' : 'bg-destructive'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-black italic uppercase tracking-tighter truncate">{store.name}</h3>
                        <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider">@{store.storeSlug}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={onToggleStatus}
                        className={`px-3 py-2 rounded-lg font-black uppercase text-[8px] tracking-wider transition-all ${store.is_open ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-green-500 text-white'}`}
                    >
                        {store.is_open ? 'Fechar' : 'Abrir'}
                    </button>
                    <Link href={`/${profile?.profileSlug}/${store.storeSlug}/editar-loja`} className="p-2 bg-secondary rounded-lg hover:bg-foreground hover:text-background transition-all">
                        <Pencil size={14} />
                    </Link>
                </div>
            </div>

            <div className="p-4 space-y-6">
                {/* Métricas Compactas */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary/20 p-3 rounded-lg border border-border/30">
                        <p className="text-[7px] font-black uppercase text-muted-foreground tracking-wider">Hoje</p>
                        <p className="text-lg font-black italic">R$ {metrics.daily.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[8px] font-bold text-green-500">{metrics.daily.orders} ped</p>
                    </div>
                    <div className="bg-secondary/20 p-3 rounded-lg border border-border/30">
                        <p className="text-[7px] font-black uppercase text-muted-foreground tracking-wider">Ticket Médio</p>
                        <p className="text-lg font-black italic">R$ {metrics.daily.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[8px] font-bold text-muted-foreground">{metrics.total.orders} pedidos no total</p>
                    </div>
                </div>

                {/* Top Produtos Compacto */}
                {topItems.length > 0 && (
                    <div className="bg-secondary/10 p-3 rounded-lg border border-border/20">
                        <h4 className="text-[8px] font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
                            <TrendingUp size={10} /> Top Produtos
                        </h4>
                        <div className="space-y-2">
                            {topItems.map(([name, data], i) => (
                                <div key={i} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-[9px] font-black text-muted-foreground w-4">{i + 1}</span>
                                        <span className="text-[9px] font-bold uppercase truncate flex-1">{name}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[9px] font-black">{data.count}x</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Seções de Pedidos Compactas */}
                <div className="space-y-5">
                    {/* Novos Pedidos */}
                    {invites.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-[8px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                                <Clock size={10} /> Novos ({invites.length})
                            </h4>
                            {invites.slice(0, 2).map(order => (
                                <div
                                    key={order.checkout_id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 active:bg-blue-500/10 cursor-pointer"
                                >
                                    <div>
                                        <span className="text-sm font-black italic">@{order.buyer_profile_slug}</span>
                                        <p className="text-[8px] font-bold text-muted-foreground">{order.items.length} itens</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                        <ChevronRight size={16} className="text-blue-600" />
                                    </div>
                                </div>
                            ))}
                            {invites.length > 2 && (
                                <p className="text-[8px] text-center text-muted-foreground">+{invites.length - 2} outros</p>
                            )}
                        </div>
                    )}

                    {/* Em Preparo */}
                    {inPreparo.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-[8px] font-black uppercase tracking-wider text-yellow-600">Preparo ({inPreparo.length})</h4>
                            {inPreparo.slice(0, 2).map(order => (
                                <div
                                    key={order.checkout_id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 cursor-pointer"
                                >
                                    <span className="text-sm font-black italic">@{order.buyer_profile_slug}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                        <ChevronRight size={16} className="text-yellow-600" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pronto */}
                    {forReady.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-[8px] font-black uppercase tracking-wider text-purple-600">Pronto ({forReady.length})</h4>
                            {forReady.slice(0, 2).map(order => (
                                <div
                                    key={order.checkout_id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 cursor-pointer"
                                >
                                    <span className="text-sm font-black italic">@{order.buyer_profile_slug}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                        <ChevronRight size={16} className="text-purple-600" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pago / Finalizado */}
                    {accepted.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-[8px] font-black uppercase tracking-wider text-green-600">Finalizado ({accepted.length})</h4>
                            {accepted.slice(0, 2).map(order => (
                                <div
                                    key={order.checkout_id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                                >
                                    <span className="text-sm font-black italic">@{order.buyer_profile_slug}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                        <ChevronRight size={16} className="text-green-600" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Histórico Resumido */}
                    {groupedOrders.length > 0 && (
                        <div className="pt-2 border-t border-border/30">
                            <Link
                                href={`/${profile?.profileSlug}/${store.storeSlug}/pedidos`}
                                className="block w-full text-center text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground py-2"
                            >
                                Ver todos os {groupedOrders.length} pedidos da loja →
                            </Link>
                        </div>
                    )}
                </div>
            </div>



            {selectedOrder && (
                <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onAction={handleAction} />
            )}
        </div>
    )
}

// ── MAIN PAGE (MOBILE COMPACTA) ──────────────────────────────────────────────
import { CheckCircle2 } from 'lucide-react'

export default function FinanceiroPage() {
    const supabase = createClient()
    const router = useRouter()
    const setPendingOrdersCount = useMerchantStore(state => state.setPendingOrdersCount)

    const [stores, setStores] = useState<Store[]>([])
    const [sales, setSales] = useState<Sale[]>([])
    const [myPurchases, setMyPurchases] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<any>(null)
    const [viewOrder, setViewOrder] = useState<['merchant', 'customer'] | ['customer', 'merchant']>(['merchant', 'customer'])
    const [locLoading, setLocLoading] = useState(false)

    const fetchAddressFromCoords = async (lat: number, lng: number) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address,poi,place`)
            const data = await res.json()
            if (data && data.features && data.features.length > 0) {
                const feature = data.features[0]
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    await supabase.from('profiles').update({ address: feature.place_name }).eq('id', user.id)
                    setProfile((prev: any) => ({ ...prev, address: feature.place_name }))
                }
            }
        } catch (e) { console.error(e) }
    }

    const fetchCoordsFromAddress = async (query: string) => {
        try {
            setLocLoading(true)
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`)
            const data = await res.json()
            if (data && data.features && data.features.length > 0) {
                const feature = data.features[0]
                const [lon, lat] = feature.center
                const geoString = `POINT(${lon} ${lat})`
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    await supabase.from('profiles').update({
                        location: geoString,
                        address: feature.place_name
                    }).eq('id', user.id)
                    setProfile((prev: any) => ({ ...prev, location: geoString, address: feature.place_name }))
                    toast.success('Localização atualizada!')
                }
            } else {
                toast.error('Endereço não encontrado!')
            }
        } catch (e) {
            console.error(e)
            toast.error('Erro na busca do endereço.')
        } finally {
            setLocLoading(false)
        }
    }

    const saveLocation = () => {
        setLocLoading(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const geoString = `POINT(${pos.coords.longitude} ${pos.coords.latitude})`
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    await supabase.from('profiles').update({ location: geoString }).eq('id', user.id)
                    setProfile((prev: any) => ({ ...prev, location: geoString }))
                    fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
                    toast.success('Localização sincronizada!')
                }
                setLocLoading(false)
            },
            () => {
                toast.error('Não foi possível obter sua localização.')
                setLocLoading(false)
            }
        )
    }

    const loadFinanceData = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(profileData)

        const { data: myStores } = await supabase.from('stores').select('*').eq('owner_id', user.id)
        if (myStores) setStores(myStores)

        if (myStores && myStores.length > 0) {
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .in('store_id', myStores.map(s => s.id))
                .order('created_at', { ascending: false })

            if (ordersData) setSales(ordersData.flatMap(o => o.order_items.map((i: any) => ({ ...i, created_at: o.created_at, status: o.status, checkout_id: o.checkout_id, buyer_id: o.buyer_id, buyer_name: o.buyer_name, buyer_profile_slug: o.buyer_profile_slug, store_id: o.store_id }))))
        }

        let allPurchases: any[] = []
        const { data: purchaseDataLegacy } = await supabase.from('store_sales').select('*, stores(name)').eq('buyer_id', user.id).order('created_at', { ascending: false })
        const { data: purchaseDataNew } = await supabase.from('orders').select('*, order_items(*), stores(name)').eq('buyer_id', user.id).order('created_at', { ascending: false })

        if (purchaseDataLegacy) allPurchases = [...purchaseDataLegacy.map((p: any) => ({ ...p, store_name: p.stores?.name || 'Loja' }))]
        if (purchaseDataNew) allPurchases = [...allPurchases, ...purchaseDataNew.flatMap(o => o.order_items.map((i: any) => ({ ...i, created_at: o.created_at, status: o.status, checkout_id: o.checkout_id, buyer_id: o.buyer_id, buyer_name: o.buyer_name, buyer_profile_slug: o.buyer_profile_slug, store_id: o.store_id, store_name: o.stores?.name || 'Loja' })))]

        setMyPurchases(Array.from(new Map(allPurchases.map(item => [item.id, item])).values()))
        setLoading(false)
    }

    useEffect(() => {
        loadFinanceData()
        const channel = supabase.channel('financeiro-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadFinanceData()).on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales' }, () => loadFinanceData()).subscribe()
        const interval = setInterval(() => loadFinanceData(), 5000)
        return () => { supabase.removeChannel(channel); clearInterval(interval); }
    }, [supabase])

    const toggleStoreStatus = async (storeId: string) => {
        const store = stores.find(s => s.id === storeId)
        if (!store) return
        const newStatus = !store.is_open
        const { error } = await supabase.from('stores').update({ is_open: newStatus }).eq('id', storeId)
        if (!error) {
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: newStatus } : s))
            toast.info(`Sua loja agora está ${newStatus ? 'Aberta' : 'Fechada'}`)
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4 font-sans">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-[8px] font-black uppercase tracking-wider animate-pulse">Carregando Finanças...</p>
        </div>
    )

    const userCoords = profile?.location ? parseCoords(profile.location) : null

    return (
        <div className="min-h-screen pb-20 bg-background text-foreground font-sans">
            {/* Header Mobile Compacto */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <TrendingUp size={16} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black italic uppercase tracking-tighter leading-none">Finanças</h1>
                            <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider">Visão Geral</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-secondary/50 p-0.5 rounded-lg border border-border">
                            <button
                                onClick={() => setViewOrder(['merchant', 'customer'])}
                                className={`px-2 sm:px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all ${viewOrder[0] === 'merchant' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
                            >↑ Vendas</button>
                            <button
                                onClick={() => setViewOrder(['customer', 'merchant'])}
                                className={`px-2 sm:px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all ${viewOrder[0] === 'customer' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
                            >↑ Compras</button>
                        </div>
                        <Link href="/configuracoes" className="p-2 bg-secondary/50 border border-border rounded-lg"><Settings size={14} /></Link>
                    </div>
                </div>
            </div>

            <div className="px-4 py-4 space-y-10">
                {viewOrder.map(section => (
                    <div key={section}>
                        <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
                            <h2 className="text-xs font-black italic uppercase tracking-widest text-muted-foreground">
                                {section === 'merchant' ? 'Painel Lojista' : 'Painel Cliente'}
                            </h2>
                            {section === 'merchant' && (
                                <button onClick={() => router.push('/criar-loja')} className="px-3 py-1.5 bg-foreground text-background font-black uppercase text-[8px] tracking-wider rounded-none">Nova Loja</button>
                            )}
                        </div>

                        {section === 'merchant' ? (
                            stores.length === 0 ? (
                                <div className="py-16 text-center border border-dashed border-border rounded-xl bg-card/40">
                                    <StoreIcon size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                                    <p className="text-muted-foreground font-black uppercase tracking-wider text-[10px]">Nenhuma loja ativa</p>
                                    <button onClick={() => router.push('/criar-loja')} className="mt-4 px-6 py-2 bg-primary text-white font-black uppercase text-[8px] tracking-widest">Começar Agora</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {stores.map(store => (
                                        <StoreFinancialCard key={store.id} store={store} sales={sales.filter(s => s.store_id === store.id)} supabase={supabase} onToggleStatus={() => toggleStoreStatus(store.id)} profile={profile} onUpdateOrder={loadFinanceData} />
                                    ))}
                                </div>
                            )
                        ) : (
                            /* Painel Cliente Premium */
                            <div className="space-y-6">
                                {/* Localização Premium (Estilo /editar-loja) */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">Minha Localização Atual</label>
                                        {userCoords && (
                                            <span className="text-[8px] font-black uppercase tracking-widest text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">Sincronizada</span>
                                        )}
                                    </div>

                                    {userCoords ? (
                                        <div className="group relative bg-white rounded-[24px] border border-neutral-100 overflow-hidden transition-all hover:border-primary/20 shadow-sm">
                                            <div className="relative w-full h-44 bg-neutral-50">
                                                {(() => {
                                                    const [lng, lat] = userCoords;
                                                    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
                                                    const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s-l+primary(${lng},${lat})/${lng},${lat},15,0/600x350?access_token=${token}`;
                                                    return (
                                                        <img src={mapUrl} alt="Meu Mapa" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105" />
                                                    );
                                                })()}
                                                <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent pointer-events-none" />
                                                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg"><MapPinned className="w-5 h-5" /></div>
                                                        <div className="max-w-[180px]">
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 leading-none mb-1">Endereço Atual</p>
                                                            <p className="text-[10px] font-bold text-neutral-800 truncate leading-tight">{profile?.address || 'Localização Definida'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { const n = prompt("Digite o novo endereço:", profile?.address); if (n) fetchCoordsFromAddress(n); }} className="w-9 h-9 rounded-xl bg-white border border-neutral-200 text-black flex items-center justify-center shadow-sm hover:scale-110 transition-all" title="Editar"><Pencil className="w-4 h-4" /></button>
                                                        <button onClick={() => { setLocLoading(true); supabase.from('profiles').update({ location: null, address: null }).eq('id', profile.id).then(() => { setProfile((p: any) => ({ ...p, location: null, address: null })); setLocLoading(false); toast.info('Localização removida'); }); }} className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:scale-110 transition-all" title="Remover"><X className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            disabled={locLoading}
                                            onClick={saveLocation}
                                            className="group w-full p-8 bg-neutral-50 border border-neutral-200 border-dashed hover:border-primary/30 hover:bg-white text-neutral-500 hover:text-primary rounded-[24px] transition-all flex flex-col items-center justify-center gap-3 font-black uppercase text-[10px] tracking-[0.3em] active:scale-95 shadow-inner"
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                                {locLoading ? <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /> : <MapPinned className="w-6 h-6" />}
                                            </div>
                                            {locLoading ? 'Capturando Sinal...' : 'Ativar Localização em Tempo Real'}
                                        </button>
                                    )}
                                </div>

                                {/* Header do Extrato */}
                                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[7px] font-black uppercase tracking-wider text-muted-foreground">Total Gasto</p>
                                        <p className="text-2xl font-black italic tracking-tighter">
                                            R$ {myPurchases.reduce((acc, p) => acc + p.price, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                                        <DollarSign size={20} />
                                    </div>
                                </div>

                                {/* Lista de Compras Compacta */}
                                <div className="space-y-3">
                                    {myPurchases.length === 0 ? (
                                        <div className="py-16 text-center border border-dashed border-border rounded-xl bg-card/40">
                                            <ShoppingBag size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                                            <p className="text-muted-foreground font-black uppercase tracking-wider text-xs">Sem compras</p>
                                            <Link href="/" className="inline-block mt-4 text-green-500 font-black uppercase text-[8px] tracking-wider">
                                                Explorar Lojas →
                                            </Link>
                                        </div>
                                    ) : (
                                        Object.values(myPurchases.reduce((groups: any, p) => {
                                            if (!groups[p.checkout_id]) {
                                                groups[p.checkout_id] = {
                                                    checkout_id: p.checkout_id,
                                                    store_name: (p as any).store_name,
                                                    created_at: p.created_at,
                                                    status: p.status,
                                                    buyer_profile_slug: p.buyer_profile_slug,
                                                    total: 0,
                                                    items: []
                                                }
                                            }
                                            groups[p.checkout_id].total += p.price
                                            groups[p.checkout_id].items.push(p)
                                            return groups
                                        }, {})).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((order: any) => (
                                            <div key={order.checkout_id} className="bg-card border border-border/50 rounded-xl p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">
                                                            {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                        </p>
                                                        <h3 className="text-base font-black italic uppercase tracking-tighter">{order.store_name}</h3>
                                                        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">
                                                            Comprado por @{order.buyer_profile_slug}
                                                        </p>
                                                    </div>
                                                    <div className={`px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-wider ${order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                                                        order.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                                                            'bg-destructive/10 text-destructive'
                                                        }`}>
                                                        {order.status === 'pending' ? 'Pendente' : order.status === 'paid' ? 'Pago' : 'Cancelado'}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-1 flex-wrap">
                                                        {order.items.slice(0, 3).map((item: any, idx: number) => (
                                                            <span key={idx} className="text-[8px] font-bold text-muted-foreground bg-secondary/30 px-2 py-0.5 rounded">
                                                                {item.quantity}x {item.product_name}
                                                            </span>
                                                        ))}
                                                        {order.items.length > 3 && (
                                                            <span className="text-[8px] font-bold text-muted-foreground">+{order.items.length - 3}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-lg font-black italic">R$ {order.total.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}