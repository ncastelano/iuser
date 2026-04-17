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
    Zap,
    ShoppingCart,
    BrickWall // 👈 NOVO ÍCONE
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
    const isFlashRoute = pathname === '/flash'

    return (
        <div className="relative flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
            {/* Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/5 blur-[130px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/5 blur-[120px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsla(var(--foreground)/0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {/* Conteúdo */}
            <main className={`relative z-10 flex-1 w-full flex flex-col ${isMapRoute || isFlashRoute ? '' : 'max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-32'}`}>
                {children}
            </main>

            {/* Floating Cart Button */}
            <Link
                href="/todoscarrinhosdecompra"
                className={`fixed bottom-28 right-6 z-50 p-5 bg-card/60 backdrop-blur-2xl text-foreground rounded-[28px] border border-border shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:scale-110 active:scale-95 transition-all duration-500 group ${totalCartItems === 0 ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100'}`}
            >
                <div className="relative">
                    <ShoppingCart size={24} className="transition-transform group-hover:rotate-12 text-foreground" />
                    {totalCartItems > 0 && (
                        <div className="absolute -top-3 -right-3 min-w-[20px] h-[20px] bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[9px] font-black shadow-lg px-1">
                            {totalCartItems > 99 ? '99+' : totalCartItems}
                        </div>
                    )}
                </div>
            </Link>

            {/* Bottom Navbar */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[98%] sm:w-[600px] z-50">
                <nav className="bg-card/40 backdrop-blur-2xl border border-border rounded-[32px] p-2 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                    <div className="relative flex justify-around items-center h-16">
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/' ? 'bg-foreground text-background shadow-xl' : 'text-muted-foreground hover:text-foreground'}`}>
                                <Store size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/' ? 'opacity-100' : 'opacity-0'}`}>Vitrine</span>
                        </Link>

                        <Link href="/mapa" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/mapa' ? 'bg-foreground text-background shadow-xl' : 'text-muted-foreground hover:text-foreground'}`}>
                                <MapPinned size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/mapa' ? 'opacity-100' : 'opacity-0'}`}>Mapa</span>
                        </Link>

                        <Link href="/mural" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/mural' ? 'bg-foreground text-background shadow-xl' : 'text-muted-foreground hover:text-foreground'}`}>
                                <BrickWall size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/mural' ? 'opacity-100' : 'opacity-0'}`}>Mural</span>
                        </Link>



                        <Link href="/flash" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/flash' ? 'bg-foreground text-background shadow-xl' : 'text-muted-foreground hover:text-foreground'}`}>
                                <Zap size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/flash' ? 'opacity-100' : 'opacity-0'}`}>Flash</span>
                        </Link>
                        <Link href="/dashboard" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/dashboard' ? 'bg-foreground text-background shadow-xl' : 'text-muted-foreground hover:text-foreground'}`}>
                                <User size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/dashboard' ? 'opacity-100' : 'opacity-0'}`}>Dashboard</span>
                        </Link>
                    </div>
                </nav>
            </div>

            {message && <Snackbar message={message} type={type} />}
        </div>
    )
}
