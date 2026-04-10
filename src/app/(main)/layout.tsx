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
        <div className="flex flex-col min-h-screen bg-black text-white font-sans">

            {/* Conteúdo */}
            <main className={`flex-1 w-full flex flex-col ${isMapRoute ? '' : 'max-w-5xl mx-auto px-4 pt-6 pb-24'
                }`}>
                {children}
            </main>

            {/* Bottom Navbar */}
            <nav className="fixed bottom-0 left-0 w-full bg-neutral-950/90 backdrop-blur-xl border-t border-neutral-900 z-50">
                <div className="max-w-5xl mx-auto flex justify-around items-center py-3">

                    <Link href="/" className={linkClass('/')}>
                        <Store size={22} className={pathname === '/' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : ''} />
                        Vitrine
                    </Link>

                    <Link href="/mapa" className={linkClass('/mapa')}>
                        <MapPinned size={22} className={pathname === '/mapa' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : ''} />
                        Mapa
                    </Link>

                    <Link href="/perfil" className={linkClass('/perfil')}>
                        <User size={22} className={pathname === '/perfil' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : ''} />
                        Perfil
                    </Link>


                </div>
            </nav>

            {/* Snackbar controlado */}
            {message && <Snackbar message={message} type={type} />}

        </div>
    )
}
