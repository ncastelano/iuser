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
    MapPinned
} from 'lucide-react'

export default function MainLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()

    const [message, setMessage] = useState<string | null>(null)
    const [type, setType] = useState<'success' | 'error'>('success')

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

        // pequeno delay pra dar tempo do usuário ver
        setTimeout(() => {
            router.refresh()
            router.push('/login')
        }, 1000)
    }

    const linkClass = (path: string) => {
        const isActive = pathname === path

        return `flex flex-col items-center gap-1 text-xs transition-all font-medium ${isActive
            ? 'text-white scale-105 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]'
            : 'text-neutral-500 hover:text-neutral-300'
            }`
    }

    const isMapRoute = pathname === '/mapa'

    return (
        <div className="relative flex flex-col min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-x-hidden">
            {/* Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 blur-[130px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {/* Conteúdo */}
            <main className={`relative z-10 flex-1 w-full flex flex-col ${isMapRoute ? '' : 'max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-32'}`}>
                {children}
            </main>

            {/* Premium Floating Bottom Navbar */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] sm:w-[500px] z-50">
                <nav className="bg-neutral-900/40 backdrop-blur-2xl border border-white/10 rounded-[32px] p-2 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <div className="relative flex justify-around items-center h-16">
                        <Link href="/" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/' ? 'bg-white text-black shadow-xl shadow-white/10' : 'text-neutral-500 hover:text-white'}`}>
                                <Store size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/' ? 'opacity-100' : 'opacity-0'}`}>Vitrine</span>
                        </Link>

                        <Link href="/mapa" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/mapa' ? 'bg-white text-black shadow-xl shadow-white/10' : 'text-neutral-500 hover:text-white'}`}>
                                <MapPinned size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                             <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/mapa' ? 'opacity-100' : 'opacity-0'}`}>Mapa</span>
                        </Link>

                        <Link href="/dashboard" className="relative flex flex-col items-center justify-center gap-1 group/item">
                            <div className={`p-2 rounded-2xl transition-all duration-500 ${pathname === '/dashboard' ? 'bg-white text-black shadow-xl shadow-white/10' : 'text-neutral-500 hover:text-white'}`}>
                                <User size={22} className="transition-transform duration-300 group-hover/item:scale-110" />
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${pathname === '/dashboard' ? 'opacity-100' : 'opacity-0'}`}>Dashboard</span>
                        </Link>
                    </div>
                </nav>
            </div>

            {/* Snackbar controlado */}
            {message && <Snackbar message={message} type={type} />}
        </div>
    )
}
