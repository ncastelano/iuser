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
import { useMerchantStore } from '@/store/useMerchantStore'
import { BottomNav } from '@/components/BottomNav'

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

    const latestOrderNotification = useMerchantStore(state => state.latestOrderNotification)
    const setLatestOrderNotification = useMerchantStore(state => state.setLatestOrderNotification)

    useEffect(() => {
        if (latestOrderNotification) {
            setMessage(latestOrderNotification)
            setType('success')
            
            const timer = setTimeout(() => {
                setMessage(null)
                setLatestOrderNotification(null)
            }, 5000)
            
            return () => clearTimeout(timer)
        }
    }, [latestOrderNotification, setLatestOrderNotification])

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
                /* Some animations are now in BottomNav, kept for potential other uses or can be removed */
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



            {/* Bottom Navbar */}
            <BottomNav />

            {message && <Snackbar message={message} type={type} />}
        </div>
    )
}