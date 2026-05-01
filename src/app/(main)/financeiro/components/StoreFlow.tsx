'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    TrendingUp,
    ArrowUpRight,
    Pencil,
    ChevronRight,
    Clock,
    Store as StoreIcon,
    Package,
    CheckCircle2
} from 'lucide-react'
import { Store, Sale, GroupedOrder } from '../types'
import { OrderModal } from './OrderModal'

interface StoreFlowProps {
    store: Store
    sales: Sale[]
    supabase: any
    onToggleStatus: () => void
    profile: any
    onUpdateOrder: () => void
}

export function StoreFlow({ store, sales, supabase, onToggleStatus, profile, onUpdateOrder }: StoreFlowProps) {
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