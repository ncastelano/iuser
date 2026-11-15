// src/versions/v3/screens/AtividadeTabs.tsx
//
// A fileira de subabas da ATIVIDADE (aba da barra da 3.0): Conversas · Pedidos · Carrinho · Biblioteca (as notificações do perfil ficam no painel do perfil, pelo sininho da barra). É um CONTROLE SEGMENTADO (uma trilha só, a aba atual
// "levanta" nela, ícone em cima e nome embaixo), de propósito diferente das pílulas das salas de conversa logo abaixo, para não parecerem duas fileiras iguais.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, MessageCircle, Package, ShoppingCart } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useOrderStatusCounts } from '@/hooks/useOrderStatusCounts'
import { useCartStore } from '@/store/useCartStore'
import { ATIVIDADE_ABAS, pathOfAba, type AtividadeAba } from '../atividade'
import { useBarKind } from '../bar/kind'

export const LAST_ABA_KEY = 'iuser_atividade_last'
const ICONS = { conversas: MessageCircle, pedidos: Package, carrinho: ShoppingCart, biblioteca: GraduationCap } as const

export default function AtividadeTabs({ aba }: { aba: AtividadeAba }) {
    const router = useRouter()
    const { colors } = useTheme()
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

    const badgeFor = (k: AtividadeAba): { n: number; color: string } | null => {
        if (k === 'conversas') return unread > 0 ? { n: unread, color: '#16a34a' } : null
        if (k === 'pedidos') return ordersActive > 0 ? { n: ordersActive, color: orders.ready > 0 ? '#a855f7' : '#16a34a' } : null
        if (k === 'carrinho') return cart > 0 ? { n: cart, color: '#f97316' } : null
        return null
    }
    // No modo loja ou motorista, as conversas são o trabalho daquele modo (aba Conversas da barra): sem a fileira das compras pessoais em cima
    if (aba === 'conversas' && barKind !== 'pessoa') return null

    return (
        <div role="tablist" aria-label="Atividade" className="mt-1 p-1 rounded-[20px] flex gap-0.5" style={{ background: `${colors.border}45` }}>
            {ATIVIDADE_ABAS.map((a) => {
                const Icon = ICONS[a.key]
                const active = a.key === aba
                const b = badgeFor(a.key)
                return (
                    <button
                        key={a.key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => { if (!active) router.push(pathOfAba(a.key)) }}
                        className="relative flex-1 min-w-0 h-[54px] rounded-2xl flex flex-col items-center justify-center gap-[3px] transition active:scale-95"
                        style={active
                            ? { background: colors.background, color: '#f97316', boxShadow: '0 2px 10px rgba(0,0,0,0.14)' }
                            : { color: colors.textSecondary }}
                    >
                        <span className="relative">
                            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                            {b && <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-black text-white flex items-center justify-center" style={{ background: b.color, boxShadow: `0 0 0 2px ${active ? colors.background : `${colors.border}`}` }}>{b.n > 99 ? '99+' : b.n}</span>}
                        </span>
                        <span className="text-[10.5px] leading-none truncate max-w-full px-0.5" style={{ fontWeight: active ? 900 : 700 }}>{a.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
