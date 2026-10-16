// Quantos pedidos meus estão em andamento, por etapa (selos no ícone do carrinho da barra do topo).
// Conta pedidos únicos (checkout), não itens — mesma regra da aba "Pedidos" do carrinho.
'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface OrderStatusCounts { pending: number; preparing: number; ready: number }
const EMPTY: OrderStatusCounts = { pending: 0, preparing: 0, ready: 0 }

export function useOrderStatusCounts(userId: string | null | undefined): OrderStatusCounts {
    const [counts, setCounts] = useState<OrderStatusCounts>(EMPTY)
    // Nome único por instância (ver useChatUnread): dois lugares contando não podem disputar o mesmo canal
    const instance = useId()

    const refresh = useCallback(async () => {
        if (!userId) { setCounts(EMPTY); return }
        const { data } = await supabase
            .from('orders')
            .select('checkout_id, status')
            .eq('buyer_id', userId)
            .in('status', ['pending', 'preparing', 'ready'])
        const seen = new Set<string>()
        const next: OrderStatusCounts = { pending: 0, preparing: 0, ready: 0 }
        for (const o of (data as { checkout_id: string | null; status: keyof OrderStatusCounts }[]) || []) {
            const key = `${o.checkout_id ?? ''}:${o.status}`
            if (o.checkout_id && seen.has(key)) continue
            seen.add(key)
            if (o.status in next) next[o.status]++
        }
        setCounts((prev) => (prev.pending === next.pending && prev.preparing === next.preparing && prev.ready === next.ready ? prev : next))
    }, [userId])

    useEffect(() => {
        refresh()
        if (!userId) return
        const channel = supabase
            .channel(`order-status-${userId}-${instance}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => refresh())
            .subscribe()
        const onFocus = () => refresh()
        window.addEventListener('focus', onFocus)
        // rede de segurança: se o Realtime cair, o selo ainda se corrige
        const timer = setInterval(refresh, 60000)
        return () => {
            window.removeEventListener('focus', onFocus)
            clearInterval(timer)
            supabase.removeChannel(channel)
        }
    }, [userId, refresh, instance])

    return counts
}
