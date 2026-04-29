// src/app/(app)/financeiro/historico/page.tsx
'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, ShoppingBag, Calendar, ArrowUpRight } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'
import { BottomNav } from '@/components/BottomNav'

interface Sale {
    id: string
    created_at: string
    price: number
    quantity: number
    product_name: string
    buyer_name: string
    buyer_profile_slug: string
    store_id: string
    status: 'pending' | 'paid'
}

interface Store { id: string; name: string }

export default function HistoricoVendasPage() {
    const supabase = createClient()
    const router = useRouter()
    const [sales, setSales] = useState<Sale[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all')

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: myStores } = await supabase.from('stores').select('id, name').eq('owner_id', user.id)
            if (myStores?.length) {
                setStores(myStores)
                const { data: salesData } = await supabase
                    .from('store_sales')
                    .select('*')
                    .in('store_id', myStores.map(s => s.id))
                    .order('created_at', { ascending: false })
                if (salesData) setSales(salesData)
            }
            setLoading(false)
        }
        load()
    }, [])

    const filtered = useMemo(() => {
        return sales.filter(s => {
            const matchSearch = s.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.buyer_profile_slug?.toLowerCase().includes(searchQuery.toLowerCase())
            const matchStatus = statusFilter === 'all' || s.status === statusFilter
            return matchSearch && matchStatus
        })
    }, [sales, searchQuery, statusFilter])

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
    )

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-orange-200/50 px-4 py-3">
                <div className="max-w-7xl mx-auto flex items-center gap-4">
                    <button onClick={() => router.back()} className="w-10 h-10 bg-white rounded-xl border border-orange-200 flex items-center justify-center"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                    <div>
                        <h1 className="text-xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Histórico de Vendas</h1>
                        <p className="text-[8px] font-black text-gray-500 uppercase">Todas as transações</p>
                    </div>
                </div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
                {/* Filtros */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Buscar produto ou cliente..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500" />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'paid', 'pending'] as const).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${statusFilter === s ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow' : 'bg-white border border-orange-200 text-gray-600'}`}>
                                {s === 'all' ? 'Todos' : s === 'paid' ? 'Pagos' : 'Pendentes'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tabela / Cards responsivos */}
                {filtered.length === 0 ? (
                    <div className="bg-white/60 rounded-2xl p-12 text-center border border-orange-200/50">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold">Nenhuma venda encontrada</p>
                    </div>
                ) : (
                    <div className="bg-white/80 rounded-2xl border border-orange-200/50 overflow-hidden">
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-orange-50 border-b border-orange-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Produto</th>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Cliente</th>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Loja</th>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Valor</th>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Data</th>
                                        <th className="px-6 py-4 text-left text-[9px] font-black text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-orange-50">
                                    {filtered.map(sale => (
                                        <tr key={sale.id} className="hover:bg-orange-50/40 transition">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-orange-400" /></div>
                                                    <span className="font-bold text-gray-800">{sale.product_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link href={`/${sale.buyer_profile_slug}`} className="font-mono text-sm font-black hover:text-orange-500">@{sale.buyer_profile_slug}</Link>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 text-sm">{stores.find(s => s.id === sale.store_id)?.name}</td>
                                            <td className="px-6 py-4 font-black text-gray-900">R$ {sale.price.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{new Date(sale.created_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase ${sale.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {sale.status === 'paid' ? 'Pago' : 'Pendente'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-orange-100">
                            {filtered.map(sale => (
                                <div key={sale.id} className="p-4 space-y-2">
                                    <div className="flex justify-between">
                                        <span className="font-black text-gray-900">{sale.product_name}</span>
                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${sale.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {sale.status === 'paid' ? 'Pago' : 'Pendente'}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600">@{sale.buyer_profile_slug}</div>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-xs text-gray-500">{stores.find(s => s.id === sale.store_id)?.name}</div>
                                            <div className="text-xs text-gray-400">{new Date(sale.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div className="font-black text-lg text-gray-900">R$ {sale.price.toFixed(2)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <BottomNav />
        </div>
    )
}