'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useMerchantStore } from '@/store/useMerchantStore'

export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(s => s.setPendingOrdersCount)
    const setLatestOrderNotification = useMerchantStore(s => s.setLatestOrderNotification)
    const setCustomerOrderStatuses = useMerchantStore(s => s.setCustomerOrderStatuses)
    const setLatestCustomerNotification = useMerchantStore(s => s.setLatestCustomerNotification)

    const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const storesListRef = useRef<string[]>([])
    const lastCountRef = useRef<number | null>(null)
    const isFirstLoadRef = useRef(true)
    const statusMapRef = useRef<Record<string, string>>({})
    const userIdRef = useRef<string | null>(null)

    const notify = (title: string, body: string) => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: '/icon.png' }) } catch { }
        }
    }

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
        }

        const reloadMerchant = async () => {
            const ids = storesListRef.current
            if (!ids.length) return
            try {
                const [ordersRes, legacyRes] = await Promise.all([
                    supabase.from('orders').select('checkout_id').in('store_id', ids).eq('status', 'pending'),
                    supabase.from('store_sales').select('checkout_id').in('store_id', ids).eq('status', 'pending')
                ])
                const checkouts = new Set([
                    ...(ordersRes.data?.map(o => o.checkout_id) || []),
                    ...(legacyRes.data?.map(l => l.checkout_id) || [])
                ])
                const count = checkouts.size
                if (lastCountRef.current !== count) {
                    lastCountRef.current = count
                    setPendingOrdersCount(count)
                }
            } catch (e) {
                console.error('[OrderNotification] reload merchant error', e)
            }
        }

        const reloadCustomer = async (userId: string) => {
            try {
                const [ordersRes, legacyRes] = await Promise.all([
                    supabase.from('orders').select('id, status').eq('buyer_id', userId).in('status', ['pending', 'preparing', 'ready', 'paid']),
                    supabase.from('store_sales').select('id, status').eq('buyer_id', userId).in('status', ['pending', 'preparing', 'ready', 'paid'])
                ])
                const all = [...(ordersRes.data || []), ...(legacyRes.data || [])]
                if (!isFirstLoadRef.current) {
                    all.forEach(order => {
                        const old = statusMapRef.current[order.id]
                        if (old && old !== order.status) {
                            let msg = ''
                            if (order.status === 'preparing') msg = 'Seu pedido está em preparo!'
                            else if (order.status === 'ready') msg = 'Seu pedido está pronto!'
                            else if (order.status === 'paid') msg = 'Seu pedido foi finalizado!'
                            if (msg) {
                                setLatestCustomerNotification(msg)
                                notify('Atualização do Pedido', msg)
                            }
                        }
                    })
                }
                const newMap: Record<string, string> = {}
                all.forEach(o => { newMap[o.id] = o.status })
                statusMapRef.current = newMap
                isFirstLoadRef.current = false
                setCustomerOrderStatuses(Array.from(new Set(all.map(o => o.status))))
            } catch (e) {
                console.error('[OrderNotification] reload customer error', e)
            }
        }

        const cleanup = () => {
            channelsRef.current.forEach(ch => supabase.removeChannel(ch))
            channelsRef.current = []
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            storesListRef.current = []
            lastCountRef.current = null
        }

        const setup = async (userId: string) => {
            cleanup() // remove canais antigos antes de criar novos
            userIdRef.current = userId

            // --- Merchant ---
            const { data: stores } = await supabase.from('stores').select('id, name, storeSlug').eq('owner_id', userId)
            if (stores && stores.length > 0) {
                const storeMap: Record<string, { name: string; slug: string }> = {}
                stores.forEach(s => { storeMap[s.id] = { name: s.name, slug: s.storeSlug } })
                storesListRef.current = Object.keys(storeMap)
                await reloadMerchant()

                const ch1 = supabase.channel(`merchant-orders-${userId}`)
                ch1.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
                    if (storeMap[payload.new.store_id]) {
                        reloadMerchant()
                        if (payload.new.status === 'pending') {
                            const buyer = payload.new.buyer_profile_slug || 'cliente'
                            const store = storeMap[payload.new.store_id].slug
                            const msg = `Um pedido de /${buyer} na /${store}`
                            setLatestOrderNotification(msg)
                            notify('Novo Pedido!', msg)
                        }
                    }
                }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
                    if (storeMap[payload.new.store_id]) reloadMerchant()
                }).on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => reloadMerchant())
                ch1.subscribe()

                const ch2 = supabase.channel(`merchant-legacy-${userId}`)
                ch2.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'store_sales' }, payload => {
                    if (storeMap[payload.new.store_id]) {
                        reloadMerchant()
                        if (payload.new.status === 'pending') {
                            const buyer = payload.new.buyer_name || 'cliente'
                            const store = storeMap[payload.new.store_id].slug
                            const msg = `Um pedido de /${buyer} na /${store}`
                            setLatestOrderNotification(msg)
                            notify('Novo Pedido!', msg)
                        }
                    }
                }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_sales' }, payload => {
                    if (storeMap[payload.new.store_id]) reloadMerchant()
                }).on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'store_sales' }, () => reloadMerchant())
                ch2.subscribe()

                channelsRef.current.push(ch1, ch2)
            } else {
                setPendingOrdersCount(0)
            }

            // --- Customer ---
            await reloadCustomer(userId)
            const ch3 = supabase.channel(`customer-orders-${userId}`)
            ch3.on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => reloadCustomer(userId))
            ch3.subscribe()

            const ch4 = supabase.channel(`customer-legacy-${userId}`)
            ch4.on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales', filter: `buyer_id=eq.${userId}` }, () => reloadCustomer(userId))
            ch4.subscribe()

            channelsRef.current.push(ch3, ch4)

            // Polling de fallback a cada 5s
            pollRef.current = setInterval(() => {
                reloadMerchant()
                reloadCustomer(userId)
            }, 5000)
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setup(session.user.id)
            } else if (event === 'SIGNED_OUT') {
                cleanup()
                setPendingOrdersCount(0)
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
    }, [setPendingOrdersCount, setLatestOrderNotification, setCustomerOrderStatuses, setLatestCustomerNotification])

    return null
}