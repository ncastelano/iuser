'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Search,
    Filter,
    Calendar,
    ArrowUpRight,
    ShoppingBag,
    Package
} from 'lucide-react'

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

interface Store {
    id: string
    name: string
}

export default function HistoricoVendasPage() {
    const supabase = createClient()
    const router = useRouter()
    
    const [sales, setSales] = useState<Sale[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all')

    useEffect(() => {
        const loadHistory = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // Load stores to know which sales to fetch
            const { data: myStores } = await supabase.from('stores').select('id, name').eq('owner_id', user.id)
            if (myStores) {
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

        loadHistory()
    }, [])

    const filteredSales = useMemo(() => {
        return sales.filter(sale => {
            const matchesSearch = 
                sale.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sale.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sale.buyer_profile_slug?.toLowerCase().includes(searchQuery.toLowerCase())
            
            const matchesStatus = statusFilter === 'all' || sale.status === statusFilter
            
            return matchesSearch && matchesStatus
        })
    }, [sales, searchQuery, statusFilter])

    if (loading) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Carregando histórico...</p>
        </div>
    )

    return (
        <div className="relative min-h-screen pb-32 bg-background text-foreground font-sans">
            {/* Header */}
            <div className="sticky top-0 z-[40] bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 md:px-8 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => router.push('/financeiro')}
                            className="w-10 h-10 flex items-center justify-center bg-secondary/50 rounded-xl border border-border hover:bg-foreground hover:text-background transition-all"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter leading-none">Histórico de Vendas</h1>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Registros de todas as transações</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar por produto ou cliente..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-secondary/30 border border-border/50 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-green-500 transition-all font-medium"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'paid', 'pending'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-6 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === status ? 'bg-foreground text-background border-foreground' : 'bg-secondary/30 border-border/50 text-muted-foreground hover:border-foreground/20'}`}
                            >
                                {status === 'all' ? 'Tudo' : status === 'paid' ? 'Pagos' : 'Pendentes'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sales List */}
                <div className="bg-card/30 backdrop-blur-sm rounded-[32px] border border-border/50 overflow-hidden shadow-2xl">
                    {filteredSales.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground opacity-20">
                                <Package size={32} />
                            </div>
                            <p className="text-sm font-black italic uppercase text-muted-foreground">Nenhuma venda encontrada com esses filtros.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-secondary/20 border-b border-border/30">
                                    <tr>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Produto & ID</th>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Cliente</th>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Loja</th>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Valor</th>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Data</th>
                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Status</th>
                                        <th className="px-8 py-5"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10">
                                    {filteredSales.map((sale) => (
                                        <tr key={sale.id} className="group hover:bg-secondary/10 transition-colors">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center">
                                                        <ShoppingBag size={18} className="text-muted-foreground opacity-30" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-black uppercase italic tracking-tight">{sale.product_name}</p>
                                                        <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-50">#{sale.id.slice(0, 8)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <Link href={`/${sale.buyer_profile_slug}`} className="group/link block">
                                                    <p className="text-[11px] font-black group-hover/link:text-green-500 transition-colors">/{sale.buyer_profile_slug}</p>
                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">{sale.buyer_name || 'Comprador'}</p>
                                                </Link>
                                            </td>
                                            <td className="px-8 py-6">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stores.find(s => s.id === sale.store_id)?.name || '...'}</p>
                                            </td>
                                            <td className="px-8 py-6">
                                                <p className="text-sm font-black italic tracking-tighter">R$ {sale.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                {sale.quantity > 1 && <p className="text-[8px] font-bold text-muted-foreground uppercase">{sale.quantity} unidades</p>}
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Calendar size={12} />
                                                    <p className="text-[10px] font-bold uppercase font-mono">
                                                        {new Date(sale.created_at).toLocaleDateString('pt-BR')} <span className="opacity-30">|</span> {new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${sale.status === 'paid' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                                                    <div className={`w-1 h-1 rounded-full ${sale.status === 'paid' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]'}`} />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">{sale.status === 'paid' ? 'Efetivado' : 'Pendente'}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <button className="w-10 h-10 bg-secondary/50 rounded-xl flex items-center justify-center hover:bg-foreground hover:text-background transition-all opacity-0 group-hover:opacity-100 shadow-xl">
                                                    <ArrowUpRight size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
