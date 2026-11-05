// src/versions/v3/screens/AtividadeTabs.tsx
//
// A fileira de subabas da ATIVIDADE (aba da barra da 3.0): Conversas · Pedidos · Carrinho · Biblioteca · Avisos. Cada uma abre a tela que já
// existia no endereço dela (/conversas, /carrinho, /carrinho?aba=pedidos|digital, /atividade); aqui só fica a fileira, igual nas cinco.
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, GraduationCap, MessageCircle, Package, ShoppingCart } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useOrderStatusCounts } from '@/hooks/useOrderStatusCounts'
import { useCartStore } from '@/store/useCartStore'
import PageTabs, { type Tab } from '@/components/PageTabs'
import { ATIVIDADE_ABAS, pathOfAba, type AtividadeAba } from '../atividade'
import { useBarKind } from '../bar/kind'

export const LAST_ABA_KEY = 'iuser_atividade_last'
const ICONS = { conversas: MessageCircle, pedidos: Package, carrinho: ShoppingCart, biblioteca: GraduationCap, avisos: Bell } as const

export default function AtividadeTabs({ aba }: { aba: AtividadeAba }) {
    const router = useRouter()
    const pathname = usePathname()
    const barKind = useBarKind()
    const { userId } = useProfile()
    const unread = useChatUnread(userId)
    const orders = useOrderStatusCounts(userId)
    const cartMap = useCartStore((st) => st.itemsByStore)
    const [ready, setReady] = useState(false)
    useEffect(() => setReady(true), [])
    const cart = ready ? Object.values(cartMap).reduce((a, items) => a + items.reduce((n, i) => n + i.quantity, 0), 0) : 0
    const ordersActive = orders.pending + orders.preparing + orders.ready

    // a última subaba vira o ponto de partida da aba Atividade quando nada pede atenção
    useEffect(() => { try { localStorage.setItem(LAST_ABA_KEY, aba) } catch { /* sem armazenamento */ } }, [aba])

    const badgeFor = (k: AtividadeAba): Tab['badge'] => {
        if (k === 'conversas') return unread > 0 ? { count: unread, color: '#16a34a' } : null
        if (k === 'pedidos') return ordersActive > 0 ? { count: ordersActive, color: orders.ready > 0 ? '#a855f7' : '#16a34a' } : null
        if (k === 'carrinho') return cart > 0 ? { count: cart, color: '#f97316' } : null
        return null
    }
    const tabs: Tab[] = ATIVIDADE_ABAS.map((a) => ({
        id: a.key,
        label: a.label,
        icon: ICONS[a.key],
        isActive: a.key === aba,
        badge: badgeFor(a.key),
        onClick: () => { if (a.key !== aba || pathname !== a.path.split('?')[0]) router.push(pathOfAba(a.key)); else router.replace(pathOfAba(a.key)) },
    }))
    // No modo loja ou motorista, as conversas são o trabalho daquele modo (aba Conversas da barra): sem a fileira das compras pessoais em cima
    if (aba === 'conversas' && barKind !== 'pessoa') return null
    return <PageTabs tabs={tabs} />
}
