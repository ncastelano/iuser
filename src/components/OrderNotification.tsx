'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useMerchantStore, type StoreOrderCounts } from '@/store/useMerchantStore'

// Este componente só mantém contagens/badges em tempo real.
// Notificações de verdade (novo pedido, mudança de status) vão só pela
// barra de notificação do celular via push real (veja src/app/api/push/*).
export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(s => s.setPendingOrdersCount)
    const setCustomerOrderStatuses = useMerchantStore(s => s.setCustomerOrderStatuses)
    const setStoreOrderCounts = useMerchantStore(s => s.setStoreOrderCounts)

    const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const storesListRef = useRef<string[]>([])
    const storeMapRef = useRef<Record<string, { name: string; slug: string }>>({})
    const lastCountRef = useRef<number | null>(null)
    const userIdRef = useRef<string | null>(null)
    const isSettingUpRef = useRef(false)

    // Merchant: contagens gerais e por loja, usadas em badges/indicadores
    const reloadMerchant = useCallback(async () => {
        const ids = storesListRef.current
        if (!ids.length) return
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, store_id, status, checkout_id')
                .in('store_id', ids)
                .in('status', ['pending', 'preparing', 'ready'])

            const allOrders = orders || []
            const pendingOrders = allOrders.filter((o: any) => o.status === 'pending')

            // Contagem agregada (dedupe por checkout) — usada em badges/indicadores gerais
            const checkouts = new Set(pendingOrders.map((o: any) => o.checkout_id))
            const count = checkouts.size
            if (lastCountRef.current !== count) {
                lastCountRef.current = count
                setPendingOrdersCount(count)
            }

            // Contagem por loja — alimenta o indicador da aba de cada loja em tempo real
            const perStore: Record<string, StoreOrderCounts> = {}
            ids.forEach((id) => { perStore[id] = { pending: 0, preparing: 0, ready: 0 } })
            allOrders.forEach((o: any) => {
                if (perStore[o.store_id]) {
                    perStore[o.store_id][o.status as 'pending' | 'preparing' | 'ready']++
                }
            })
            setStoreOrderCounts(perStore)
        } catch (e) {
            console.error('[OrderNotification] reload merchant error', e)
        }
    }, [setPendingOrdersCount, setStoreOrderCounts])

    // Customer: busca apenas orders do comprador, para os indicadores de status
    const reloadCustomer = useCallback(async (userId: string) => {
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, status')
                .eq('buyer_id', userId)
                .in('status', ['pending', 'preparing', 'ready', 'paid'])

            if (!orders) return

            setCustomerOrderStatuses(Array.from(new Set(orders.map((o: any) => o.status))))
        } catch (e) {
            console.error('[OrderNotification] reload customer error', e)
        }
    }, [setCustomerOrderStatuses])

    const cleanup = useCallback(() => {
        channelsRef.current.forEach(ch => supabase.removeChannel(ch))
        channelsRef.current = []
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
        storesListRef.current = []
        storeMapRef.current = {}
        lastCountRef.current = null
        isSettingUpRef.current = false
    }, [])

    const setup = useCallback(async (userId: string) => {
        if (isSettingUpRef.current) return
        isSettingUpRef.current = true

        cleanup()
        userIdRef.current = userId

        try {
            // --- Merchant ---
            const { data: stores } = await supabase
                .from('stores')
                .select('id, name, storeSlug')
                .eq('owner_id', userId)

            if (stores && stores.length > 0) {
                const storeMap: Record<string, { name: string; slug: string }> = {}
                stores.forEach((s: any) => { storeMap[s.id] = { name: s.name, slug: s.storeSlug } })
                storesListRef.current = Object.keys(storeMap)
                storeMapRef.current = storeMap
                await reloadMerchant()

                const ts = Date.now()
                // Canal único para orders do lojista (INSERT, UPDATE, DELETE)
                const merchantChannel = supabase.channel(`merchant-orders-${userId}-${ts}`)
                merchantChannel
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                        if (storeMap[payload.new.store_id]) reloadMerchant()
                    })
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                        if (storeMap[payload.new.store_id]) reloadMerchant()
                    })
                    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => reloadMerchant())
                merchantChannel.subscribe()

                channelsRef.current.push(merchantChannel)
            } else {
                setPendingOrdersCount(0)
                setStoreOrderCounts({})
            }

            // --- Customer ---
            await reloadCustomer(userId)
            const ts2 = Date.now()
            const customerChannel = supabase.channel(`customer-orders-${userId}-${ts2}`)
            customerChannel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => reloadCustomer(userId))
            customerChannel.subscribe()
            channelsRef.current.push(customerChannel)

            // Polling de segurança
            pollRef.current = setInterval(() => {
                reloadMerchant()
                reloadCustomer(userId)
            }, 5000)
        } catch (err) {
            console.error('[OrderNotification] setup error:', err)
        } finally {
            isSettingUpRef.current = false
        }
    }, [cleanup, reloadMerchant, reloadCustomer, setPendingOrdersCount, setStoreOrderCounts])

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setup(session.user.id)
            } else if (event === 'SIGNED_OUT') {
                cleanup()
                setPendingOrdersCount(0)
                setStoreOrderCounts({})
                setCustomerOrderStatuses([])
            }
        })

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setup(session.user.id)
        })

        const onVisible = () => {
            if (document.visibilityState === 'visible' && userIdRef.current) {
                reloadMerchant()
                reloadCustomer(userIdRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            subscription.unsubscribe()
            cleanup()
        }
    }, []) // executa apenas na montagem

    return null
}
