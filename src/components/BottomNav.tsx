// src/components/BottomNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, MapPinned, ShoppingBag, Star, User } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { useMerchantStore } from '@/store/useMerchantStore'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import BottomNavBackground from '@/components/BottomNavBackground'

export function BottomNav() {
    const pathname = usePathname()
    const { itemsByStore } = useCartStore()
    const supabase = createClient()

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

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [profileSlug, setProfileSlug] = useState<string | null>(null)

    useEffect(() => {
        const fetchUserProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('avatar_url, profileSlug')
                    .eq('id', user.id)
                    .single()

                if (profile) {
                    setAvatarUrl(profile.avatar_url)
                    setProfileSlug(profile.profileSlug)
                }
            }
        }
        fetchUserProfile()
    }, [supabase])

    useEffect(() => {
        if (totalCartItems > prevTotalRef.current) {
            setIsCartAnimating(true)
            const timer = setTimeout(() => setIsCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
        prevTotalRef.current = totalCartItems
    }, [totalCartItems])

    useEffect(() => {
        if (pendingOrdersCount > prevPendingRef.current) {
            setIsFinanceAnimating(true)
            const timer = setTimeout(() => setIsFinanceAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
        prevPendingRef.current = pendingOrdersCount
    }, [pendingOrdersCount])

    const getCartIconColor = () => {
        if (!customerOrderStatuses || customerOrderStatuses.length === 0) {
            return pathname === '/sacola' ? 'text-white' : 'text-gray-500'
        }
        if (customerOrderStatuses.includes('pending')) return pathname === '/sacola' ? 'text-white' : 'text-blue-500'
        if (customerOrderStatuses.includes('preparing')) return pathname === '/sacola' ? 'text-white' : 'text-yellow-500'
        if (customerOrderStatuses.includes('ready')) return pathname === '/sacola' ? 'text-white' : 'text-purple-500'
        return pathname === '/sacola' ? 'text-white' : 'text-gray-500'
    }

    const getCartButtonGradient = () => {
        if (pathname === '/sacola') return 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
        if (!customerOrderStatuses || customerOrderStatuses.length === 0) return 'text-gray-500 hover:text-orange-500 hover:bg-orange-50/80'
        if (customerOrderStatuses.includes('pending')) return 'text-blue-500 hover:text-blue-600'
        if (customerOrderStatuses.includes('preparing')) return 'text-yellow-500 hover:text-yellow-600'
        if (customerOrderStatuses.includes('ready')) return 'text-purple-500 hover:text-purple-600'
        return 'text-gray-500 hover:text-orange-500 hover:bg-orange-50/80'
    }

    const getCartLabelColor = () => {
        if (pathname === '/sacola') return 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
        if (!customerOrderStatuses || customerOrderStatuses.length === 0) return 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
        if (customerOrderStatuses.includes('pending')) return 'opacity-100 text-blue-500'
        if (customerOrderStatuses.includes('preparing')) return 'opacity-100 text-yellow-500'
        if (customerOrderStatuses.includes('ready')) return 'opacity-100 text-purple-500'
        return 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
    }

    const getProfileLabel = () => {
        if (!profileSlug) return 'Perfil'
        return profileSlug.length > 8 ? profileSlug.substring(0, 7) + '…' : profileSlug
    }

    const getInitial = () => {
        if (profileSlug) return profileSlug.charAt(0).toUpperCase()
        return null
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
                @keyframes float-nav {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-2px); }
                }
                .animate-cart-bounce { animation: cart-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
                .animate-cart-shake { animation: cart-shake 0.5s ease-in-out; }
                .animate-badge-pop { animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                .animate-float-nav { animation: float-nav 3s ease-in-out infinite; }
            `}</style>

            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-t border-white/20 shadow-[0_-10px_30px_-10px_rgba(249,115,22,0.1)] overflow-hidden">
                {/* Background animado do BottomNav */}
                <BottomNavBackground />

                <nav className="px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] relative z-10">
                    <div className="max-w-md mx-auto flex justify-around items-center h-16">
                        {/* Vitrine */}
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50/80'
                                }`}>
                                <Store size={22} className={`transition-all duration-300 ${pathname === '/' ? '' : 'group-hover/item:scale-110'}`} />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                }`}>Vitrine</span>
                        </Link>

                        {/* Mapa */}
                        <Link href="/radar" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/radar'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50/80'
                                }`}>
                                <MapPinned size={22} className={`transition-all duration-300 ${pathname === '/radar' ? '' : 'group-hover/item:scale-110'}`} />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/radar'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'
                                }`}>Mapa</span>
                        </Link>

                        {/* Sacola */}
                        <Link href="/sacola" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${pathname === '/sacola'
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : getCartButtonGradient()
                                } ${isCartAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <ShoppingBag size={22} className={`transition-all duration-300 ${pathname === '/sacola' ? '' : 'group-hover/item:scale-110'} ${isCartAnimating ? 'animate-cart-shake' : ''}`}
                                        style={{ color: pathname === '/sacola' ? undefined : getCartIconColor().replace('text-', '') }} />
                                    {customerOrderStatuses && customerOrderStatuses.length > 0 && (
                                        <div className="absolute -top-1 -left-3 flex gap-0.5 z-10">
                                            {customerOrderStatuses.includes('pending') && <div className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse" style={{ backgroundColor: '#3b82f6' }} title="Pendente" />}
                                            {customerOrderStatuses.includes('preparing') && <div className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse" style={{ backgroundColor: '#eab308' }} title="Em Preparo" />}
                                            {customerOrderStatuses.includes('ready') && <div className="w-2.5 h-2.5 rounded-full border border-white shadow-sm animate-pulse" style={{ backgroundColor: '#a855f7' }} title="Pronto" />}
                                            {pendingReviewsCount > 0 && <div className="flex items-center justify-center w-3.5 h-3.5 bg-yellow-400 rounded-full border border-white shadow-sm animate-bounce" title="Avaliação Pendente"><Star size={8} className="text-white fill-white" /></div>}
                                        </div>
                                    )}
                                    {totalCartItems > 0 && (
                                        <div className={`absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-lg px-1 ${isCartAnimating ? 'animate-badge-pop' : ''}`}>
                                            {totalCartItems > 99 ? '99+' : totalCartItems}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname === '/sacola'
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : getCartLabelColor()} ${isCartAnimating ? 'scale-110' : ''}`}>Sacola</span>
                            {totalCartItems > 0 && !isCartAnimating && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full animate-pulse" />}
                        </Link>

                        {/* Perfil */}
                        <Link href="/eu" className="relative flex flex-col items-center justify-center gap-1 group/item flex-1">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden ${pathname?.startsWith('/eu')
                                ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg animate-float-nav'
                                : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50/80'
                                } ${isFinanceAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt={profileSlug || 'Eu'} className={`w-full h-full rounded-full object-cover transition-all duration-300 ${pathname?.startsWith('/eu') ? '' : 'group-hover/item:scale-110'} ${isFinanceAnimating ? 'animate-cart-shake' : ''}`} />
                                    ) : getInitial() ? (
                                        <span className={`text-sm font-black transition-all duration-300 ${pathname?.startsWith('/eu') ? 'text-white' : 'text-gray-500 group-hover/item:text-orange-500'} ${isFinanceAnimating ? 'animate-cart-shake' : ''}`}>{getInitial()}</span>
                                    ) : (
                                        <User size={22} className={`relative transition-all duration-300 ${pathname?.startsWith('/eu') ? '' : 'group-hover/item:scale-110'} ${isFinanceAnimating ? 'animate-cart-shake' : ''}`} />
                                    )}
                                    {pendingOrdersCount > 0 && (
                                        <div className={`absolute -bottom-2 -right-5 min-w-[18px] h-[18px] bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-black shadow-lg px-1 ${isFinanceAnimating ? 'animate-badge-pop' : ''}`}>
                                            {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${pathname?.startsWith('/eu')
                                ? 'opacity-100 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent'
                                : 'opacity-70 text-gray-500 group-hover/item:text-orange-500'} ${isFinanceAnimating ? 'scale-110 text-orange-600' : ''}`}>{getProfileLabel()}</span>
                            {pendingOrdersCount > 0 && !isFinanceAnimating && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full animate-pulse" />}
                        </Link>
                    </div>

                    {/* Barra decorativa inferior */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-orange-400 via-red-500 to-yellow-400 rounded-full opacity-30" />
                </nav>
            </div>
        </>
    )
}