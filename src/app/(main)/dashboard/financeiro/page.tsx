'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    TrendingUp,
    CreditCard,
    ChevronRight,
    Clock,
    CheckCircle2,
    AlertCircle,
    User,
    ShoppingBag
} from 'lucide-react'

export default function FinanceiroPage() {
    const supabase = createClient()
    const router = useRouter()
    const [sales, setSales] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'all' | 'pending' | 'paid'>('all')

    useEffect(() => {
        const fetchSales = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // 1. Get my stores
            const { data: myStores } = await supabase
                .from('stores')
                .select('id')
                .eq('owner_id', user.id)

            if (myStores && myStores.length > 0) {
                // 2. Get sales for my stores
                const { data: salesData } = await supabase
                    .from('store_sales')
                    .select('*, profiles:buyer_id(name, avatar_url, "profileSlug")')
                    .in('store_id', myStores.map(s => s.id))
                    .order('created_at', { ascending: false })

                if (salesData) setSales(salesData)
            }
            setLoading(false)
        }

        fetchSales()
    }, [supabase, router])

    const getAvatarUrl = (avatarPath: string | null) => {
        if (!avatarPath) return undefined
        if (avatarPath.startsWith('http')) return avatarPath
        return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    }

    const filteredSales = sales.filter(s => {
        if (tab === 'all') return true
        return s.status === tab
    })

    // Group by checkout_id
    const groupedCheckouts = Array.from(new Set(filteredSales.map(s => s.checkout_id || s.id))).map(checkoutId => {
        const items = filteredSales.filter(s => (s.checkout_id === checkoutId || s.id === checkoutId))
        const firstItem = items[0]
        const total = items.reduce((acc, curr) => acc + (curr.price || 0), 0)
        return {
            id: checkoutId,
            items: items,
            buyer: firstItem.profiles,
            buyerName: firstItem.buyer_name,
            buyerSlug: firstItem.buyer_profile_slug,
            storeSlug: firstItem.store_slug,
            status: firstItem.status,
            createdAt: firstItem.created_at,
            total: total
        }
    })

    const totalRevenue = sales.filter(s => s.status === 'paid').reduce((acc, curr) => acc + (curr.price || 0), 0)
    const pendingRevenue = sales.filter(s => s.status === 'pending').reduce((acc, curr) => acc + (curr.price || 0), 0)

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando extratos...</div>

    return (
        <div className="min-h-screen pb-32 bg-black text-white font-sans selection:bg-white selection:text-black pt-16 px-4 md:px-8">
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[100px] rounded-full" />
            </div>

            <div className="max-w-5xl mx-auto space-y-12 relative z-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl hover:bg-white hover:text-black transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="space-y-1">
                            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">Financeiro<span className="text-purple-500">.</span></h1>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500 italic">Extrato detalhado de movimentação das suas lojas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-3xl bg-neutral-900/50 border border-white/5 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase text-neutral-600">Total Recebido</p>
                                <p className="text-lg font-black italic">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-neutral-900/30 p-1.5 rounded-[24px] border border-white/5 w-fit mx-auto md:mx-0">
                    <button
                        onClick={() => setTab('all')}
                        className={`px-8 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'all' ? 'bg-white text-black shadow-2xl' : 'text-neutral-500 hover:text-white'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setTab('pending')}
                        className={`px-8 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'pending' ? 'bg-white text-black shadow-2xl' : 'text-neutral-500 hover:text-white'}`}
                    >
                        Faltam Pagar
                    </button>
                    <button
                        onClick={() => setTab('paid')}
                        className={`px-8 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'paid' ? 'bg-white text-black shadow-2xl' : 'text-neutral-500 hover:text-white'}`}
                    >
                        Recebidos
                    </button>
                </div>

                {/* Sales List */}
                <div className="space-y-6">
                    {groupedCheckouts.length === 0 ? (
                        <div className="py-32 text-center rounded-[48px] border border-dashed border-white/5 bg-white/[0.01]">
                            <CreditCard className="w-12 h-12 text-neutral-800 mx-auto mb-6 opacity-20" />
                            <p className="text-neutral-600 font-bold uppercase tracking-widest italic">Nenhum extrato encontrado nesta categoria.</p>
                        </div>
                    ) : groupedCheckouts.map((checkout) => (
                        <div key={checkout.id} className="group relative bg-neutral-900/20 backdrop-blur-md border border-white/5 rounded-[40px] overflow-hidden hover:border-white/10 transition-all shadow-xl">
                            <div className="p-8 md:p-10 flex flex-col md:flex-row gap-8">
                                {/* Buyer Info */}
                                <div className="flex items-center gap-6 md:w-1/3">
                                    <div className="w-16 h-16 rounded-3xl bg-black border border-white/5 overflow-hidden flex-shrink-0">
                                        {checkout.buyer?.avatar_url ? (
                                            <img src={getAvatarUrl(checkout.buyer.avatar_url)!} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-800 font-black text-2xl italic">{checkout.buyerName?.charAt(0) || '?'}</div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Comprador</p>
                                        <h3 className="text-xl font-black italic uppercase tracking-tighter">{checkout.buyerName}</h3>
                                        <p className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">/{checkout.buyerSlug || 'anonimo'}</p>
                                    </div>
                                </div>

                                {/* Order Details */}
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${checkout.status === 'paid' ? 'bg-green-500 text-black' : 'bg-yellow-500 text-black'}`}>
                                            {checkout.status === 'paid' ? 'Pago' : 'Pendente'}
                                        </div>
                                        <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">
                                            {new Date(checkout.createdAt).toLocaleDateString('pt-BR')} às {new Date(checkout.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        {checkout.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between text-xs text-neutral-400 border-b border-white/[0.02] pb-2 last:border-0">
                                                <span>{item.quantity}x {item.product_name}</span>
                                                <span className="font-mono">R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between pt-4">
                                        <p className="text-[10px] font-black uppercase text-neutral-600 tracking-widest">Total do Pedido</p>
                                        <p className="text-2xl font-black italic tracking-tighter text-white">R$ {checkout.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>

                                <div className="md:w-px bg-white/5" />

                                {/* Store Info & Action */}
                                <div className="md:w-1/4 flex flex-col justify-between items-center md:items-end text-center md:text-right gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-purple-500 tracking-widest">Loja</p>
                                        <p className="text-sm font-bold uppercase italic tracking-tighter">/{checkout.storeSlug}</p>
                                    </div>

                                    <div className="w-full flex flex-col gap-2">
                                        {checkout.status === 'pending' && (
                                            <button className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-200 transition-all flex items-center justify-center gap-2">
                                                <CheckCircle2 size={16} /> Confirmar Pagamento
                                            </button>
                                        )}
                                        <button className="w-full py-4 bg-neutral-900 border border-white/5 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-white transition-all">
                                            Imprimir Extrato
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}