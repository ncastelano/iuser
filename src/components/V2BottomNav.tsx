// src/components/V2BottomNav.tsx
//
// A barra de baixo nova (BottomNavBar) na home da interface 2.0: mesmas contagens, mesma logo no centro; a foto leva ao painel do perfil
// (a 2.0 não tem o hub da 3.0). O que entra numa versão entra nas duas.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useOrderStatusCounts } from '@/hooks/useOrderStatusCounts'
import { useCartStore, cartItemLineTotal } from '@/store/useCartStore'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import BottomNavBar from '@/components/BottomNavBar'

export default function V2BottomNav() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, avatarUrl } = useProfile()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const unread = useChatUnread(userId)
    const orderCounts = useOrderStatusCounts(userId)
    const cartMap = useCartStore((st) => st.itemsByStore)
    const [cartReady, setCartReady] = useState(false)
    useEffect(() => setCartReady(true), [])
    const cartCount = cartReady ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0
    const cartTotal = cartReady ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + cartItemLineTotal(i), 0), 0) : 0
    const ordersActive = orderCounts.pending + orderCounts.preparing + orderCounts.ready
    const go = (path: string) => { startNavProgress(); router.push(path) }

    return (
        <BottomNavBar
            colors={colors}
            active="home"
            cartCount={cartCount}
            cartTotal={cartTotal}
            orderCounts={orderCounts}
            unread={unread}
            avatarLabel={userId ? 'Meu perfil' : 'Entrar'}
            avatar={avatarUrl
                ? <img src={avatarUrl} alt="" className="w-[34px] h-[34px] rounded-full object-cover" style={{ boxShadow: '0 0 0 2px #f97316' }} />
                : <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center" style={{ background: `${colors.border}b0`, color: colors.textSecondary }}><User size={19} /></span>}
            onCart={() => go(cartCount === 0 && ordersActive > 0 ? '/carrinho?aba=pedidos' : '/carrinho')}
            onChat={() => go(userId ? '/conversas' : '/login')}
            onHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onRadar={() => go('/radar')}
            onAvatar={() => go(userId ? '/?view=perfil' : '/?view=login')}
        />
    )
}
