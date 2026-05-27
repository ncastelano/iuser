'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PedidosPage() {
    const router = useRouter()
    const supabase = createClient()
    const [mounted, setMounted] = useState(false)
    
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [myPurchases, setMyPurchases] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const loadUserData = async (userId: string) => {
        setCurrentUserId(userId)

        const { data: profile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url, name')
            .eq('id', userId)
            .single()

        if (profile) {
            setCurrentUserSlug(profile.profileSlug)
            setCurrentUserAvatar(profile.avatar_url)
        }

        const { data: purchaseDataLegacy } = await supabase
            .from('store_sales')
            .select('*, stores(name)')
            .eq('buyer_id', userId)
            .order('created_at', { ascending: false })

        const { data: purchaseDataNew } = await supabase
            .from('orders')
            .select('*, order_items(*), stores(name)')
            .eq('buyer_id', userId)
            .order('created_at', { ascending: false })

        let allPurchases: any[] = []

        if (purchaseDataLegacy) {
            allPurchases = [...allPurchases, ...purchaseDataLegacy.map((p: any) => ({
                ...p,
                store_name: p.stores?.name || 'Loja'
            }))]
        }

        if (purchaseDataNew) {
            const mappedNew = purchaseDataNew.flatMap((o: any) => o.order_items.map((i: any) => ({
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
                store_id: o.store_id,
                store_name: o.stores?.name || 'Loja'
            })))
            allPurchases = [...allPurchases, ...mappedNew]
        }

        const uniquePurchases = Array.from(new Map(allPurchases.map(item => [item.id, item])).values())
        setMyPurchases([...uniquePurchases])
        setLoading(false)
    }

    useEffect(() => {
        setMounted(true)
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await loadUserData(user.id)
            } else {
                setLoading(false)
            }
        }
        checkUser()
    }, [supabase])

    // Real-time updates for myPurchases
    useEffect(() => {
        if (!currentUserId) return

        const channel = supabase
            .channel(`public:orders:${currentUserId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                (payload) => {
                    setMyPurchases(prev => {
                        const exists = prev.some(p => p.checkout_id === payload.new.checkout_id)
                        if (!exists) return prev
                        return prev.map(p => p.checkout_id === payload.new.checkout_id ? { ...p, status: payload.new.status } : p)
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'store_sales' },
                (payload) => {
                    setMyPurchases(prev => {
                        const exists = prev.some(p => p.checkout_id === payload.new.checkout_id)
                        if (!exists) return prev
                        return prev.map(p => p.id === payload.new.id ? { ...p, status: payload.new.status } : p)
                    })
                }
            )
            .subscribe()

        // Fallback polling (garante atualização se realtime não estiver ativado no banco)
        const interval = setInterval(() => {
            loadUserData(currentUserId)
        }, 5000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [currentUserId, supabase])

    if (!mounted) return null

    const groupedOrders = Object.values(myPurchases.reduce((groups: any, p) => {
        if (!groups[p.checkout_id]) {
            groups[p.checkout_id] = {
                checkout_id: p.checkout_id,
                store_name: p.store_name,
                created_at: p.created_at,
                status: p.status,
                total: 0,
                items: []
            }
        }
        groups[p.checkout_id].total += p.price
        groups[p.checkout_id].items.push(p)
        return groups
    }, {})).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-green-500 selection:text-white pb-32">
            <div className="max-w-3xl mx-auto px-4 py-6">
                {/* Header */}
                <header className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                    <button
                        onClick={() => router.back()}
                        className="w-8 h-8 flex items-center justify-center bg-secondary/50 border border-border hover:bg-foreground hover:text-background transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tighter italic uppercase text-foreground leading-none">
                            Meus Pedidos<span className="text-green-500">.</span>
                        </h1>
                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">
                            Histórico Completo
                        </p>
                    </div>
                </header>

                {loading ? (
                    <div className="flex justify-center p-8">
                        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                    </div>
                ) : !currentUserId ? (
                    <div className="text-center p-8 border border-border bg-secondary/10">
                        <p className="text-xs font-black uppercase text-muted-foreground">Você precisa estar logado para ver seus pedidos.</p>
                        <button 
                            onClick={() => router.push('/sacola')}
                            className="mt-4 px-6 py-2 bg-foreground text-background font-black uppercase text-[9px] tracking-wider"
                        >
                            Fazer Login
                        </button>
                    </div>
                ) : groupedOrders.length === 0 ? (
                    <div className="py-8 px-4 border border-dashed border-border bg-card/10 text-center">
                        <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                        <h2 className="text-sm font-black italic uppercase tracking-tighter text-foreground">Nenhum pedido encontrado</h2>
                        <p className="text-muted-foreground text-[7px] font-bold uppercase tracking-wider mt-1">
                            Você ainda não realizou nenhuma compra.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 border border-border bg-secondary/10 mb-6">
                            <div className="w-10 h-10 bg-background border border-border flex-shrink-0">
                                {currentUserAvatar ? (
                                    <img src={currentUserAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary">
                                        <User className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">Comprador</p>
                                <p className="text-sm font-black italic text-foreground leading-none mt-0.5">@{currentUserSlug}</p>
                            </div>
                        </div>

                        {groupedOrders.map((order: any) => (
                            <div key={order.checkout_id} className="border border-border p-4 hover:border-green-500/30 transition-all bg-card/10">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 border-b border-border/50 pb-3">
                                    <div>
                                        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">
                                            {new Date(order.created_at).toLocaleString('pt-BR')}
                                        </p>
                                        <h3 className="text-sm font-black italic uppercase tracking-tighter text-foreground mt-0.5">{order.store_name}</h3>
                                    </div>
                                    <div className={`self-start sm:self-center px-3 py-1 text-[8px] font-black uppercase tracking-wider border ${
                                        order.status === 'pending' ? 'border-blue-500/30 bg-blue-500/10 text-blue-500' :
                                        order.status === 'preparing' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500' :
                                        order.status === 'ready' ? 'border-purple-500/30 bg-purple-500/10 text-purple-500' :
                                        order.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-500' :
                                        'border-destructive/30 bg-destructive/10 text-destructive'
                                    }`}>
                                        {order.status === 'pending' ? 'Pendente' :
                                         order.status === 'preparing' ? 'Preparo' :
                                         order.status === 'ready' ? 'Pronto' :
                                         order.status === 'paid' ? 'Finalizado' : 'Cancelado/Recusado'}
                                    </div>
                                </div>

                                <div className="space-y-2 mb-4">
                                    {order.items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-foreground">{item.quantity}x {item.product_name}</span>
                                            <span className="font-black text-muted-foreground">R$ {item.price.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">Total do Pedido</span>
                                    <span className="text-lg font-black italic text-foreground">R$ {order.total.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
