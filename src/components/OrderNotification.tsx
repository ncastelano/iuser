'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useMerchantStore } from '@/store/useMerchantStore'

export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(s => s.setPendingOrdersCount)
    const setLatestOrderNotification = useMerchantStore(s => s.setLatestOrderNotification)
    const setCustomerOrderStatuses = useMerchantStore(s => s.setCustomerOrderStatuses)
    const setLatestCustomerNotification = useMerchantStore(s => s.setLatestCustomerNotification)

    // Refs estáveis
    const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const storesListRef = useRef<string[]>([])
    const lastCountRef = useRef<number | null>(null)
    const isFirstLoadRef = useRef(true)
    const statusMapRef = useRef<Record<string, string>>({})
    const userIdRef = useRef<string | null>(null)
    const isSettingUpRef = useRef(false)  // trava para evitar setup paralelo

    // Funções estáveis
    const notify = useCallback((title: string, body: string) => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: '/icon.png' }) } catch { }
        }
    }, [])

    const reloadMerchant = useCallback(async () => {
        const ids = storesListRef.current
        if (!ids.length) return
        try {
            const [ordersRes, legacyRes] = await Promise.all([
                supabase.from('orders').select('checkout_id').in('store_id', ids).eq('status', 'pending'),
                supabase.from('store_sales').select('checkout_id').in('store_id', ids).eq('status', 'pending')
            ])
            const checkouts = new Set([
                ...(ordersRes.data?.map((o: any) => o.checkout_id) || []),
                ...(legacyRes.data?.map((l: any) => l.checkout_id) || [])
            ])
            const count = checkouts.size
            if (lastCountRef.current !== count) {
                lastCountRef.current = count
                setPendingOrdersCount(count)
            }
        } catch (e) {
            console.error('[OrderNotification] reload merchant error', e)
        }
    }, [setPendingOrdersCount])

    const reloadCustomer = useCallback(async (userId: string) => {
        try {
            const [ordersRes, legacyRes] = await Promise.all([
                supabase.from('orders').select('id, status').eq('buyer_id', userId).in('status', ['pending', 'preparing', 'ready', 'paid']),
                supabase.from('store_sales').select('id, status').eq('buyer_id', userId).in('status', ['pending', 'preparing', 'ready', 'paid'])
            ])
            const all = [...(ordersRes.data || []), ...(legacyRes.data || [])]
            if (!isFirstLoadRef.current) {
                all.forEach((order: any) => {
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
            all.forEach((o: any) => { newMap[o.id] = o.status })
            statusMapRef.current = newMap
            isFirstLoadRef.current = false
            setCustomerOrderStatuses(Array.from(new Set(all.map((o: any) => o.status))))
        } catch (e) {
            console.error('[OrderNotification] reload customer error', e)
        }
    }, [setCustomerOrderStatuses, setLatestCustomerNotification, notify])

    // Limpeza total
    const cleanup = useCallback(() => {
        channelsRef.current.forEach(ch => supabase.removeChannel(ch))
        channelsRef.current = []
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
        storesListRef.current = []
        lastCountRef.current = null
        isSettingUpRef.current = false
    }, [])

    // Setup principal (protegido contra chamadas paralelas)
    const setup = useCallback(async (userId: string) => {
        // Se já está configurando, sai
        if (isSettingUpRef.current) return
        isSettingUpRef.current = true

        // Limpa tudo antes de começar
        cleanup()
        userIdRef.current = userId

        try {
            // --- Merchant ---
            const { data: stores } = await supabase.from('stores').select('id, name, storeSlug').eq('owner_id', userId)
            if (stores && stores.length > 0) {
                const storeMap: Record<string, { name: string; slug: string }> = {}
                stores.forEach((s: any) => { storeMap[s.id] = { name: s.name, slug: s.storeSlug } })
                storesListRef.current = Object.keys(storeMap)
                await reloadMerchant()

                // Usa timestamps para garantir nomes únicos e evitar colisões
                const ts = Date.now()
                const ch1 = supabase.channel(`merchant-orders-${userId}-${ts}`)
                ch1.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
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
                }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                    if (storeMap[payload.new.store_id]) reloadMerchant()
                }).on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => reloadMerchant())
                ch1.subscribe()

                const ch2 = supabase.channel(`merchant-legacy-${userId}-${ts}`)
                ch2.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'store_sales' }, (payload) => {
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
                }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_sales' }, (payload) => {
                    if (storeMap[payload.new.store_id]) reloadMerchant()
                }).on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'store_sales' }, () => reloadMerchant())
                ch2.subscribe()

                channelsRef.current.push(ch1, ch2)
            } else {
                setPendingOrdersCount(0)
            }

            // --- Customer ---
            await reloadCustomer(userId)
            const ts2 = Date.now()
            const ch3 = supabase.channel(`customer-orders-${userId}-${ts2}`)
            ch3.on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => reloadCustomer(userId))
            ch3.subscribe()

            const ch4 = supabase.channel(`customer-legacy-${userId}-${ts2}`)
            ch4.on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales', filter: `buyer_id=eq.${userId}` }, () => reloadCustomer(userId))
            ch4.subscribe()

            channelsRef.current.push(ch3, ch4)

            // Polling
            pollRef.current = setInterval(() => {
                reloadMerchant()
                reloadCustomer(userId)
            }, 5000)
        } catch (err) {
            console.error('[OrderNotification] setup error:', err)
        } finally {
            isSettingUpRef.current = false
        }
    }, [cleanup, reloadMerchant, reloadCustomer, setPendingOrdersCount, setLatestOrderNotification, notify])

    // Efeito único
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
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
    }, []) // array vazio = executa apenas na montagem

    return null
}