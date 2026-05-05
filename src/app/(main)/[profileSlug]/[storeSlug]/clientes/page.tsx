// src/app/(app)/[profileSlug]/[storeSlug]/compraram-aqui/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft,
    ShoppingBag,
    Sparkles,
    Clock,
    Search,
    AlertTriangle,
    TrendingUp,
    Users,
    Star,
    Crown,
    Medal,
    Trophy,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Package
} from 'lucide-react'
import { getAvatarUrl } from '@/lib/avatar'
import AnimatedBackground from '@/components/AnimatedBackground'

type SaleItem = {
    product_id: string
    product_name: string
    price: number
}

type GroupedSale = {
    buyer_id: string
    buyer_name: string
    created_at: string
    total_price: number
    items: SaleItem[]
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

type TopBuyer = {
    buyer_id: string
    buyer_name: string
    total_purchases: number
    total_spent: number
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

export default function CompraramAquiPage() {
    const params = useParams()
    const storeSlug = params.storeSlug as string
    const profileSlug = params.profileSlug as string
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const [groupedSales, setGroupedSales] = useState<GroupedSale[]>([])
    const [storeName, setStoreName] = useState('')
    const [topBuyers, setTopBuyers] = useState<TopBuyer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

    const toggleExpand = (saleKey: string) => {
        const newExpanded = new Set(expandedSales)
        if (newExpanded.has(saleKey)) {
            newExpanded.delete(saleKey)
        } else {
            newExpanded.add(saleKey)
        }
        setExpandedSales(newExpanded)
    }

    const loadSales = useCallback(async () => {
        if (!storeSlug) return
        setLoading(true)

        // Busca a loja
        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .select('id, name')
            .eq('storeSlug', storeSlug)
            .single()

        if (storeError || !storeData) {
            setError('Loja não encontrada')
            setLoading(false)
            return
        }

        setStoreName(storeData.name)

        // Busca as vendas
        const { data: salesData, error: salesError } = await supabase
            .from('store_sales')
            .select('*, profiles:buyer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', storeData.id)
            .order('created_at', { ascending: false })

        if (salesError) {
            setError('Erro ao carregar compras')
            setLoading(false)
            return
        }

        const mappedSales = (salesData || []).map((item: any) => ({
            ...item,
            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        }))

        // Agrupar compras do mesmo cliente no mesmo horário (intervalo de 1 minuto)
        const groupedMap = new Map<string, GroupedSale>()

        mappedSales.forEach(sale => {
            // Criar uma chave única baseada no comprador + data/hora (minuto)
            const saleDate = new Date(sale.created_at)
            const key = `${sale.buyer_id}_${saleDate.getFullYear()}_${saleDate.getMonth()}_${saleDate.getDate()}_${saleDate.getHours()}_${saleDate.getMinutes()}`

            const existing = groupedMap.get(key)
            if (existing) {
                existing.items.push({
                    product_id: sale.product_id,
                    product_name: sale.product_name,
                    price: sale.price || 0
                })
                existing.total_price += sale.price || 0
            } else {
                groupedMap.set(key, {
                    buyer_id: sale.buyer_id,
                    buyer_name: sale.buyer_name,
                    created_at: sale.created_at,
                    total_price: sale.price || 0,
                    items: [{
                        product_id: sale.product_id,
                        product_name: sale.product_name,
                        price: sale.price || 0
                    }],
                    profiles: sale.profiles
                })
            }
        })

        const groupedSalesList = Array.from(groupedMap.values())
        setGroupedSales(groupedSalesList)

        // Calcular top compradores (agrupado por pessoa)
        const buyerMap = new Map<string, TopBuyer>()

        mappedSales.forEach(sale => {
            const existing = buyerMap.get(sale.buyer_id)
            if (existing) {
                existing.total_purchases += 1
                existing.total_spent += sale.price || 0
            } else {
                buyerMap.set(sale.buyer_id, {
                    buyer_id: sale.buyer_id,
                    buyer_name: sale.buyer_name,
                    total_purchases: 1,
                    total_spent: sale.price || 0,
                    profiles: sale.profiles
                })
            }
        })

        const topBuyersList = Array.from(buyerMap.values())
            .sort((a, b) => b.total_purchases - a.total_purchases)
            .slice(0, 5)

        setTopBuyers(topBuyersList)
        setLoading(false)
    }, [storeSlug, supabase])

    useEffect(() => {
        loadSales()
    }, [loadSales])

    const filteredSales = searchQuery.trim()
        ? groupedSales.filter(s =>
            s.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.items.some(item => item.product_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        : groupedSales

    const getMedalColor = (index: number) => {
        switch (index) {
            case 0: return 'from-yellow-400 to-amber-500'
            case 1: return 'from-gray-300 to-gray-400'
            case 2: return 'from-amber-600 to-amber-700'
            default: return 'from-orange-100 to-orange-200'
        }
    }

    const getMedalIcon = (index: number) => {
        switch (index) {
            case 0: return <Trophy className="w-4 h-4 text-white" />
            case 1: return <Medal className="w-4 h-4 text-white" />
            case 2: return <Medal className="w-4 h-4 text-white" />
            default: return <Star className="w-3 h-3 text-orange-400" />
        }
    }

    // Função para gerar a chave única da venda
    const getSaleKey = (sale: GroupedSale) => {
        const date = new Date(sale.created_at)
        return `${sale.buyer_id}_${date.getTime()}`
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-orange-600 text-sm font-bold">Carregando compras...</p>
            </div>
        </div>
    )

    if (error) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 px-4">
            <div className="flex flex-col gap-4 items-center">
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <p className="text-gray-600 text-sm">{error}</p>
                <button onClick={() => router.back()} className="text-orange-500 font-bold">Voltar</button>
            </div>
        </div>
    )

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />
            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
            `}</style>

            {/* Header */}
            <header className="sticky top-0 z-50 px-3 py-3 border-b border-orange-200/30 bg-white/70 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex w-9 h-9 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            Quem Comprou Aqui
                        </h1>
                        <p className="text-[10px] text-gray-500 font-medium">{storeName}</p>
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-3 py-4 flex flex-col gap-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-orange-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                <ShoppingBag className="w-4 h-4 text-orange-500" />
                            </div>
                            <span className="text-[10px] font-black text-gray-500 uppercase">Pedidos</span>
                        </div>
                        <p className="text-2xl font-black text-gray-800">{groupedSales.length}</p>
                        <p className="text-[9px] text-gray-400">compras agrupadas</p>
                    </div>
                    <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-orange-100">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                <Users className="w-4 h-4 text-green-500" />
                            </div>
                            <span className="text-[10px] font-black text-gray-500 uppercase">Pessoas</span>
                        </div>
                        <p className="text-2xl font-black text-gray-800">
                            {new Set(groupedSales.map(s => s.buyer_id)).size}
                        </p>
                        <p className="text-[9px] text-gray-400">compradores únicos</p>
                    </div>
                </div>

                {/* Top 5 Compradores */}
                {topBuyers.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-yellow-500" />
                            <h2 className="text-sm font-black text-gray-800">Top Compradores</h2>
                        </div>
                        <div className="space-y-2">
                            {topBuyers.map((buyer, index) => (
                                <div
                                    key={buyer.buyer_id}
                                    onClick={() => buyer.profiles?.profileSlug && router.push(`/${buyer.profiles.profileSlug}`)}
                                    className="flex items-center gap-3 bg-white/70 backdrop-blur-sm border border-orange-100 rounded-2xl p-3 hover:shadow-lg transition-all cursor-pointer"
                                >
                                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getMedalColor(index)} flex items-center justify-center shadow-md`}>
                                        {getMedalIcon(index)}
                                    </div>
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center ring-2 ring-white">
                                            {buyer.profiles?.avatar_url ? (
                                                <img
                                                    src={getAvatarUrl(supabase, buyer.profiles.avatar_url)!}
                                                    className="w-full h-full object-cover rounded-full"
                                                    alt=""
                                                />
                                            ) : (
                                                <span className="text-sm font-black text-white">
                                                    {buyer.buyer_name?.charAt(0) || '?'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center ring-2 ring-white">
                                            <CheckCircle2 className="w-3 h-3 text-white" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800">{buyer.buyer_name}</p>
                                        <p className="text-[10px] text-gray-500">
                                            {buyer.total_purchases} compras • R$ {buyer.total_spent.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-orange-500">#{index + 1}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Lista de Compras Agrupadas */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-orange-500" />
                        <h2 className="text-sm font-black text-gray-800">Todas as Compras</h2>
                        <span className="text-[10px] font-bold text-gray-400">({filteredSales.length})</span>
                    </div>

                    {/* Busca */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400" />
                        <input
                            type="text"
                            placeholder="Buscar por comprador ou produto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-orange-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-gray-800 placeholder:text-orange-300 focus:outline-none focus:border-orange-500 transition-all"
                        />
                    </div>

                    {filteredSales.length === 0 ? (
                        <div className="py-8 text-center">
                            <Search className="w-8 h-8 text-orange-200 mx-auto mb-2" />
                            <p className="text-gray-400 text-xs font-bold">Nenhuma compra encontrada</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredSales.map((sale) => {
                                const saleKey = getSaleKey(sale)
                                const isExpanded = expandedSales.has(saleKey)

                                return (
                                    <div
                                        key={saleKey}
                                        className="bg-white/70 backdrop-blur-sm border border-orange-100 rounded-2xl overflow-hidden hover:border-orange-300 transition-all"
                                    >
                                        {/* Cabeçalho da compra */}
                                        <div
                                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/50 transition-colors"
                                            onClick={() => toggleExpand(saleKey)}
                                        >
                                            {/* Avatar do comprador */}
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center ring-2 ring-white shadow-sm">
                                                    {sale.profiles?.avatar_url ? (
                                                        <img
                                                            src={getAvatarUrl(supabase, sale.profiles.avatar_url)!}
                                                            className="w-full h-full object-cover rounded-full"
                                                            alt=""
                                                        />
                                                    ) : (
                                                        <span className="text-sm font-black text-white">
                                                            {sale.buyer_name?.charAt(0) || '?'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center ring-2 ring-white">
                                                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                                                </div>
                                            </div>

                                            {/* Info da compra */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-sm font-bold text-gray-800">
                                                        {sale.buyer_name || 'Alguém'}
                                                    </p>

                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-black text-orange-600">
                                                        R$ {sale.total_price.toFixed(2)}
                                                    </p>
                                                    <span className="text-[9px] text-gray-400">
                                                        {new Date(sale.created_at).toLocaleDateString('pt-BR', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Ícone de expansão + resumo */}
                                            <div className="flex items-center gap-2">
                                                {sale.items.length > 1 && (
                                                    <span className="text-[8px] font-black text-orange-500 uppercase bg-orange-50 px-1.5 py-0.5 rounded-full">
                                                        {sale.items.length} itens
                                                    </span>
                                                )}
                                                {sale.items.length > 1 && (
                                                    isExpanded ? (
                                                        <ChevronUp className="w-4 h-4 text-gray-400" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        {/* Lista de itens (expandida) */}
                                        {isExpanded && sale.items.length > 1 && (
                                            <div className="border-t border-orange-100 bg-orange-50/30 px-3 py-2">
                                                <div className="space-y-1.5">
                                                    {sale.items.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                <ShoppingBag className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                                                <span className="text-gray-700 truncate">{item.product_name}</span>
                                                            </div>
                                                            <span className="font-bold text-orange-600 ml-2 flex-shrink-0">
                                                                R$ {item.price.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}