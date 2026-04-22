'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReactNode, useState, useEffect, useRef } from 'react'
import Snackbar from '@/components/Snackbar'
import {
    Store,
    User,
    LogOut,
    MapPinned,
    ShoppingCart,
    DollarSign,
    Settings
} from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { useAppModeStore } from '@/store/useAppModeStore'

export default function MainLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { itemsByStore } = useCartStore()
    const { mode } = useAppModeStore()

    const [message, setMessage] = useState<string | null>(null)
    const [type, setType] = useState<'success' | 'error'>('success')

    const totalCartItems = Object.values(itemsByStore).reduce(
        (acc, items) => acc + items.reduce((sum, item) => sum + item.quantity, 0),
        0
    )

    const [isCartAnimating, setIsCartAnimating] = useState(false)
    const prevTotalRef = useRef(totalCartItems)

    useEffect(() => {
        if (totalCartItems > prevTotalRef.current) {
            setIsCartAnimating(true)
            setMessage('Item adicionado ao seu carrinho!')
            setType('success')
            
            const timer = setTimeout(() => {
                setIsCartAnimating(false)
                setMessage(null)
            }, 3000)
            
            return () => clearTimeout(timer)
        }
        prevTotalRef.current = totalCartItems
    }, [totalCartItems])

    const handleLogout = async () => {
        const supabase = createClient()
        const { error } = await supabase.auth.signOut()

        if (error) {
            console.error('Erro ao sair:', error.message)
            setType('error')
            setMessage('Erro ao sair')
            return
        }

        setType('success')
        setMessage('Logout realizado com sucesso')
        setTimeout(() => {
            router.refresh()
            router.push('/')
        }, 1000)
    }

    const isMapRoute = pathname === '/mapa'

    return (
        <div className="relative flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
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
            {/* Background Glows - Verde */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-green-500/5 blur-[130px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-600/5 blur-[120px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsla(var(--foreground)/0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {/* Conteúdo */}
            <main className={`relative z-10 flex-1 w-full flex flex-col pb-24 ${isMapRoute ? '' : 'max-w-7xl mx-auto px-4 md:px-8 pt-4'}`}>
                {children}
            </main>



            {/* Bottom Navbar - Estilo Compacto (TikTok/YouTube) */}
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

                        <Link href="/carrinhos" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname === '/todoscarrinhosdecompra' ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'} ${isCartAnimating ? 'animate-cart-bounce' : ''}`}>
                                <div className="relative">
                                    <ShoppingCart size={20} className={`transition-transform duration-300 group-hover/item:scale-110 ${isCartAnimating ? 'animate-cart-shake' : ''}`} />
                                    {totalCartItems > 0 && (
                                        <div className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-green-500 text-white rounded-full flex items-center justify-center text-[7px] font-black shadow-lg px-0.5 ${isCartAnimating ? 'animate-badge-pop' : ''}`}>
                                            {totalCartItems > 99 ? '99+' : totalCartItems}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname === '/todoscarrinhosdecompra' ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'} ${isCartAnimating ? 'scale-110 text-green-500 font-black' : ''}`}>Carrinho</span>
                        </Link>

                        <Link href="/financeiro" className="relative flex flex-col items-center justify-center gap-0.5 group/item flex-1">
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${pathname?.startsWith('/financeiro') ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}>
                                <DollarSign size={20} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-tighter transition-all duration-300 ${pathname?.startsWith('/financeiro') ? 'opacity-100 text-green-500' : 'opacity-60 text-muted-foreground'}`}>Financeiro</span>
                        </Link>

                    </div>
                </nav>
            </div>

            {message && <Snackbar message={message} type={type} />}
        </div>
    )
}