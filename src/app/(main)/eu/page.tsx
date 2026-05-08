'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
    TrendingUp,
    Settings,
    BanknoteArrowUp,
    BanknoteArrowDown,
    Plus,
    User,
    User2,
    Store
} from 'lucide-react'
import { usePainelData } from './hooks/usePainelData'
import { PainelVendedor } from './components/PainelVendedor'
import { PainelConsumidor } from './components/PainelConsumidor'
import { useMerchantStore } from '@/store/useMerchantStore'
import { useEffect } from 'react'
import AnimatedBackground from '@/components/AnimatedBackground'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export default function PainelPage() {
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
    } = usePainelData()

    const pendingOrdersCount = useMerchantStore(state => state.pendingOrdersCount)
    const customerOrderStatuses = useMerchantStore(state => state.customerOrderStatuses)

    // Reatualiza os dados quando o BottomNav detectar mudanças (sincronização em tempo real via Store)
    useEffect(() => {
        if (!loading) {
            loadFinanceData()
        }
    }, [pendingOrdersCount, customerOrderStatuses])

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

            if (revenueA === revenueB) {
                return a.name.localeCompare(b.name)
            }

            return revenueB - revenueA
        })
    }, [stores, sales])

    // Determinar a ordem das seções baseado na existência de lojas
    const sectionsOrder = useMemo(() => {
        const hasStores = stores.length > 0

        if (!hasStores) {
            return ['customer', 'merchant']
        }

        return viewOrder
    }, [stores.length, viewOrder])

    if (loading) return <LoadingSpinner />

    return (
        <div className="relative min-h-screen pb-24 bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-xl border-2 border-white/50 hover:scale-110 transition-transform">
                                <img src="/logo.png" alt="iUser" className="h-7 w-7 object-contain rounded-full" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-orange-100 rounded-full p-0.5">
                            <button
                                onClick={() => setViewOrder(['merchant', 'customer'])}
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewOrder[0] === 'merchant'
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-orange-600'
                                    }`}
                            >
                                <Store size={12} />
                                Lojas
                            </button>
                            <button
                                onClick={() => setViewOrder(['customer', 'merchant'])}
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewOrder[0] === 'customer'
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-orange-600'
                                    }`}
                            >
                                <User size={12} />
                                Eu
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
                            {/* CORRIGIDO: Substituído o <h2> externo por <div> */}
                            <div className="flex items-center gap-2">
                                {section === 'merchant' ? (
                                    <>
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                            <Store size={16} className="text-white" />
                                        </div>
                                        <h2 className="text-base font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                            Minhas lojas
                                        </h2>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                            <User2 size={16} className="text-white" />
                                        </div>
                                        <h2 className="text-base font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                            Meu Perfil
                                        </h2>
                                    </>
                                )}
                            </div>
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