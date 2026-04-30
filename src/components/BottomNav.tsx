'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, MapPinned, ShoppingCart, Flame, TrendingUp, Zap } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { useMerchantStore } from '@/store/useMerchantStore'
import { useEffect, useState, useRef } from 'react'

export function BottomNav() {
    const pathname = usePathname()
    const { itemsByStore } = useCartStore()

    const totalCartItems = Object.values(itemsByStore).reduce(
        (acc, items) => acc + items.reduce((sum, item) => sum + item.quantity, 0),
        0
    )

    const [isCartAnimating, setIsCartAnimating] = useState(false)
    const prevTotalRef = useRef(totalCartItems)

    const pendingOrdersCount = useMerchantStore(state => state.pendingOrdersCount)
    const customerOrderStatuses = useMerchantStore(state => state.customerOrderStatuses)
    const [isFinanceAnimating, setIsFinanceAnimating] = useState(false)
    const prevPendingRef = useRef(pendingOrdersCount)

    useEffect(() => {
        if (totalCartItems > prevTotalRef.current) {
            setIsCartAnimating(true)
            const timer = setTimeout(() => {
                setIsCartAnimating(false)
            }, 3000)
            return () => clearTimeout(timer)
        }
        prevTotalRef.current = totalCartItems
    }, [totalCartItems])

    useEffect(() => {
        if (pendingOrdersCount > prevPendingRef.current) {
            setIsFinanceAnimating(true)
            const timer = setTimeout(() => {
                setIsFinanceAnimating(false)
            }, 3000)
            return () => clearTimeout(timer)
        }
        prevPendingRef.current = pendingOrdersCount
    }, [pendingOrdersCount])

    return (
        <>
            <style jsx global>{`
                @keyframes cart-bounce {
                    0%, 100% { transform: scale(1); }
                    30% { transform: scale(1.3) translateY(-4px); }
                    50% { transform: scale(0.9); }
                    70% { transform: scale(1.1); }
                }
                @keyframes cart-shake {
                    0%, 100% { transform: rotate(0deg); }
                    20% { transform: rotate(-15deg); }
                    40% { transform: rotate(15deg); }
                    60% { transform: rotate(-10deg); }
                    80% { transform: rotate(10deg); }
                }
                @keyframes badge-pop {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.5); }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
                @keyframes glow-pulse {
                    0%, 100% { 
                        box-shadow: 0 0 5px rgba(249, 115, 22, 0.5),
                                   0 0 10px rgba(239, 68, 68, 0.3);
                    }
                    50% { 
                        box-shadow: 0 0 15px rgba(249, 115, 22, 0.8),
                                   0 0 25px rgba(239, 68, 68, 0.5);
                    }
                }
                @keyframes float-nav {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-2px); }
                }
                .animate-cart-bounce {
                    animation: cart-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .animate-cart-shake {
                    animation: cart-shake 0.5s ease-in-out;
                }
                .animate-badge-pop {
                    animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .animate-pulse-ring {
                    animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                .animate-glow-pulse {
                    animation: glow-pulse 2s ease-in-out infinite;
                }
                .animate-float-nav {
                    animation: float-nav 3s ease-in-out infinite;
                }
            `}</style>

            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-orange-200/50 shadow-[0_-10px_30px_-5px_rgba(249,115,22,0.1)] pb-[env(safe-area-inset-bottom)]">
                <nav className="px-2 py-1 relative">
                    <div className="max-w-md mx-auto flex justify-around items-center h-16">
                        {/* Vitrine */}
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${pathname === '/'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500'
                                }`}>
                                <Store size={22} className={`transition-all duration-300 ${pathname === '/' ? '' : 'group-hover/item:scale-110'}`} />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                }`}>
                                Vitrine
                            </span>
                        </Link>

                        {/* Mapa */}
                        <Link href="/mapa" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${pathname === '/mapa'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500'
                                }`}>
                                <MapPinned size={22} className={`transition-all duration-300 ${pathname === '/mapa' ? '' : 'group-hover/item:scale-110'}`} />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/mapa'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                }`}>
                                Mapa
                            </span>
                        </Link>

                        {/* Sacola */}
                        <Link href="/sacola" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${pathname === '/sacola'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500'
                                } ${isCartAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <ShoppingCart size={22} className={`transition-all duration-300 ${pathname === '/sacola' ? '' : 'group-hover/item:scale-110'} ${isCartAnimating ? 'animate-cart-shake' : ''}`} />

                                    {/* Status badges dos pedidos */}
                                    {customerOrderStatuses?.length > 0 && (
                                        <div className="absolute -top-1 -left-3 flex gap-0.5 z-10">
                                            {customerOrderStatuses.includes('pending') && (
                                                <div className="w-2 h-2 rounded-full bg-yellow-500 border border-white shadow-sm animate-pulse" title="Pendente" />
                                            )}
                                            {customerOrderStatuses.includes('preparing') && (
                                                <div className="w-2 h-2 rounded-full bg-orange-500 border border-white shadow-sm animate-pulse" title="Em Preparo" />
                                            )}
                                            {customerOrderStatuses.includes('ready') && (
                                                <div className="w-2 h-2 rounded-full bg-green-500 border border-white shadow-sm animate-pulse" title="Pronto" />
                                            )}
                                        </div>
                                    )}

                                    {/* Contador do carrinho */}
                                    {totalCartItems > 0 && (
                                        <div className={`absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-lg px-1 ${isCartAnimating ? 'animate-badge-pop' : ''
                                            }`}>
                                            {totalCartItems > 99 ? '99+' : totalCartItems}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/sacola'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                } ${isCartAnimating ? 'scale-110 text-orange-600' : ''}`}>
                                Sacola
                            </span>

                            {/* Indicador de itens no carrinho */}
                            {totalCartItems > 0 && !isCartAnimating && (
                                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full animate-pulse" />
                            )}
                        </Link>

                        {/* Financeiro */}
                        <Link href="/financeiro" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${pathname?.startsWith('/financeiro')
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500'
                                } ${isFinanceAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    {/* Anel pulsante para novos pedidos */}
                                    {pendingOrdersCount > 0 && (
                                        <div className="absolute inset-0 bg-orange-500/30 rounded-full animate-pulse-ring" />
                                    )}
                                    <TrendingUp size={22} className={`relative transition-all duration-300 ${pathname?.startsWith('/financeiro') ? '' : 'group-hover/item:scale-110'
                                        } ${isFinanceAnimating ? 'animate-cart-shake' : ''}`} />

                                    {/* Badge de novos pedidos */}
                                    {pendingOrdersCount > 0 && (
                                        <div className={`absolute -bottom-2 -right-5 min-w-[18px] h-[18px] bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-lg px-1 ${isFinanceAnimating ? 'animate-badge-pop' : ''
                                            }`}>
                                            {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname?.startsWith('/financeiro')
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                } ${isFinanceAnimating ? 'scale-110 text-orange-600' : ''}`}>
                                Financeiro
                            </span>

                            {/* Indicador de novidades */}
                            {pendingOrdersCount > 0 && !isFinanceAnimating && (
                                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full animate-pulse" />
                            )}
                        </Link>
                    </div>

                    {/* Barra decorativa inferior */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-orange-400 via-red-500 to-yellow-400 rounded-full opacity-50" />
                </nav>
            </div>
        </>
    )
}