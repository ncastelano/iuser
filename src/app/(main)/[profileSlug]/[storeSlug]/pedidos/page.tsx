'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Clock, CheckCircle2, ChevronRight, Store as StoreIcon } from 'lucide-react'
import Link from 'next/link'

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
}

export default function StoreOrdersPage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()
    
    const profileSlug = params.profileSlug as string
    const storeSlug = params.storeSlug as string
    
    const [store, setStore] = useState<any>(null)
    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'paid' | 'rejected'>('all')

    useEffect(() => {
        const loadStoreOrders = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // Get store
            const { data: storeData } = await supabase
                .from('stores')
                .select('*')
                .eq('storeSlug', storeSlug)
                .single()

            if (!storeData) {
                setLoading(false)
                return
            }
            setStore(storeData)

            // Get all orders for this store
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .eq('store_id', storeData.id)
                .order('created_at', { ascending: false })

            let allSales: Sale[] = []

            if (ordersData && ordersData.length > 0) {
                const mappedSales = ordersData.flatMap((o: any) => o.order_items.map((i: any) => ({
                    id: i.id,
                    product_id: i.product_id,
                    product_name: i.product_name,
                    quantity: i.quantity,
                    price: i.total_price,
                    created_at: o.created_at,
                    status: o.status,
                    checkout_id: o.checkout_id,
                    buyer_id: o.buyer_id,
                    buyer_name: o.buyer_name,
                    buyer_profile_slug: o.buyer_profile_slug,
                    store_id: o.store_id
                })))
                allSales = [...mappedSales]
            } else {
                // Try legacy sales
                const { data: legacySales } = await supabase
                    .from('store_sales')
                    .select('*')
                    .eq('store_id', storeData.id)
                    .order('created_at', { ascending: false })
                    
                if (legacySales) {
                    allSales = legacySales
                }
            }

            setSales(allSales)
            setLoading(false)
        }

        loadStoreOrders()
        
        // Subscription for real-time updates
        const channel = supabase
            .channel('store-orders-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    loadStoreOrders()
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'store_sales' },
                () => {
                    loadStoreOrders()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase, storeSlug, router])

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

    const filteredOrders = useMemo(() => {
        if (filter === 'all') return groupedOrders
        return groupedOrders.filter(o => o.status === filter)
    }, [groupedOrders, filter])

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
                <div className="w-8 h-8 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
                <p className="text-[8px] font-black uppercase tracking-wider animate-pulse">Carregando pedidos...</p>
            </div>
        )
    }

    if (!store) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <p className="text-sm font-black uppercase tracking-wider text-muted-foreground">Loja não encontrada</p>
                <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-foreground text-background font-black uppercase text-[9px] tracking-wider rounded-lg">
                    Voltar
                </button>
            </div>
        )
    }

    const statusMap = {
        'all': { label: 'Todos', color: 'bg-secondary text-foreground' },
        'pending': { label: 'Novos', color: 'bg-blue-500/10 text-blue-600' },
        'preparing': { label: 'Em Preparo', color: 'bg-yellow-500/10 text-yellow-600' },
        'ready': { label: 'Pronto', color: 'bg-purple-500/10 text-purple-600' },
        'paid': { label: 'Finalizado', color: 'bg-green-500/10 text-green-500' },
        'rejected': { label: 'Recusado', color: 'bg-destructive/10 text-destructive' }
    }

    return (
        <div className="min-h-screen pb-20 bg-background text-foreground font-sans">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/financeiro')}
                        className="w-8 h-8 flex items-center justify-center bg-secondary/50 border border-border rounded-lg hover:bg-foreground hover:text-background transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden border border-border">
                            {store.logo_url ? (
                                <img src={supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl} className="w-full h-full object-cover" />
                            ) : (
                                <StoreIcon size={14} className="text-muted-foreground" />
                            )}
                        </div>
                        <div>
                            <h1 className="text-lg font-black italic uppercase tracking-tighter leading-none">{store.name}</h1>
                            <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider">
                                Todos os Pedidos
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Filters */}
                <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
                    {Object.entries(statusMap).map(([key, data]) => {
                        const isSelected = filter === key
                        const count = key === 'all' ? groupedOrders.length : groupedOrders.filter(o => o.status === key).length
                        
                        return (
                            <button
                                key={key}
                                onClick={() => setFilter(key as any)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-wider whitespace-nowrap transition-all border border-transparent ${
                                    isSelected 
                                        ? 'bg-foreground text-background scale-105 shadow-md' 
                                        : `bg-secondary/30 text-muted-foreground hover:bg-secondary/50`
                                }`}
                            >
                                {data.label}
                                <span className={`px-1.5 py-0.5 rounded-full text-[6px] ${isSelected ? 'bg-background/20 text-background' : 'bg-background/50'}`}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="p-4 space-y-4">
                {filteredOrders.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl bg-card/10">
                        <Package className="w-8 h-8 text-muted-foreground/30 mb-3" />
                        <h2 className="text-sm font-black italic uppercase tracking-tighter">Nenhum pedido</h2>
                        <p className="text-muted-foreground text-[7px] font-bold uppercase tracking-wider mt-1">
                            Não encontramos pedidos para este filtro.
                        </p>
                    </div>
                ) : (
                    filteredOrders.map(order => (
                        <div key={order.checkout_id} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                            <div className="p-3 border-b border-border/50 bg-secondary/10 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black uppercase tracking-wider ${statusMap[order.status as keyof typeof statusMap]?.color || 'bg-secondary'}`}>
                                        {order.buyer_profile_slug.slice(0, 2)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black italic uppercase tracking-tighter leading-none">@{order.buyer_profile_slug}</p>
                                        <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                                            {new Date(order.created_at).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-wider ${statusMap[order.status as keyof typeof statusMap]?.color || 'bg-secondary text-foreground'}`}>
                                    {statusMap[order.status as keyof typeof statusMap]?.label}
                                </div>
                            </div>
                            
                            <div className="p-3 space-y-2">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-secondary/20 p-2 rounded-lg border border-border/30">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black bg-foreground/10 px-1.5 py-0.5 rounded text-foreground">{item.quantity}x</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wide truncate max-w-[150px]">{item.product_name}</span>
                                        </div>
                                        <span className="text-[10px] font-black italic text-muted-foreground">R$ {(item.price / item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="p-3 bg-secondary/30 border-t border-border flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Total</span>
                                <span className="text-lg font-black italic tracking-tighter">R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
