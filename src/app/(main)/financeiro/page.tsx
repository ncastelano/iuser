// src/app/(app)/financeiro/page.tsx
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    TrendingUp,
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
    X,
    CheckCircle2,
    Eye,
    EyeOff,
    Zap,
    Sparkles,
    HandCoins,
    History,
    BanknoteArrowUp,
    BanknoteArrowDown,
    Award,
    Calendar,
    Wallet,
    Building2,
    Star,
    Crown
} from 'lucide-react'
import { useMerchantStore } from '@/store/useMerchantStore'
import { parseCoords } from '@/lib/geo'
import AnimatedBackground from '@/components/AnimatedBackground'

// --- Interfaces ---
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
    store_name?: string
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
        'pending': { label: 'Novo Pedido', color: 'from-blue-500 to-indigo-500', next: 'preparing', nextLabel: 'Aceitar Pedido' },
        'preparing': { label: 'Em Preparo', color: 'from-yellow-500 to-amber-500', next: 'ready', nextLabel: 'Pedido Pronto' },
        'ready': { label: 'Pronto', color: 'from-purple-500 to-pink-500', next: 'paid', nextLabel: 'Finalizar Venda' },
        'paid': { label: 'Finalizado', color: 'from-green-500 to-emerald-500', next: null, nextLabel: '' },
        'rejected': { label: 'Recusado', color: 'from-red-500 to-rose-500', next: null, nextLabel: '' }
    }

    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-black opacity-80 uppercase tracking-wider">#{order.checkout_id.slice(0, 8)}</p>
                            <h2 className="text-2xl font-black italic tracking-tighter">@{order.buyer_profile_slug}</h2>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                            {currentStatus.label}
                        </div>
                    </div>

                    <div className="flex justify-between mt-4">
                        {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                            const isActive = order.status === s;
                            const isCompleted = ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx;
                            return (
                                <div key={s} className="flex flex-col items-center gap-1 flex-1">
                                    <div className={`w-2 h-2 rounded-full transition-all ${isActive || isCompleted ? 'bg-white scale-110' : 'bg-white/30'}`} />
                                    <span className={`text-[8px] font-black uppercase tracking-wider ${isActive || isCompleted ? 'text-white' : 'text-white/50'}`}>
                                        {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Prep' : s === 'ready' ? 'Pronto' : 'Pago'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-orange-50/30">
                    <div className="space-y-3">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-orange-100">
                                <div className="flex-1">
                                    <p className="text-sm font-black uppercase tracking-tight text-gray-800">{item.product_name}</p>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">{item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)}</p>
                                </div>
                                <p className="text-lg font-black italic text-gray-900">R$ {item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-orange-200 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Total do Pedido</span>
                        <span className="text-2xl font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                    </div>

                    <div className="space-y-3">
                        {currentStatus.next && (
                            <button
                                onClick={() => onAction(currentStatus.next!)}
                                className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-sm tracking-wider hover:shadow-lg transition-all active:scale-98"
                            >
                                {currentStatus.nextLabel}
                            </button>
                        )}

                        {order.status === 'pending' && (
                            <button
                                onClick={() => onAction('rejected')}
                                className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-black uppercase text-[10px] tracking-wider hover:bg-red-600 hover:text-white transition-all"
                            >
                                Recusar Pedido
                            </button>
                        )}

                        <button onClick={onClose} className="w-full py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-all">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── COMPONENT: STORE FLOW ────────────────────────────────────────────────────
function StoreFlow({ store, sales, supabase, onToggleStatus, profile, onUpdateOrder }: {
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
        sales.filter(s => s.status === 'paid' || s.status === 'ready').forEach(s => {
            if (!counts[s.product_name]) counts[s.product_name] = { count: 0, total: 0 }
            counts[s.product_name].count += s.quantity
            counts[s.product_name].total += s.price
        })
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 3)
    }, [sales])

    const handleAction = async (status: string) => {
        if (!selectedOrder) return

        const { error: salesError } = await supabase
            .from('store_sales')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        const { error: ordersError } = await supabase
            .from('orders')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        if (!salesError && !ordersError) {
            setSelectedOrder(null)
            onUpdateOrder()
            toast.success(`Pedido ${status === 'preparing' ? 'aceito' : status === 'ready' ? 'marcado como pronto' : 'finalizado'}!`)
        } else {
            toast.error('Erro ao atualizar pedido')
        }
    }

    return (
        <div className="border-b border-orange-100 last:border-b-0 py-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center overflow-hidden">
                            {store.logo_url ? (
                                <img src={supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl} className="w-full h-full object-cover" alt={store.name} />
                            ) : (
                                <StoreIcon className="w-7 h-7 text-orange-500" />
                            )}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${store.is_open ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black italic uppercase tracking-tighter text-gray-900">{store.name}</h3>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">@{store.storeSlug}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleStatus}
                        className={`px-4 py-2 rounded-full font-black uppercase text-[10px] tracking-wider transition-all ${store.is_open
                            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white'
                            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg'
                            }`}
                    >
                        {store.is_open ? 'Fechar Loja' : 'Abrir Loja'}
                    </button>
                    <Link href={`/${profile?.profileSlug}/${store.storeSlug}/editar-loja`} className="p-2 bg-orange-50 rounded-full hover:bg-orange-100 transition-all">
                        <Pencil size={16} className="text-orange-600" />
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Hoje</p>
                    <p className="text-2xl font-black italic text-gray-900 mt-1">R$ {metrics.daily.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] font-bold text-orange-500 mt-1">{metrics.daily.orders} pedidos</p>
                </div>
                <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Ticket Médio</p>
                    <p className="text-2xl font-black italic text-gray-900 mt-1">R$ {metrics.daily.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] font-bold text-gray-500 mt-1">{metrics.total.orders} total</p>
                </div>
            </div>

            {topItems.length > 0 && (
                <div className="mb-6 bg-orange-50/50 rounded-xl p-4 border border-orange-100">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                        <TrendingUp size={12} /> Mais Vendidos
                    </h4>
                    <div className="space-y-2">
                        {topItems.map(([name, data], i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-400 w-4">{i + 1}</span>
                                    <span className="text-xs font-bold text-gray-700">{name}</span>
                                </div>
                                <span className="text-xs font-black text-gray-900">{data.count}x</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-5">
                {invites.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-2">
                            <Clock size={12} /> Novos Pedidos ({invites.length})
                        </h4>
                        {invites.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl mb-2 active:bg-blue-100 cursor-pointer transition-all border border-blue-100"
                            >
                                <div>
                                    <span className="text-base font-black italic text-gray-900">@{order.buyer_profile_slug}</span>
                                    <p className="text-[10px] font-bold text-gray-500 mt-0.5">{order.items.length} itens</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} className="text-blue-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {inPreparo.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-yellow-600 mb-2 flex items-center gap-2">
                            <Package size={12} /> Em Preparo ({inPreparo.length})
                        </h4>
                        {inPreparo.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-yellow-50/50 rounded-xl mb-2 cursor-pointer border border-yellow-100"
                            >
                                <span className="text-base font-black italic text-gray-900">@{order.buyer_profile_slug}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} className="text-yellow-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {forReady.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 mb-2 flex items-center gap-2">
                            <CheckCircle2 size={12} /> Prontos ({forReady.length})
                        </h4>
                        {forReady.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-purple-50/50 rounded-xl mb-2 cursor-pointer border border-purple-100"
                            >
                                <span className="text-base font-black italic text-gray-900">@{order.buyer_profile_slug}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} className="text-purple-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {accepted.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-green-600 mb-2 flex items-center gap-2">
                            <CheckCircle2 size={12} /> Finalizados ({accepted.length})
                        </h4>
                        {accepted.slice(0, 3).map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-green-50/50 rounded-xl mb-2 cursor-pointer border border-green-100"
                            >
                                <span className="text-base font-black italic text-gray-900">@{order.buyer_profile_slug}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} className="text-green-600" />
                                </div>
                            </div>
                        ))}
                        {accepted.length > 3 && (
                            <p className="text-[9px] text-center text-gray-500 mt-1">+{accepted.length - 3} finalizados</p>
                        )}
                    </div>
                )}

                {groupedOrders.length === 0 && (
                    <div className="text-center py-8">
                        <Package size={32} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 font-bold text-sm">Nenhum pedido ainda</p>
                        <p className="text-[10px] text-gray-400 mt-1">Quando chegar um pedido, aparecerá aqui</p>
                    </div>
                )}

                {groupedOrders.length > 0 && (
                    <div className="pt-2">
                        <Link
                            href={`/${profile?.profileSlug}/${store.storeSlug}/pedidos`}
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-600 transition-colors"
                        >
                            Ver histórico desta loja ({groupedOrders.length}) <ArrowUpRight size={12} />
                        </Link>
                    </div>
                )}
            </div>

            {selectedOrder && (
                <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onAction={handleAction} />
            )}
        </div>
    )
}

// ── COMPONENT: CUSTOMER DASHBOARD ────────────────────────────────────────────
function CustomerDashboard({ purchases, profile }: { purchases: Sale[], profile: any }) {
    const [viewMode, setViewMode] = useState<'dashboard' | 'history'>('dashboard')

    // Métricas do consumidor
    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

        const completedPurchases = purchases.filter(p => p.status === 'paid')

        const daily = completedPurchases.filter(p => new Date(p.created_at).getTime() >= today)
        const monthly = completedPurchases.filter(p => new Date(p.created_at).getTime() >= firstDayOfMonth)

        const dailyTotal = daily.reduce((acc, p) => acc + p.price, 0)
        const monthlyTotal = monthly.reduce((acc, p) => acc + p.price, 0)
        const totalSpent = completedPurchases.reduce((acc, p) => acc + p.price, 0)

        const dailyOrders = new Set(daily.map(p => p.checkout_id)).size
        const monthlyOrders = new Set(monthly.map(p => p.checkout_id)).size
        const totalOrders = new Set(completedPurchases.map(p => p.checkout_id)).size

        return {
            daily: { spent: dailyTotal, orders: dailyOrders, avgTicket: dailyOrders > 0 ? dailyTotal / dailyOrders : 0 },
            monthly: { spent: monthlyTotal, orders: monthlyOrders, avgTicket: monthlyOrders > 0 ? monthlyTotal / monthlyOrders : 0 },
            total: { spent: totalSpent, orders: totalOrders, avgTicket: totalOrders > 0 ? totalSpent / totalOrders : 0 }
        }
    }, [purchases])

    // Top produtos comprados
    const topProducts = useMemo(() => {
        const counts: Record<string, { count: number, total: number, store_name: string }> = {}
        purchases.filter(p => p.status === 'paid').forEach(p => {
            if (!counts[p.product_name]) {
                counts[p.product_name] = { count: 0, total: 0, store_name: p.store_name || '' }
            }
            counts[p.product_name].count += p.quantity
            counts[p.product_name].total += p.price
        })
        return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    }, [purchases])

    // Top lojas compradas
    const topStores = useMemo(() => {
        const stores: Record<string, { spent: number, orders: number, items: number }> = {}
        purchases.filter(p => p.status === 'paid').forEach(p => {
            const storeName = p.store_name || 'Loja Desconhecida'
            if (!stores[storeName]) {
                stores[storeName] = { spent: 0, orders: 0, items: 0 }
            }
            stores[storeName].spent += p.price
            stores[storeName].orders += 1
            stores[storeName].items += p.quantity
        })
        return Object.entries(stores)
            .sort((a, b) => b[1].spent - a[1].spent)
            .slice(0, 3)
            .map(([name, data]) => ({ name, ...data }))
    }, [purchases])

    // Compras agrupadas para histórico
    const groupedPurchases = useMemo(() => {
        const groups: Record<string, GroupedOrder> = {}
        purchases.forEach(p => {
            if (!groups[p.checkout_id]) {
                groups[p.checkout_id] = {
                    checkout_id: p.checkout_id,
                    buyer_name: p.buyer_name,
                    buyer_profile_slug: p.buyer_profile_slug,
                    created_at: p.created_at,
                    status: p.status,
                    items: [],
                    totalPrice: 0,
                    store_name: p.store_name
                }
            }
            groups[p.checkout_id].items.push(p)
            groups[p.checkout_id].totalPrice += p.price
        })
        return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [purchases])

    // Nível do consumidor baseado no total gasto
    const customerLevel = useMemo(() => {
        const total = metrics.total.spent
        if (total >= 5000) return { name: 'DIAMOND', icon: Crown, color: 'from-blue-400 to-purple-500', bg: 'bg-gradient-to-r from-blue-50 to-purple-50' }
        if (total >= 2000) return { name: 'PLATINUM', icon: Award, color: 'from-gray-400 to-gray-500', bg: 'bg-gradient-to-r from-gray-50 to-gray-100' }
        if (total >= 500) return { name: 'GOLD', icon: Star, color: 'from-yellow-500 to-amber-500', bg: 'bg-gradient-to-r from-yellow-50 to-amber-50' }
        if (total >= 100) return { name: 'SILVER', icon: Star, color: 'from-gray-400 to-gray-500', bg: 'bg-gradient-to-r from-gray-50 to-gray-100' }
        return { name: 'BRONZE', icon: Star, color: 'from-orange-600 to-red-600', bg: 'bg-gradient-to-r from-orange-50 to-red-50' }
    }, [metrics.total.spent])

    const CustomerLevelIcon = customerLevel.icon

    if (purchases.length === 0) {
        return (
            <div className="text-center py-16 bg-white/50 rounded-2xl">
                <ShoppingBag size={48} className="mx-auto mb-3 text-gray-400" />
                <p className="text-gray-500 font-black text-sm">Nenhuma compra ainda</p>
                <Link href="/" className="inline-block mt-4 text-orange-600 font-black text-[10px] uppercase tracking-wider">
                    Explorar lojas →
                </Link>
            </div>
        )
    }

    return (
        <div>
            {/* Seletor de visualização */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setViewMode('dashboard')}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${viewMode === 'dashboard'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                        : 'bg-white/50 text-gray-600 border border-orange-200'
                        }`}
                >
                    📊 Painel
                </button>
                <button
                    onClick={() => setViewMode('history')}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${viewMode === 'history'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                        : 'bg-white/50 text-gray-600 border border-orange-200'
                        }`}
                >
                    📜 Histórico
                </button>
            </div>

            {viewMode === 'dashboard' ? (
                <div className="space-y-6">
                    {/* Perfil do consumidor */}
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-5 border border-orange-100">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                                {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt={profile.name} />
                                ) : (
                                    <span className="text-2xl font-black text-white">
                                        {profile?.name?.charAt(0) || profile?.profileSlug?.charAt(0) || 'U'}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-xl font-black italic text-gray-900">{profile?.name || 'Consumidor'}</h3>
                                    <div className={`${customerLevel.bg} px-2 py-0.5 rounded-full flex items-center gap-1`}>
                                        <CustomerLevelIcon size={10} className="text-orange-500" />
                                        <span className="text-[8px] font-black uppercase">{customerLevel.name}</span>
                                    </div>
                                </div>
                                <p className="text-[9px] font-bold text-gray-500 mt-1">@{profile?.profileSlug || 'usuario'}</p>
                                <p className="text-[8px] text-gray-400 mt-1">🎉 {metrics.total.orders} pedidos • {metrics.total.spent > 0 ? `R$ ${metrics.total.spent.toFixed(2)} gastos` : 'nenhuma compra ainda'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Cards de gastos */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Calendar size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Hoje</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.daily.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.daily.orders} pedidos</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Calendar size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Este Mês</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.monthly.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.monthly.orders} pedidos</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                            <Wallet size={14} className="text-orange-500 mx-auto mb-1" />
                            <p className="text-[7px] font-black uppercase text-gray-500">Total</p>
                            <p className="text-sm font-black italic text-gray-900">R$ {metrics.total.spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[8px] font-bold text-gray-400">{metrics.total.orders} pedidos</p>
                        </div>
                    </div>

                    {/* Ticket médio */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                            <p className="text-[7px] font-black uppercase text-gray-500">Ticket Médio (Mês)</p>
                            <p className="text-lg font-black italic text-orange-600">R$ {metrics.monthly.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                            <p className="text-[7px] font-black uppercase text-gray-500">Ticket Médio (Geral)</p>
                            <p className="text-lg font-black italic text-orange-600">R$ {metrics.total.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    {/* Top produtos */}
                    {topProducts.length > 0 && (
                        <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                            <h4 className="text-[9px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                                <TrendingUp size={12} /> O que mais comprei
                            </h4>
                            <div className="space-y-2">
                                {topProducts.map(([name, data], i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-gray-400 w-4">{i + 1}°</span>
                                            <div>
                                                <span className="text-[9px] font-bold text-gray-800">{name}</span>
                                                <p className="text-[7px] text-gray-400">{data.store_name}</p>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-900">{data.count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top lojas */}
                    {topStores.length > 0 && (
                        <div className="bg-white/50 rounded-xl p-4 border border-orange-100">
                            <h4 className="text-[9px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                                <Building2 size={12} /> Onde mais comprei
                            </h4>
                            <div className="space-y-3">
                                {topStores.map((store, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-gray-400 w-4">{i + 1}°</span>
                                            <span className="text-[9px] font-bold text-gray-800">{store.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-black text-orange-600">R$ {store.spent.toFixed(2)}</span>
                                            <p className="text-[6px] text-gray-400">{store.orders} pedidos</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Histórico de compras */
                <div className="space-y-4">
                    {groupedPurchases.map((order) => (
                        <div key={order.checkout_id} className="bg-white rounded-xl p-4 border border-orange-100">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                                        {new Date(order.created_at).toLocaleDateString('pt-BR')} • {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <h3 className="text-sm font-black italic text-gray-900 mt-1">{order.store_name}</h3>
                                </div>
                                <div className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-wider ${order.status === 'paid' ? 'bg-green-100 text-green-700' :
                                    order.status === 'preparing' ? 'bg-yellow-100 text-yellow-700' :
                                        order.status === 'ready' ? 'bg-purple-100 text-purple-700' :
                                            'bg-blue-100 text-blue-700'
                                    }`}>
                                    {order.status === 'paid' ? 'Finalizado' :
                                        order.status === 'preparing' ? 'Preparando' :
                                            order.status === 'ready' ? 'Pronto' : 'Processando'}
                                </div>
                            </div>

                            <div className="space-y-1 mb-3">
                                {order.items.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-[9px]">
                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                        <span className="font-bold text-gray-800">R$ {(item.price).toFixed(2)}</span>
                                    </div>
                                ))}
                                {order.items.length > 3 && (
                                    <p className="text-[8px] text-gray-400">+{order.items.length - 3} outros itens</p>
                                )}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-orange-100">
                                <span className="text-[8px] font-black uppercase text-gray-500">Total</span>
                                <span className="text-base font-black italic text-orange-600">R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}

                    {groupedPurchases.length === 0 && (
                        <div className="text-center py-8">
                            <Package size={32} className="mx-auto mb-2 text-gray-300" />
                            <p className="text-gray-500 font-bold text-sm">Nenhum pedido encontrado</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────
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

    const loadFinanceData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // Carrega perfil
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            setProfile(profileData)

            // Carrega lojas do usuário
            const { data: myStores } = await supabase.from('stores').select('*').eq('owner_id', user.id)
            if (myStores) {
                setStores(myStores)

                // Se tem lojas, busca os pedidos
                if (myStores.length > 0) {
                    const storeIds = myStores.map(s => s.id)

                    // Busca da tabela orders (sistema atualizado)
                    const { data: ordersData } = await supabase
                        .from('orders')
                        .select('*, order_items(*)')
                        .in('store_id', storeIds)
                        .order('created_at', { ascending: false })

                    if (ordersData && ordersData.length > 0) {
                        const formattedSales: Sale[] = []
                        ordersData.forEach(order => {
                            if (order.order_items && order.order_items.length > 0) {
                                order.order_items.forEach((item: any) => {
                                    formattedSales.push({
                                        id: item.id,
                                        created_at: order.created_at,
                                        price: item.total_price || item.price,
                                        quantity: item.quantity,
                                        product_name: item.product_name,
                                        buyer_id: order.buyer_id,
                                        buyer_name: order.buyer_name,
                                        buyer_profile_slug: order.buyer_profile_slug,
                                        store_id: order.store_id,
                                        status: order.status,
                                        checkout_id: order.checkout_id
                                    })
                                })
                            }
                        })
                        setSales(formattedSales)
                    } else {
                        // Se não tem na orders, busca na store_sales (legado)
                        const { data: storeSalesData } = await supabase
                            .from('store_sales')
                            .select('*')
                            .in('store_id', storeIds)
                            .order('created_at', { ascending: false })

                        if (storeSalesData) {
                            setSales(storeSalesData as Sale[])
                        }
                    }
                }
            }

            // Carrega compras do usuário (Painel do Consumidor)
            const { data: userPurchases } = await supabase
                .from('orders')
                .select('*, order_items(*), stores(name)')
                .eq('buyer_id', user.id)
                .order('created_at', { ascending: false })

            if (userPurchases && userPurchases.length > 0) {
                const formattedPurchases: Sale[] = []
                userPurchases.forEach(order => {
                    if (order.order_items && order.order_items.length > 0) {
                        order.order_items.forEach((item: any) => {
                            formattedPurchases.push({
                                id: item.id,
                                created_at: order.created_at,
                                price: item.total_price || item.price,
                                quantity: item.quantity,
                                product_name: item.product_name,
                                buyer_id: order.buyer_id,
                                buyer_name: order.buyer_name,
                                buyer_profile_slug: order.buyer_profile_slug,
                                store_id: order.store_id,
                                status: order.status,
                                checkout_id: order.checkout_id,
                                store_name: order.stores?.name
                            })
                        })
                    }
                })
                setMyPurchases(formattedPurchases)
            } else {
                // Fallback para store_sales legado
                const { data: legacyPurchases } = await supabase
                    .from('store_sales')
                    .select('*, stores(name)')
                    .eq('buyer_id', user.id)
                    .order('created_at', { ascending: false })

                if (legacyPurchases) {
                    setMyPurchases(legacyPurchases.map((p: any) => ({
                        ...p,
                        store_name: p.stores?.name
                    })))
                }
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error)
            toast.error('Erro ao carregar dados financeiros')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadFinanceData()

        // Realtime para atualizações
        const channel = supabase.channel('financeiro-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadFinanceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales' }, () => loadFinanceData())
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    const toggleStoreStatus = async (storeId: string) => {
        const store = stores.find(s => s.id === storeId)
        if (!store) return
        const newStatus = !store.is_open
        const { error } = await supabase.from('stores').update({ is_open: newStatus }).eq('id', storeId)
        if (!error) {
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: newStatus } : s))
            toast.success(`Loja ${newStatus ? 'aberta' : 'fechada'}!`)
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex flex-col items-center justify-center gap-3">
            <AnimatedBackground />
            <div className="relative z-10 w-10 h-10 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            <p className="relative z-10 text-[10px] font-black uppercase tracking-wider text-gray-600 animate-pulse">Carregando iUser Finanças...</p>
        </div>
    )

    return (
        <div className="relative min-h-screen pb-24 bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                            <TrendingUp size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Finanças</h1>
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Gestão completa</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-orange-100 rounded-full p-0.5">
                            <button
                                onClick={() => setViewOrder(['merchant', 'customer'])}
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewOrder[0] === 'merchant'
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                    : 'text-gray-600'
                                    }`}
                            >
                                <BanknoteArrowDown size={12} />
                                Vendas
                            </button>
                            <button
                                onClick={() => setViewOrder(['customer', 'merchant'])}
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewOrder[0] === 'customer'
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                    : 'text-gray-600'
                                    }`}
                            >
                                <BanknoteArrowUp size={12} />
                                Compras
                            </button>
                        </div>

                        <Link href="/configuracoes" className="p-2 bg-orange-100 rounded-full hover:bg-orange-200 transition-all">
                            <Settings size={16} className="text-orange-600" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="relative z-10 px-4 py-6 max-w-3xl mx-auto">
                {viewOrder.map(section => (
                    <div key={section} className="mb-12">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-black italic uppercase tracking-wider text-gray-700">
                                {section === 'merchant' ? '🏪 Painel do Vendedor' : '🛍️ Painel do Consumidor'}
                            </h2>
                            {section === 'merchant' && stores.length > 0 && (
                                <button onClick={() => router.push('/criar-loja')} className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black uppercase text-[8px] tracking-wider hover:shadow-lg transition-all">
                                    <Plus size={12} /> Nova Loja
                                </button>
                            )}
                        </div>

                        {section === 'merchant' ? (
                            stores.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                                        <StoreIcon size={32} className="text-orange-500" />
                                    </div>
                                    <p className="text-gray-700 font-black uppercase tracking-wider text-sm mb-4">Nenhuma loja criada</p>
                                    <button onClick={() => router.push('/criar-loja')} className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all">
                                        Criar minha primeira loja
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {stores.map(store => (
                                        <StoreFlow
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
                            <CustomerDashboard purchases={myPurchases} profile={profile} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}