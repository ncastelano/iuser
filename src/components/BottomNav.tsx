'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, MapPinned, Flame, TrendingUp, Zap, ShoppingBag, Star } from 'lucide-react'
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
    const pendingReviewsCount = useMerchantStore(state => state.pendingReviewsCount)
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

    // Define a cor do ícone da sacola baseada no status do pedido
    const getCartIconColor = () => {
        if (!customerOrderStatuses || customerOrderStatuses.length === 0) {
            return pathname === '/sacola' ? 'text-white' : 'text-gray-500'
        }

        // Prioridade: pending > preparing > ready > paid
        if (customerOrderStatuses.includes('pending')) {
            return pathname === '/sacola' ? 'text-white' : 'text-blue-500'
        }
        if (customerOrderStatuses.includes('preparing')) {
            return pathname === '/sacola' ? 'text-white' : 'text-yellow-500'
        }
        if (customerOrderStatuses.includes('ready')) {
            return pathname === '/sacola' ? 'text-white' : 'text-purple-500'
        }
        
        // Removed paid (green) color as per user request

        return pathname === '/sacola' ? 'text-white' : 'text-gray-500'
    }

    // Define o gradiente do fundo do botão da sacola
    const getCartButtonGradient = () => {
        if (pathname === '/sacola') {
            return 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
        }

        if (!customerOrderStatuses || customerOrderStatuses.length === 0) {
            return 'text-gray-500 hover:text-orange-500'
        }

        if (customerOrderStatuses.includes('pending')) {
            return 'text-blue-500 hover:text-blue-600'
        }
        if (customerOrderStatuses.includes('preparing')) {
            return 'text-yellow-500 hover:text-yellow-600'
        }
        if (customerOrderStatuses.includes('ready')) {
            return 'text-purple-500 hover:text-purple-600'
        }
        
        // Removed paid (green) color as per user request

        return 'text-gray-500 hover:text-orange-500'
    }

    // Define a cor do texto do label da sacola
    const getCartLabelColor = () => {
        if (pathname === '/sacola') {
            return 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
        }

        if (!customerOrderStatuses || customerOrderStatuses.length === 0) {
            return 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
        }

        if (customerOrderStatuses.includes('pending')) {
            return 'opacity-100 text-blue-500'
        }
        if (customerOrderStatuses.includes('preparing')) {
            return 'opacity-100 text-yellow-500'
        }
        if (customerOrderStatuses.includes('ready')) {
            return 'opacity-100 text-purple-500'
        }
        
        // Removed paid (green) color as per user request

        return 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
    }

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
                .animate-glow-pulse {
                    animation: glow-pulse 2s ease-in-out infinite;
                }
                .animate-float-nav {
                    animation: float-nav 3s ease-in-out infinite;
                }
            `}</style>

            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-orange-500/20 shadow-[0_-20px_50px_-10px_rgba(249,115,22,0.3)]">
                <nav className="px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] relative">
                    <div className="max-w-md mx-auto flex justify-around items-center h-16">
                        {/* Vitrine */}
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50'
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
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/mapa'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50'
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

                        {/* Sacola - COM CORES DINÂMICAS POR STATUS */}
                        <Link href="/sacola" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/sacola'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : getCartButtonGradient() + ' hover:bg-opacity-10'
                                } ${isCartAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <ShoppingBag
                                        size={22}
                                        className={`transition-all duration-300 ${pathname === '/sacola'
                                            ? ''
                                            : 'group-hover/item:scale-110'
                                            } ${isCartAnimating ? 'animate-cart-shake' : ''}`}
                                        style={{
                                            color: pathname === '/sacola' ? undefined : getCartIconColor().replace('text-', '')
                                        }}
                                    />

                                    {/* Status badges dos pedidos na sacola */}
                                    {customerOrderStatuses && customerOrderStatuses.length > 0 && (
                                        <div className="absolute -top-1 -left-3 flex gap-0.5 z-10">
                                            {customerOrderStatuses.includes('pending') && (
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse"
                                                    style={{ backgroundColor: '#3b82f6' }}
                                                    title="Pendente"
                                                />
                                            )}
                                            {customerOrderStatuses.includes('preparing') && (
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse"
                                                    style={{ backgroundColor: '#eab308' }}
                                                    title="Em Preparo"
                                                />
                                            )}
                                            {customerOrderStatuses.includes('ready') && (
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse"
                                                    style={{ backgroundColor: '#a855f7' }}
                                                    title="Pronto"
                                                />
                                            )}
                                            
                                            {/* Indicador de Avaliação pendente - substitui o círculo verde de Finalizado */}
                                            {pendingReviewsCount > 0 && (
                                                <div
                                                    className="flex items-center justify-center w-3.5 h-3.5 bg-yellow-400 rounded-full border border-white shadow-sm animate-bounce"
                                                    title="Avaliação Pendente"
                                                >
                                                    <Star size={8} className="text-white fill-white" />
                                                </div>
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
                                : getCartLabelColor()
                                } ${isCartAnimating ? 'scale-110' : ''}`}>
                                Sacola
                            </span>

                            {/* Indicador de itens no carrinho */}
                            {totalCartItems > 0 && !isCartAnimating && (
                                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full animate-pulse" />
                            )}
                        </Link>

                        {/* Painel - SEM ALTERAÇÕES, mantém laranja/vermelho */}
                        <Link href="/painel" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname?.startsWith('/painel')
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50'
                                } ${isFinanceAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <TrendingUp size={22} className={`relative transition-all duration-300 ${pathname?.startsWith('/painel') ? '' : 'group-hover/item:scale-110'
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
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname?.startsWith('/painel')
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                } ${isFinanceAnimating ? 'scale-110 text-orange-600' : ''}`}>
                                Painel
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