// Meus pedidos EM ANDAMENTO (enviado, preparando, pronto) com a loja e, na entrega, a etapa do motorista — para a faixa de cima da barra da 3.0.
// Um por checkout. Atualiza ao vivo (pedidos e entregas do cliente) e se corrige sozinho a cada 30 s.
'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { type MyOrder } from '@/modules/orders'
import { ORDERS_CHANGED_EVENT } from '@/lib/createStoreOrder'

export function useMyActiveOrders(userId: string | null | undefined): MyOrder[] {
    const [orders, setOrders] = useState<MyOrder[]>([])
    const instance = useId()

    const refresh = useCallback(async () => {
        if (!userId) { setOrders([]); return }
        const { data } = await supabase
            .from('orders')
            .select('id, checkout_id, status, delivery_option, created_at, stores(name)')
            .eq('buyer_id', userId)
            .in('status', ['pending', 'preparing', 'ready'])
            .order('created_at', { ascending: false })
            .limit(20)
        const rows = (data as any[]) || []
        let dispatchBy = new Map<string, { status: string | null; stage: string | null }>()
        const deliveryIds = rows.filter((r) => r.status === 'ready' && r.delivery_option !== 'retirada').map((r) => r.id as string)
        if (deliveryIds.length > 0) {
            const { data: d } = await supabase.from('order_delivery_dispatches').select('order_id, status, stage').in('order_id', deliveryIds)
            dispatchBy = new Map(((d as any[]) || []).map((x) => [x.order_id as string, { status: x.status ?? null, stage: x.stage ?? null }]))
        }
        const seen = new Set<string>()
        const next: MyOrder[] = []
        for (const r of rows) {
            const key = String(r.checkout_id ?? r.id)
            if (seen.has(key)) continue
            seen.add(key)
            const store = Array.isArray(r.stores) ? r.stores[0] : r.stores
            next.push({ key, status: r.status, storeName: store?.name || '', delivery: r.delivery_option !== 'retirada', dispatch: dispatchBy.get(r.id) ?? null })
        }
        setOrders((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }, [userId])

    useEffect(() => {
        refresh()
        if (!userId) return
        const channel = supabase
            .channel(`my-active-orders-${userId}-${instance}`)
            // `orders` NÃO está no tempo real (só os avisos e a entrega): cada mudança do pedido gera um aviso para o cliente (aceito, pronto, a caminho, entregue, recusado)
            // em `profile_notifications` — é ele que acorda a faixa; a escuta de `orders` fica por garantia (vale se a tabela entrar no tempo real)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profile_notifications', filter: `profile_id=eq.${userId}` }, () => refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_delivery_dispatches', filter: `customer_id=eq.${userId}` }, () => refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => refresh())
            .subscribe()
        const onFocus = () => refresh()
        window.addEventListener('focus', onFocus)
        window.addEventListener(ORDERS_CHANGED_EVENT, onFocus)
        // rede de segurança: com a aba à vista, confere de 15 em 15 s (é uma consulta pequena, só dos pedidos em andamento)
        const timer = setInterval(() => { if (!document.hidden) refresh() }, 15000)
        return () => {
            window.removeEventListener('focus', onFocus)
            window.removeEventListener(ORDERS_CHANGED_EVENT, onFocus)
            clearInterval(timer)
            supabase.removeChannel(channel)
        }
    }, [userId, refresh, instance])

    return orders
}
