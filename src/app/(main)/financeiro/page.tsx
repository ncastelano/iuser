'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
    TrendingUp,
    Settings,
    BanknoteArrowUp,
    BanknoteArrowDown,
    Plus
} from 'lucide-react'
import { useFinanceiroData } from './hooks/useFinanceiroData'
import { PainelVendedor } from './components/PainelVendedor'
import { PainelConsumidor } from './components/PainelConsumidor'
import AnimatedBackground from '@/components/AnimatedBackground'

export default function FinanceiroPage() {
    const [viewOrder, setViewOrder] = useState<['merchant', 'customer'] | ['customer', 'merchant']>(['merchant', 'customer'])

    const {
        stores,
        sales,
        myPurchases,
        loading,
        profile,
        toggleStoreStatus,
        loadFinanceData,
        supabase
    } = useFinanceiroData()

    // Função para calcular o faturamento total de uma loja
    const getStoreRevenue = (storeId: string) => {
        const storeSales = sales.filter(s => s.store_id === storeId)
        return storeSales
            .filter(s => s.status === 'paid' || s.status === 'ready' || s.status === 'preparing')
            .reduce((total, sale) => total + sale.price, 0)
    }

    // ORDENAR Lojas por faturamento (da que mais vendeu para a que menos vendeu)
    const sortedStores = useMemo(() => {
        return [...stores].sort((a, b) => {
            const revenueA = getStoreRevenue(a.id)
            const revenueB = getStoreRevenue(b.id)

            // Se tiver o mesmo faturamento, ordenar por nome
            if (revenueA === revenueB) {
                return a.name.localeCompare(b.name)
            }

            return revenueB - revenueA // Maior faturamento primeiro
        })
    }, [stores, sales]) // Recalcula quando stores ou sales mudarem

    // Determinar a ordem das seções baseado na existência de lojas
    const sectionsOrder = useMemo(() => {
        const hasStores = stores.length > 0

        // Se não tiver lojas, coloca consumidor primeiro
        if (!hasStores) {
            return ['customer', 'merchant']
        }

        // Se tiver lojas, mantém a ordem escolhida pelo usuário
        return viewOrder
    }, [stores.length, viewOrder])

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
                {sectionsOrder.map(section => (
                    <div key={section} className="mb-12">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-black italic uppercase tracking-wider text-gray-700 flex items-center gap-2">
                                {section === 'merchant' ? (
                                    <>
                                        <BanknoteArrowDown size={16} className="text-orange-500" />
                                        Painel do Vendedor
                                    </>
                                ) : (
                                    <>
                                        <BanknoteArrowUp size={16} className="text-orange-500" />
                                        Painel do Consumidor
                                    </>
                                )}
                            </h2>
                            {section === 'merchant' && stores.length > 0 && (
                                <button
                                    onClick={() => window.location.href = '/criar-loja'}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black uppercase text-[8px] tracking-wider hover:shadow-lg transition-all"
                                >
                                    <Plus size={12} /> Nova Loja
                                </button>
                            )}
                        </div>

                        {section === 'merchant' ? (
                            <PainelVendedor
                                stores={sortedStores}
                                sales={sales}
                                profile={profile}
                                supabase={supabase}
                                onToggleStoreStatus={toggleStoreStatus}
                                onUpdateOrder={loadFinanceData}
                            />
                        ) : (
                            <PainelConsumidor
                                purchases={myPurchases}
                                profile={profile}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}