'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReactNode, useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
    Store,
    User,
    LogOut,
    MapPinned,
    Settings,
    Flame,
    Zap,
    Gift,
    Sparkles,
    TrendingUp,
    ShoppingBag
} from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { useAppModeStore } from '@/store/useAppModeStore'
import { useMerchantStore } from '@/store/useMerchantStore'
import { BottomNav } from '@/components/BottomNav'
import { FinishedOrderTrigger } from '@/components/ratings/FinishedOrderTrigger'

export default function MainLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { itemsByStore } = useCartStore()
    const { mode } = useAppModeStore()

    const totalCartItems = Object.values(itemsByStore).reduce(
        (acc, items) => acc + items.reduce((sum, item) => sum + item.quantity, 0),
        0
    )

    const [isCartAnimating, setIsCartAnimating] = useState(false)
    const prevTotalRef = useRef(totalCartItems)

    useEffect(() => {
        if (totalCartItems > prevTotalRef.current) {
            setIsCartAnimating(true)
            toast.success('🛍️ Item adicionado ao carrinho!', {
                icon: <Sparkles className="w-4 h-4 text-orange-500" />,
                style: {
                    background: 'linear-gradient(135deg, rgb(249, 115, 22), rgb(239, 68, 68))',
                    color: 'white',
                    border: 'none'
                }
            })

            const timer = setTimeout(() => {
                setIsCartAnimating(false)
            }, 3000)

            return () => clearTimeout(timer)
        }
        prevTotalRef.current = totalCartItems
    }, [totalCartItems])

    const latestOrderNotification = useMerchantStore(state => state.latestOrderNotification)
    const setLatestOrderNotification = useMerchantStore(state => state.setLatestOrderNotification)

    useEffect(() => {
        if (latestOrderNotification) {
            toast.success(latestOrderNotification, {
                icon: <TrendingUp className="w-4 h-4 text-green-400" />,
                duration: 8000,
                style: {
                    background: 'linear-gradient(135deg, rgb(34, 197, 94), rgb(16, 185, 129))',
                    color: 'white',
                    border: 'none'
                }
            })
            setLatestOrderNotification(null)
        }
    }, [latestOrderNotification, setLatestOrderNotification])

    const handleLogout = async () => {
        const supabase = createClient()
        const { error } = await supabase.auth.signOut()

        if (error) {
            console.error('Erro ao sair:', error.message)
            toast.error('Erro ao sair')
            return
        }

        toast.success('Logout realizado com sucesso', {
            icon: <Zap className="w-4 h-4" />,
            style: {
                background: 'linear-gradient(135deg, rgb(249, 115, 22), rgb(239, 68, 68))',
                color: 'white'
            }
        })
        setTimeout(() => {
            router.refresh()
            router.push('/')
        }, 1000)
    }

    const isMapRoute = pathname === '/mapa'
    // 🔥 NOVO: Verifica se é a rota da vitrine (página inicial)
    const isVitrineRoute = pathname === '/'

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 font-sans selection:bg-orange-500 selection:text-white overflow-x-hidden">

            {/* Animações Globais */}
            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                }
                @keyframes pulse-glow {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.05); }
                }
                @keyframes slide-in-right {
                    from {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                @keyframes bounce-cart {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.2) rotate(10deg); }
                }
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                .animate-pulse-glow {
                    animation: pulse-glow 3s ease-in-out infinite;
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.3s ease-out;
                }
                .animate-bounce-cart {
                    animation: bounce-cart 0.5s ease-in-out;
                }
                
                /* Scrollbar personalizada */
                ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: rgba(249, 115, 22, 0.1);
                    border-radius: 10px;
                }
                ::-webkit-scrollbar-thumb {
                    background: linear-gradient(135deg, rgb(249, 115, 22), rgb(239, 68, 68));
                    border-radius: 10px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(135deg, rgb(234, 88, 12), rgb(220, 38, 38));
                }
            `}</style>

            {/* Background com elementos decorativos animados */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                {/* Gradientes principais */}
                <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-gradient-to-br from-orange-400/20 via-red-400/15 to-yellow-400/10 blur-[150px] rounded-full animate-pulse-glow" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-gradient-to-tl from-red-500/20 via-orange-500/15 to-yellow-500/10 blur-[140px] rounded-full animate-pulse-glow" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

                {/* Partículas flutuantes */}
                <div className="absolute top-[10%] left-[20%] w-2 h-2 bg-orange-500/30 rounded-full animate-float" />
                <div className="absolute top-[70%] left-[80%] w-3 h-3 bg-red-500/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '8s' }} />
                <div className="absolute top-[40%] left-[90%] w-1.5 h-1.5 bg-yellow-500/40 rounded-full animate-float" style={{ animationDelay: '2s', animationDuration: '7s' }} />
                <div className="absolute bottom-[20%] left-[10%] w-2.5 h-2.5 bg-orange-400/30 rounded-full animate-float" style={{ animationDelay: '1.5s', animationDuration: '9s' }} />
                <div className="absolute top-[80%] left-[40%] w-2 h-2 bg-red-400/30 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '6.5s' }} />

                {/* Sparkles decorativos */}
                <Sparkles className="absolute top-[15%] right-[15%] w-8 h-8 text-orange-500/20 animate-pulse" />
                <Sparkles className="absolute bottom-[25%] left-[10%] w-6 h-6 text-yellow-500/20 animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            {/* Conteúdo - MODIFICADO AQUI */}
            <main className={`relative z-10 flex-1 w-full flex flex-col pb-24 ${isMapRoute || isVitrineRoute
                    ? '' // SEM padding e SEM max-width para vitrine e mapa
                    : 'max-w-7xl mx-auto px-4 md:px-8 pt-4' // Com padding para outras páginas
                }`}>
                {/* Indicador de carrinho animado flutuante (opcional) */}
                {totalCartItems > 0 && (
                    <div className="fixed bottom-24 right-4 z-50 animate-slide-in-right">
                        <button
                            onClick={() => router.push('/sacola')}
                            className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            <span className="text-sm font-bold">{totalCartItems} itens</span>
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                        </button>
                    </div>
                )}
                {children}
            </main>

            {/* Bottom Navbar - com cores vibrantes */}
            <BottomNav />

            {/* Global Review Trigger */}
            <FinishedOrderTrigger />

            {/* Toast personalizado para o tema */}
            <style jsx global>{`
                [data-sonner-toast] {
                    background: linear-gradient(135deg, rgb(255, 255, 255), rgb(255, 247, 237)) !important;
                    border: 1px solid rgba(249, 115, 22, 0.2) !important;
                    border-radius: 1rem !important;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.02) !important;
                }
                [data-sonner-toast][data-type="success"] {
                    background: linear-gradient(135deg, rgb(249, 115, 22), rgb(239, 68, 68)) !important;
                    color: white !important;
                }
                [data-sonner-toast][data-type="error"] {
                    background: linear-gradient(135deg, rgb(239, 68, 68), rgb(220, 38, 38)) !important;
                    color: white !important;
                }
                [data-sonner-toast] button {
                    background: rgba(255, 255, 255, 0.2) !important;
                    color: white !important;
                }
            `}</style>
        </div>
    )
}