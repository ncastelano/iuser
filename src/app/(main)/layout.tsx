'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReactNode, useState } from 'react'
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
            router.push('/login')
        }, 1000)
    }

    const isMapRoute = pathname === '/mapa'

    return (
        <div className="relative flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
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

            {/* Floating Cart Button - Verde */}
            <Link
                href="/todoscarrinhosdecompra"
                className={`fixed bottom-28 right-6 z-50 p-5 bg-card/60 backdrop-blur-2xl text-foreground rounded-[28px] border border-green-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:scale-110 active:scale-95 transition-all duration-500 group ${totalCartItems === 0 ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100'}`}
            >
                <div className="relative">
                    <ShoppingCart size={24} className="transition-transform group-hover:rotate-12 text-foreground" />
                    {totalCartItems > 0 && (
                        <div className="absolute -top-3 -right-3 min-w-[20px] h-[20px] bg-green-500 text-white rounded-full flex items-center justify-center text-[9px] font-black shadow-lg px-1">
                            {totalCartItems > 99 ? '99+' : totalCartItems}
                        </div>
                    )}
                </div>
            </Link>

            {/* Bottom Navbar - Estilo Compacto (TikTok/YouTube) */}
            <div className="fixed bottom-0 left-0 right-0 z-50">
                <nav className="bg-card/80 backdrop-blur-2xl border-t border-green-500/20 px-2 py-1 shadow-2xl relative">
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