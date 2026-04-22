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
    Settings,
    ShoppingBag
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

// ── COMPONENT: ORDER MODAL ───────────────────────────────────────────────────
function OrderModal({ order, onClose, onAction }: { order: GroupedOrder, onClose: () => void, onAction: (status: string) => void }) {
    const statusMap = {
        'pending': { label: 'Novo Convite', color: 'bg-blue-500/10 text-blue-600', next: 'preparing', nextLabel: 'Aceitar e Preparar' },
        'preparing': { label: 'Em Preparo', color: 'bg-yellow-500/10 text-yellow-600', next: 'ready', nextLabel: 'Marcar como Pronto' },
        'ready': { label: 'Pronto / Enviado', color: 'bg-purple-500/10 text-purple-600', next: 'paid', nextLabel: 'Finalizar Pedido (Pago)' },
        'paid': { label: 'Finalizado', color: 'bg-green-500/10 text-green-500', next: null, nextLabel: '' },
        'rejected': { label: 'Recusado', color: 'bg-destructive/10 text-destructive', next: null, nextLabel: '' }
    }

    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={onClose} />
            <div className="relative bg-card border border-border w-full max-w-lg rounded-none shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Status Timeline Header */}
                <div className="bg-secondary/30 p-6 flex justify-around items-center border-b border-border/50">
                    {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${
                                order.status === s ? 'bg-foreground text-background scale-110' : 
                                ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground opacity-30'
                            }`}>
                                {idx + 1}
                            </div>
                            <span className={`text-[7px] font-black uppercase tracking-widest ${order.status === s ? 'text-foreground' : 'text-muted-foreground opacity-50'}`}>
                                {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Preparo' : s === 'ready' ? 'Pronto' : 'Pago'}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="p-8 space-y-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">ID Checkout: {order.checkout_id.slice(0, 8)}</p>
                            <h2 className="text-3xl font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</h2>
                        </div>
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${currentStatus.color}`}>
                            {currentStatus.label}
                        </div>
                    </div>

                    <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-secondary/20 rounded-none border border-border/30 group hover:border-foreground/20 transition-all">
                                <div>
                                    <p className="text-sm font-black uppercase tracking-tight">{item.product_name}</p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)}</p>
                                </div>
                                <p className="text-sm font-black italic">R$ {item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-border flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">Total Líquido</span>
                        <span className="text-4xl font-black italic tracking-tighter">R$ {order.totalPrice.toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {currentStatus.next && (
                            <button 
                                onClick={() => onAction(currentStatus.next!)}
                                className="py-5 bg-foreground text-background rounded-none font-black uppercase text-xs tracking-[0.2em] hover:bg-green-500 hover:text-white transition-all shadow-xl active:scale-[0.98]"
                            >
                                {currentStatus.nextLabel}
                            </button>
                        )}
                        
                        {order.status === 'pending' && (
                            <button 
                                onClick={() => onAction('rejected')}
                                className="py-4 bg-destructive/5 text-destructive border border-destructive/10 rounded-none font-black uppercase text-[10px] tracking-widest hover:bg-destructive hover:text-white transition-all"
                            >
                                Recusar Pedido
                            </button>
                        )}

                        <button onClick={onClose} className="py-4 text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-all">
                            Fechar Visualização
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── COMPONENT: STORE FINANCIAL CARD ───────────────────────────────────────────
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
    const [showFullHistory, setShowFullHistory] = useState(false)

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
        const weekDate = new Date(now)
        const startOfWeek = new Date(weekDate.setDate(weekDate.getDate() - weekDate.getDay())).getTime()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

        const filterByDate = (start: number) => sales.filter(s => new Date(s.created_at).getTime() >= start && (s.status === 'paid' || s.status === 'ready' || s.status === 'preparing'))

        const daily = filterByDate(today)
        const weekly = filterByDate(startOfWeek)
        const monthly = filterByDate(startOfMonth)

        const calcTotal = (list: Sale[]) => list.reduce((acc, s) => acc + s.price, 0)
        const calcOrders = (list: Sale[]) => new Set(list.map(d => d.checkout_id)).size

        const dailyRev = calcTotal(daily)
        const dailyOrd = calcOrders(daily)

        return {
            daily: { revenue: dailyRev, orders: dailyOrd, avgTicket: dailyOrd > 0 ? dailyRev / dailyOrd : 0 },
            weekly: { revenue: calcTotal(weekly), orders: calcOrders(weekly) },
            monthly: { revenue: calcTotal(monthly), orders: calcOrders(monthly) },
            total: { revenue: calcTotal(sales.filter(s => s.status === 'paid')), orders: calcOrders(sales.filter(s => s.status === 'paid')) }
        }
    }, [sales])

    const topItems = useMemo(() => {
        const counts: Record<string, { count: number, total: number }> = {}
        sales.filter(s => s.status === 'paid' || s.status === 'ready').forEach(s => {
            if (!counts[s.product_name]) counts[s.product_name] = { count: 0, total: 0 }
            counts[s.product_name].count += s.quantity
            counts[s.product_name].total += s.price
        })
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    }, [sales])

    const handleAction = async (status: string) => {
        if (!selectedOrder) return

        // 1. Atualizar na tabela legado store_sales
        const { error: legacyError } = await supabase
            .from('store_sales')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        if (legacyError) console.error('[Financeiro] Erro ao atualizar status (legado):', legacyError)

        // 2. Atualizar na nova tabela orders (se existir)
        await supabase
            .from('orders')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        setSelectedOrder(null)
        onUpdateOrder()
    }

    return (
        <div className="bg-card border border-border/50 rounded-none overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500">
            {/* Header com Status */}
            <div className="p-6 border-b border-border/50 bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-none overflow-hidden bg-background border border-border shadow-sm">
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
                        className={`px-6 py-3 rounded-none font-black uppercase text-[9px] tracking-widest transition-all ${store.is_open ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-green-500 text-white'}`}
                    >
                        {store.is_open ? 'Fechar Loja' : 'Abrir Loja'}
                    </button>
                    <Link href={`/${profile?.profileSlug}/${store.storeSlug}/editar-loja`} className="p-3 bg-secondary rounded-none hover:bg-foreground hover:text-background transition-all">
                        <Pencil size={16} />
                    </Link>
                </div>
            </div>

            <div className="p-8 space-y-12">
                {/* 1. Métricas iFood Level */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/20 p-6 rounded-none border border-border/30">
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Hoje</p>
                        <p className="text-2xl font-black italic tracking-tighter">R$ {metrics.daily.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] font-bold text-green-500 mt-1 uppercase">{metrics.daily.orders} pedidos</p>
                    </div>
                    <div className="bg-secondary/20 p-6 rounded-none border border-border/30">
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Ticket Médio</p>
                        <p className="text-2xl font-black italic tracking-tighter">R$ {metrics.daily.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">Média p/ Pedido</p>
                    </div>
                    <div className="bg-secondary/20 p-6 rounded-none border border-border/30">
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Volume Mês</p>
                        <p className="text-2xl font-black italic tracking-tighter">R$ {metrics.monthly.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">{metrics.monthly.orders} pedidos</p>
                    </div>
                    <div className="bg-secondary/20 p-6 rounded-none border border-border/30">
                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Total Geral</p>
                        <p className="text-2xl font-black italic tracking-tighter">R$ {metrics.total.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">{metrics.total.orders} concluídos</p>
                    </div>
                </div>

                {/* 1.1 Desempenho de Itens */}
                <div className="bg-secondary/10 p-6 rounded-none border border-border/20">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground mb-6 flex items-center gap-2">
                        <TrendingUp size={12} /> Desempenho de Produtos
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {topItems.map(([name, data], i) => (
                            <div key={i} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-[10px] font-black">{i + 1}</div>
                                    <span className="text-[10px] font-black uppercase truncate max-w-[120px]">{name}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black">{data.count} un.</p>
                                    <p className="text-[8px] font-bold text-muted-foreground tracking-tighter">R$ {data.total.toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Seções de Pedidos (Estilo iFood) */}
                <div className="space-y-12">
                    {/* NOVOS PEDIDOS (PENDING) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 flex items-center gap-2">
                                <Clock size={12} className="animate-pulse" /> Novos Pedidos ({invites.length})
                            </h4>
                            <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-40">Responder Agora</span>
                        </div>
                        <div className="grid gap-3">
                            {invites.length === 0 ? (
                                <p className="text-[10px] font-bold text-muted-foreground uppercase italic p-6 border border-dashed border-border rounded-none text-center opacity-30">Nenhum novo pedido</p>
                            ) : (
                                invites.map(order => (
                                    <div 
                                        key={order.checkout_id} 
                                        onClick={() => setSelectedOrder(order)}
                                        className="flex items-center justify-between p-6 rounded-none bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 cursor-pointer transition-all animate-in slide-in-from-right duration-500 group"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-lg font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</span>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase">{order.items.length} {order.items.length === 1 ? 'item' : 'itens'} • {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="text-right flex items-center gap-4">
                                            <span className="text-xl font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <ChevronRight className="w-5 h-5 text-blue-600" />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* EM PREPARO (PREPARING) */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-yellow-600 flex items-center gap-2">
                            <Package size={12} className="animate-spin-slow" /> Em Preparação ({inPreparo.length})
                        </h4>
                        <div className="grid gap-3">
                            {inPreparo.map(order => (
                                <div 
                                    key={order.checkout_id} 
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-6 rounded-none bg-yellow-500/5 border border-yellow-500/20 hover:bg-yellow-500/10 cursor-pointer transition-all"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-lg font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase">Cozinha está preparando...</span>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <span className="text-xl font-black italic text-yellow-600">R$ {order.totalPrice.toFixed(2)}</span>
                                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                                            <ChevronRight className="w-5 h-5 text-yellow-600" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PRONTOS PARA ENTREGA (READY) */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-600 flex items-center gap-2">
                            <Package size={12} /> Para Entrega/Retirada ({forReady.length})
                        </h4>
                        <div className="grid gap-3">
                            {forReady.map(order => (
                                <div 
                                    key={order.checkout_id} 
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-6 rounded-none bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10 cursor-pointer transition-all"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-lg font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</span>
                                        <span className="text-[9px] font-bold text-purple-500/60 uppercase">Pronto para o cliente!</span>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <span className="text-xl font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                            <ChevronRight className="w-5 h-5 text-purple-600" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FINALIZADOS (PAID) */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-green-500 flex items-center gap-2">
                            <CheckCircle2 size={12} /> Histórico de Recebidos ({accepted.length})
                        </h4>
                        <div className="grid gap-3">
                            {accepted.slice(0, 3).map(order => (
                                <div 
                                    key={order.checkout_id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="flex items-center justify-between p-6 rounded-none bg-secondary/10 border border-border/20 hover:bg-secondary/20 cursor-pointer transition-all opacity-70 group"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-lg font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <span className="text-xl font-black italic">R$ {order.totalPrice.toFixed(2)}</span>
                                            <p className="text-[8px] font-black text-green-500 uppercase">Recebido</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {accepted.length > 3 && (
                                <button 
                                    onClick={() => setShowFullHistory(true)}
                                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all pt-2 w-full text-center py-4 bg-secondary/5 rounded-none border border-dashed border-border"
                                >
                                    Ver Relatório Completo de Vendas &rarr;
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* FULL HISTORY MODAL (iFood Level) */}
            {showFullHistory && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={() => setShowFullHistory(false)} />
                    <div className="relative bg-card border border-border w-full max-w-2xl rounded-none shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-500 max-h-[80vh] flex flex-col">
                        <div className="p-8 border-b border-border flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">Relatório de <span className="text-green-500">Vendas</span></h2>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">Histórico completo: {accepted.length} pedidos finalizados</p>
                            </div>
                            <button onClick={() => setShowFullHistory(false)} className="w-12 h-12 rounded-none bg-secondary flex items-center justify-center hover:bg-foreground hover:text-background transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
                            {accepted.map(order => (
                                <div key={order.checkout_id} onClick={() => { setSelectedOrder(order); setShowFullHistory(false); }} className="flex items-center justify-between p-6 rounded-none bg-secondary/20 border border-border/30 hover:border-green-500/30 transition-all cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-[10px] font-black">
                                            {new Date(order.created_at).getDate()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black italic uppercase tracking-tighter">/{order.buyer_profile_slug}</p>
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase">{new Date(order.created_at).toLocaleDateString('pt-BR')} • {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black italic">R$ {order.totalPrice.toFixed(2)}</p>
                                        <p className="text-[8px] font-black text-green-500 uppercase tracking-widest">Concluído</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 bg-secondary/30 border-t border-border flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest">Volume Total Líquido</span>
                            <span className="text-3xl font-black italic tracking-tighter">R$ {accepted.reduce((acc, o) => acc + o.totalPrice, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <OrderModal 
                    order={selectedOrder} 
                    onClose={() => setSelectedOrder(null)} 
                    onAction={handleAction}
                />
            )}
        </div>
    )
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────
import { CheckCircle2, X } from 'lucide-react'

export default function FinanceiroPage() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [sales, setSales] = useState<Sale[]>([])
    const [myPurchases, setMyPurchases] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<any>(null)
    const [viewMode, setViewMode] = useState<'merchant' | 'customer'>('merchant')

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
            // Tentar buscar da nova estrutura normalizada
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .in('store_id', myStores.map(s => s.id))
                .order('created_at', { ascending: false })

            if (ordersData && ordersData.length > 0) {
                // Converter estrutura normalizada para o formato Sale esperado pelos componentes atuais
                const mappedSales: Sale[] = ordersData.flatMap(o => o.order_items.map((i: any) => ({
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
                setSales(mappedSales)
            } else {
                // Fallback para store_sales se a migração ainda não ocorreu ou não há pedidos novos
                const { data: legacySales } = await supabase
                    .from('store_sales')
                    .select('*')
                    .in('store_id', myStores.map(s => s.id))
                    .order('created_at', { ascending: false })
                if (legacySales) setSales(legacySales)
            }
        }

        // Fetch user's own purchases
        const { data: purchaseData } = await supabase
            .from('store_sales')
            .select('*, stores(name)')
            .eq('buyer_id', user.id)
            .order('created_at', { ascending: false })
        
        if (purchaseData) {
            const mappedPurchases = purchaseData.map((p: any) => ({
                ...p,
                store_name: p.stores?.name || 'Loja'
            }))
            setMyPurchases(mappedPurchases)
        }

        setLoading(false)
    }

    useEffect(() => {
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
                        <div className="w-10 h-10 rounded-none bg-green-500/10 flex items-center justify-center text-green-500">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-none">Finanças</h1>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                {viewMode === 'merchant' ? 'Gestão de Vendas & Convites' : 'Extrato de Compras Pessoais'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Toggle Mode */}
                        <div className="flex bg-secondary/50 p-1 rounded-none border border-border">
                            <button 
                                onClick={() => setViewMode('merchant')}
                                className={`px-4 py-1.5 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'merchant' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Empresa
                            </button>
                            <button 
                                onClick={() => setViewMode('customer')}
                                className={`px-4 py-1.5 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'customer' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Pessoal
                            </button>
                        </div>
                        <Link href="/configuracoes" className="p-2.5 bg-secondary/50 border border-border text-foreground rounded-none hover:bg-foreground hover:text-background transition-all">
                            <Settings size={18} />
                        </Link>
                        <button onClick={() => router.push('/criar-loja')} className="p-2.5 bg-foreground text-background rounded-none hover:opacity-90 transition-all shadow-xl">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                {viewMode === 'merchant' ? (
                    stores.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center gap-6">
                            <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground opacity-20">
                                <StoreIcon size={40} />
                            </div>
                            <div className="text-center space-y-4">
                                <h2 className="text-2xl font-black uppercase tracking-tighter">Nenhuma loja encontrada</h2>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Comece criando sua primeira loja agora mesmo.</p>
                            </div>
                            <button onClick={() => router.push('/criar-loja')} className="px-8 py-4 bg-green-500 text-white rounded-none font-black uppercase text-[10px] tracking-widest shadow-lg shadow-green-500/20 hover:scale-105 transition-all">Criar Loja</button>
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
                                    onUpdateOrder={loadFinanceData}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    /* Customer Mode: Extrato de Compras */
                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">Meu<span className="text-green-500">Extrato</span></h2>
                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Histórico completo de suas movimentações</p>
                            </div>
                            <div className="bg-card border border-border p-6 rounded-none flex items-center gap-6 shadow-sm">
                                <div className="p-4 bg-green-500/10 rounded-none text-green-500">
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Gasto</p>
                                    <p className="text-3xl font-black italic tracking-tighter">
                                        R$ {myPurchases.reduce((acc, p) => acc + p.price, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        </header>

                        <div className="grid gap-4">
                            {myPurchases.length === 0 ? (
                                <div className="py-32 text-center border border-dashed border-border rounded-none bg-card/40">
                                    <ShoppingBag size={48} className="mx-auto mb-6 text-muted-foreground opacity-20" />
                                    <p className="text-muted-foreground font-black uppercase tracking-widest text-sm">Você ainda não realizou compras</p>
                                    <Link href="/" className="inline-block mt-8 text-green-500 font-black uppercase text-[10px] tracking-[0.3em] hover:opacity-80 transition-all">Explorar Lojas &rarr;</Link>
                                </div>
                            ) : (
                                Object.values(myPurchases.reduce((groups: any, p) => {
                                    if (!groups[p.checkout_id]) {
                                        groups[p.checkout_id] = {
                                            checkout_id: p.checkout_id,
                                            store_name: (p as any).store_name,
                                            created_at: p.created_at,
                                            status: p.status,
                                            total: 0,
                                            items: []
                                        }
                                    }
                                    groups[p.checkout_id].total += p.price
                                    groups[p.checkout_id].items.push(p)
                                    return groups
                                }, {})).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((order: any) => (
                                    <div key={order.checkout_id} className="group bg-card border border-border/50 rounded-none p-6 md:p-8 hover:border-green-500/30 transition-all duration-300 shadow-sm hover:shadow-xl">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-center gap-6">
                                                <div className="w-16 h-16 rounded-none bg-secondary flex items-center justify-center text-muted-foreground/30 border border-border">
                                                    <StoreIcon size={24} />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR')} às {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                    <h3 className="text-2xl font-black italic uppercase tracking-tighter">{order.store_name}</h3>
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{order.items.length} {order.items.length === 1 ? 'produto' : 'produtos'}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between md:justify-end gap-8">
                                                <div className="text-right">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Valor Total</p>
                                                    <p className="text-3xl font-black italic tracking-tighter">R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                                <div className={`px-4 py-2 rounded-none text-[10px] font-black uppercase tracking-widest shadow-inner ${
                                                    order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                                                    order.status === 'accepted' ? 'bg-green-500 text-white' :
                                                    order.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                                                    'bg-destructive/10 text-destructive'
                                                }`}>
                                                    {order.status === 'pending' ? 'Pendente' : 
                                                     order.status === 'accepted' ? 'Aguardando' :
                                                     order.status === 'paid' ? 'Finalizado' : 'Cancelado'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Item details preview */}
                                        <div className="mt-6 pt-6 border-t border-border/30 flex flex-wrap gap-2">
                                            {order.items.map((item: any, idx: number) => (
                                                <div key={idx} className="px-3 py-1 bg-secondary/50 rounded-lg text-[9px] font-bold text-muted-foreground border border-border">
                                                    {item.quantity}x {item.product_name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
