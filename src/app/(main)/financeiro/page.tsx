'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
    Settings
} from 'lucide-react'

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
    status: 'pending' | 'paid'
}

// ── COMPONENT: STORE FINANCIAL CARD ───────────────────────────────────────────
function StoreFinancialCard({ 
    store, 
    sales, 
    supabase, 
    onToggleStatus,
    profile
}: { 
    store: Store, 
    sales: Sale[], 
    supabase: any,
    onToggleStatus: () => void,
    profile: any
}) {
    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).getTime()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

        const filterByDate = (start: number) => sales.filter(s => new Date(s.created_at).getTime() >= start && s.status === 'paid')

        const daily = filterByDate(today)
        const weekly = filterByDate(startOfWeek)
        const monthly = filterByDate(startOfMonth)

        return {
            daily: { revenue: daily.reduce((acc, s) => acc + s.price, 0), orders: daily.length },
            weekly: { revenue: weekly.reduce((acc, s) => acc + s.price, 0), orders: weekly.length },
            monthly: { revenue: monthly.reduce((acc, s) => acc + s.price, 0), orders: monthly.length }
        }
    }, [sales])

    const topCustomers = useMemo(() => {
        const buyers: Record<string, { name: string, slug: string, total: number, count: number }> = {}
        sales.filter(s => s.status === 'paid').forEach(s => {
            if (!buyers[s.buyer_id]) {
                buyers[s.buyer_id] = { name: s.buyer_name || 'Anônimo', slug: s.buyer_profile_slug, total: 0, count: 0 }
            }
            buyers[s.buyer_id].total += s.price
            buyers[s.buyer_id].count += 1
        })
        return Object.values(buyers).sort((a, b) => b.total - a.total).slice(0, 3)
    }, [sales])

    const topProducts = useMemo(() => {
        const prods: Record<string, { count: number, total: number }> = {}
        sales.filter(s => s.status === 'paid').forEach(s => {
            if (!prods[s.product_name]) prods[s.product_name] = { count: 0, total: 0 }
            prods[s.product_name].count += s.quantity
            prods[s.product_name].total += s.price
        })
        return Object.entries(prods).sort((a, b) => b[1].count - a[1].count).slice(0, 3)
    }, [sales])

    const pendingOrders = sales.filter(s => s.status === 'pending')

    return (
        <div className="bg-card border border-border/50 rounded-[32px] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500">
            {/* Header com Status */}
            <div className="p-6 border-b border-border/50 bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-background border border-border shadow-sm">
                            {store.logo_url && <img src={supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl} className="w-full h-full object-cover" />}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${store.is_open ? 'bg-green-500' : 'bg-destructive'}`} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black italic uppercase tracking-tighter leading-none">{store.name}</h3>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">/{store.storeSlug}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onToggleStatus}
                        className={`px-6 py-3 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all ${store.is_open ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-green-500 text-white'}`}
                    >
                        {store.is_open ? 'Fechar Loja' : 'Abrir Loja'}
                    </button>
                    <Link href={`/${profile?.profileSlug}/${store.storeSlug}/editar-loja`} className="p-3 bg-secondary rounded-xl hover:bg-foreground hover:text-background transition-all">
                        <Pencil size={16} />
                    </Link>
                </div>
            </div>

            <div className="p-8 space-y-8">
                {/* 1. Métricas principais */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['daily', 'weekly', 'monthly'] as const).map(period => (
                        <div key={period} className="bg-secondary/20 p-4 rounded-2xl border border-border/30">
                            <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">
                                {period === 'daily' ? 'Hoje' : period === 'weekly' ? 'Semana' : 'Mês'}
                            </p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-[10px] font-bold opacity-30">R$</span>
                                <span className="text-xl font-black italic">{metrics[period].revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">{metrics[period].orders} pedidos</p>
                        </div>
                    ))}
                </div>

                {/* 2. Top Produtos e Clientes */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Produtos */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Package size={12} /> Produtos Líderes
                        </h4>
                        <div className="space-y-2">
                            {topProducts.map(([name, stat], i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/10 border border-border/20">
                                    <span className="text-[10px] font-black uppercase tracking-tight truncate max-w-[150px]">{name}</span>
                                    <span className="text-[10px] font-bold text-green-500">{stat.count} un.</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Clientes */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Users size={12} /> Melhores Clientes
                        </h4>
                        <div className="space-y-2">
                            {topCustomers.map((cust, i) => (
                                <Link key={i} href={`/${cust.slug}`} className="flex items-center justify-between p-3 rounded-xl bg-secondary/10 border border-border/20 hover:border-blue-500/30 transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-tight truncate max-w-[120px]">/{cust.slug}</span>
                                    <span className="text-[10px] font-bold text-blue-500">R$ {cust.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 3. Pedidos Pendentes / Ativos (se houver) */}
                {pendingOrders.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-yellow-600 flex items-center gap-2">
                            <Clock size={12} /> Pedidos em Aberto ({pendingOrders.length})
                        </h4>
                        <div className="flex flex-col gap-2">
                            {pendingOrders.map(order => (
                                <div key={order.id} className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 animate-pulse">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase">/{order.buyer_profile_slug} at {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{order.product_name}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black italic">R$ {order.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function FinanceiroPage() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<any>(null)

    useEffect(() => {
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
                const { data: salesData } = await supabase
                    .from('store_sales')
                    .select('*')
                    .in('store_id', myStores.map(s => s.id))
                    .order('created_at', { ascending: false })

                if (salesData) setSales(salesData)
            }

            setLoading(false)
        }

        loadFinanceData()
    }, [])

    const toggleStoreStatus = async (storeId: string) => {
        const store = stores.find(s => s.id === storeId)
        if (!store) return
        const newStatus = !store.is_open
        const { error } = await supabase.from('stores').update({ is_open: newStatus }).eq('id', storeId)
        if (!error) {
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: newStatus } : s))
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Consolidando dados financeiros...</p>
        </div>
    )

    return (
        <div className="relative min-h-screen pb-32 bg-background text-foreground font-sans selection:bg-green-500 selection:text-white">
            {/* Minimal Header */}
            <div className="sticky top-0 z-[40] bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 md:px-8 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-none">Finanças</h1>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Visão Geral da Empresa</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link href="/configuracoes" className="p-2.5 bg-secondary/50 border border-border text-foreground rounded-xl hover:bg-foreground hover:text-background transition-all">
                            <Settings size={18} />
                        </Link>
                        <button onClick={() => router.push('/criar-loja')} className="p-2.5 bg-foreground text-background rounded-xl hover:opacity-90 transition-all shadow-xl">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {stores.length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground opacity-20">
                            <StoreIcon size={40} />
                        </div>
                        <div className="text-center space-y-4">
                            <h2 className="text-2xl font-black uppercase tracking-tighter">Nenhuma loja encontrada</h2>
                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Comece criando sua primeira loja agora mesmo.</p>
                        </div>
                        <button onClick={() => router.push('/criar-loja')} className="px-8 py-4 bg-green-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-green-500/20 hover:scale-105 transition-all">Criar Loja</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {stores.map(store => (
                            <StoreFinancialCard 
                                key={store.id} 
                                store={store} 
                                sales={sales.filter(s => s.store_id === store.id)} 
                                supabase={supabase}
                                onToggleStatus={() => toggleStoreStatus(store.id)}
                                profile={profile}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
