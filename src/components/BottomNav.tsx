'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, MapPinned, ShoppingCart, DollarSign } from 'lucide-react'
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
                .animate-cart-bounce {
                    animation: cart-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .animate-cart-shake {
                    animation: cart-shake 0.5s ease-in-out;
                }
                .animate-badge-pop {
                    animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
            `}</style>
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-2xl border-t border-green-500/20 pb-[env(safe-area-inset-bottom)]">
                <nav className="px-2 py-1 shadow-2xl relative">
                    <div className="max-w-md mx-auto flex justify-around items-center h-14">
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname === '/' ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}>
                                <Store size={20} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname === '/' ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'}`}>Vitrine</span>
                        </Link>

                        <Link href="/mapa" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname === '/mapa' ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}>
                                <MapPinned size={20} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname === '/mapa' ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'}`}>Mapa</span>
                        </Link>

                        <Link href="/sacola" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname === '/sacola' ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'} ${isCartAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <ShoppingCart size={20} className={`transition-transform duration-300 group-hover/item:scale-110 ${isCartAnimating ? 'animate-cart-shake' : ''}`} />
                                    {totalCartItems > 0 && (
                                        <div className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-green-500 text-white rounded-full flex items-center justify-center text-[7px] font-black shadow-lg px-0.5 ${isCartAnimating ? 'animate-badge-pop' : ''}`}>
                                            {totalCartItems > 99 ? '99+' : totalCartItems}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname === '/sacola' ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'} ${isCartAnimating ? 'scale-110 text-green-500 font-black' : ''}`}>Sacola</span>
                        </Link>

                        <Link href="/financeiro" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname?.startsWith('/financeiro') ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'} ${isFinanceAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <DollarSign size={20} className={`transition-transform duration-300 group-hover/item:scale-110 ${isFinanceAnimating ? 'animate-cart-shake' : ''}`} />
                                    {pendingOrdersCount > 0 && (
                                        <div className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-green-500 text-white rounded-full flex items-center justify-center text-[7px] font-black shadow-lg px-0.5 ${isFinanceAnimating ? 'animate-badge-pop' : ''}`}>
                                            {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname?.startsWith('/financeiro') ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'} ${isFinanceAnimating ? 'scale-110 text-green-500 font-black' : ''}`}>Financeiro</span>
                        </Link>
                    </div>
                </nav>
            </div>
        </>
    )
}
