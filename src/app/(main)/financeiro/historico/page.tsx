// src/app/(app)/financeiro/historico/page.tsx
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, ShoppingBag, Calendar, ArrowUpRight, Package, History, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'

interface Sale {
    id: string
    created_at: string
    price: number
    quantity: number
    product_name: string
    buyer_name: string
    buyer_profile_slug: string
    store_id: string
    status: 'pending' | 'preparing' | 'ready' | 'paid' | 'rejected'
    checkout_id: string
}

interface Store {
    id: string
    name: string
    storeSlug: string
}

export default function HistoricoVendasPage() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [sales, setSales] = useState<Sale[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'ready' | 'preparing' | 'pending'>('all')
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }

            const { data: myStores } = await supabase.from('stores').select('id, name, storeSlug').eq('owner_id', user.id)
            if (myStores?.length) {
                setStores(myStores)

                // Busca da tabela orders
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*, order_items(*)')
                    .in('store_id', myStores.map(s => s.id))
                    .order('created_at', { ascending: false })

                if (ordersData && ordersData.length > 0) {
                    const formattedSales: Sale[] = []
                    ordersData.forEach(order => {
                        if (order.order_items && order.order_items.length > 0) {
                            order.order_items.forEach((item: any) => {
                                formattedSales.push({
                                    id: item.id,
                                    created_at: order.created_at,
                                    price: item.price,
                                    quantity: item.quantity,
                                    product_name: item.product_name,
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
                    // Fallback para store_sales
                    const { data: salesData } = await supabase
                        .from('store_sales')
                        .select('*')
                        .in('store_id', myStores.map(s => s.id))
                        .order('created_at', { ascending: false })
                    if (salesData) setSales(salesData as Sale[])
                }
            }
            setLoading(false)
        }
        load()
    }, [])

    // Agrupar por checkout_id
    const groupedOrders = useMemo(() => {
        const groups: Record<string, any> = {}
        sales.forEach(sale => {
            if (!groups[sale.checkout_id]) {
                groups[sale.checkout_id] = {
                    checkout_id: sale.checkout_id,
                    buyer_profile_slug: sale.buyer_profile_slug,
                    buyer_name: sale.buyer_name,
                    created_at: sale.created_at,
                    status: sale.status,
                    total: 0,
                    items: [],
                    store_id: sale.store_id
                }
            }
            groups[sale.checkout_id].total += sale.price
            groups[sale.checkout_id].items.push(sale)
        })
        return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [sales])

    // Filtrar
    const filtered = useMemo(() => {
        return groupedOrders.filter(order => {
            const matchSearch = searchQuery === '' ||
                order.buyer_profile_slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.items.some((item: any) => item.product_name?.toLowerCase().includes(searchQuery.toLowerCase()))
            const matchStatus = statusFilter === 'all' || order.status === statusFilter
            return matchSearch && matchStatus
        })
    }, [groupedOrders, searchQuery, statusFilter])

    // Verificar se há um pedido específico para expandir
    useEffect(() => {
        const pedidoId = searchParams.get('pedido')
        if (pedidoId) {
            setExpandedOrder(pedidoId)
        }
    }, [searchParams])

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'paid': return { label: 'Finalizado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
            case 'ready': return { label: 'Pronto', color: 'bg-purple-100 text-purple-700', icon: CheckCircle2 }
            case 'preparing': return { label: 'Preparo', color: 'bg-yellow-100 text-yellow-700', icon: Clock }
            case 'pending': return { label: 'Pendente', color: 'bg-blue-100 text-blue-700', icon: Clock }
            default: return { label: status, color: 'bg-gray-100 text-gray-700', icon: Package }
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
            <AnimatedBackground />
            <div className="relative z-10 w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
    )

    // Totais
    const totalRevenue = sales.reduce((acc, s) => acc + (s.status === 'paid' ? s.price : 0), 0)
    const totalOrders = groupedOrders.length
    const completedOrders = groupedOrders.filter(o => o.status === 'paid').length

    return (
        <div className="relative min-h-screen pb-8 bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            {/* Header */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="w-10 h-10 rounded-full bg-white shadow-md border border-orange-100 flex items-center justify-center hover:shadow-lg transition-all"
                        >
                            <ArrowLeft className="w-5 h-5 text-orange-600" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                Histórico de Vendas
                            </h1>
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                                Todas as transações realizadas
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/financeiro"
                        className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full text-[7px] font-black uppercase tracking-wider"
                    >
                        Voltar ao Financeiro
                    </Link>
                </div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-6">
                {/* Cards de resumo */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/40 rounded-xl p-3 border border-orange-100 text-center">
                        <p className="text-[7px] font-black uppercase text-gray-500">Total de Pedidos</p>
                        <p className="text-xl font-black text-gray-900">{totalOrders}</p>
                    </div>
                    <div className="bg-white/40 rounded-xl p-3 border border-orange-100 text-center">
                        <p className="text-[7px] font-black uppercase text-gray-500">Concluídos</p>
                        <p className="text-xl font-black text-green-600">{completedOrders}</p>
                    </div>
                    <div className="bg-white/40 rounded-xl p-3 border border-orange-100 text-center">
                        <p className="text-[7px] font-black uppercase text-gray-500">Receita Total</p>
                        <p className="text-xl font-black text-orange-600">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                {/* Filtros */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente ou produto..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {(['all', 'pending', 'preparing', 'ready', 'paid'] as const).map(s => {
                            const labels = { all: 'Todos', pending: 'Pendentes', preparing: 'Preparo', ready: 'Prontos', paid: 'Finalizados' }
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${statusFilter === s
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow'
                                        : 'bg-white border border-orange-200 text-gray-600'
                                        }`}
                                >
                                    {labels[s]}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Lista de pedidos */}
                {filtered.length === 0 ? (
                    <div className="bg-white/60 rounded-2xl p-12 text-center border border-orange-200/50">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold">Nenhuma venda encontrada</p>
                        <p className="text-[9px] text-gray-400 mt-1">Tente ajustar os filtros</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((order: any) => {
                            const statusConfig = getStatusConfig(order.status)
                            const StatusIcon = statusConfig.icon
                            const store = stores.find(s => s.id === order.store_id)
                            const isExpanded = expandedOrder === order.checkout_id

                            return (
                                <div
                                    key={order.checkout_id}
                                    className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-100 overflow-hidden hover:shadow-md transition-all"
                                >
                                    <div
                                        className="p-4 cursor-pointer"
                                        onClick={() => setExpandedOrder(isExpanded ? null : order.checkout_id)}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                                                        #{order.checkout_id.slice(0, 8)}
                                                    </p>
                                                    <span className={`text-[6px] font-black px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                                                        {statusConfig.label}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-black text-gray-900 mt-1">{store?.name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-base font-black text-orange-600">R$ {order.total.toFixed(2)}</p>
                                                <p className="text-[8px] text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                                    <span className="text-[10px] font-black text-orange-600">
                                                        @
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-[7px] font-black uppercase text-gray-500">Cliente</p>
                                                    <p className="text-xs font-black text-gray-900">@{order.buyer_profile_slug}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-[8px] text-gray-400">
                                                <span>{order.items.length} itens</span>
                                                <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-orange-100 p-4 bg-orange-50/30 space-y-3">
                                            <p className="text-[8px] font-black uppercase text-gray-500 mb-2">Itens do pedido</p>
                                            {order.items.map((item: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center py-2 border-b border-orange-100 last:border-0">
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900">{item.product_name}</p>
                                                        <p className="text-[9px] text-gray-500">{item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)}</p>
                                                    </div>
                                                    <p className="text-sm font-black text-gray-900">R$ {item.price.toFixed(2)}</p>
                                                </div>
                                            ))}
                                            <div className="flex justify-between items-center pt-2 mt-2 border-t border-orange-200">
                                                <span className="text-[8px] font-black uppercase text-gray-500">Total do Pedido</span>
                                                <span className="text-lg font-black text-orange-600">R$ {order.total.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}