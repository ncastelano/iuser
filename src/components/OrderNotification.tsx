'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMerchantStore } from '@/store/useMerchantStore'

const supabase = createClient()

export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(state => state.setPendingOrdersCount)
    const setLatestOrderNotification = useMerchantStore(state => state.setLatestOrderNotification)
    const setCustomerOrderStatuses = useMerchantStore(state => state.setCustomerOrderStatuses)
    
    const merchantChannelRef = useRef<any>(null)
    const customerChannelRef = useRef<any>(null)
    const pollIntervalRef = useRef<any>(null)
    const storesListRef = useRef<string[]>([])
    const lastFetchedCountRef = useRef<number | null>(null)
    const isFirstLoadRef = useRef(true)
    const currentUserIdRef = useRef<string | null>(null)

    useEffect(() => {
        const reloadMerchantCount = async () => {
            const storeIds = storesListRef.current
            if (!storeIds.length) return
            
            try {
                // Busca na tabela nova (orders)
                const { data: ordersData, error: ordersError } = await supabase
                    .from('orders')
                    .select('checkout_id')
                    .in('store_id', storeIds)
                    .eq('status', 'pending')
                
                // Busca na tabela legada (store_sales)
                const { data: legacyData, error: legacyError } = await supabase
                    .from('store_sales')
                    .select('checkout_id')
                    .in('store_id', storeIds)
                    .eq('status', 'pending')
                
                if (!ordersError || !legacyError) {
                    const uniqueCheckouts = new Set([
                        ...(ordersData?.map(o => o.checkout_id) || []),
                        ...(legacyData?.map(l => l.checkout_id) || [])
                    ])
                    const totalCount = uniqueCheckouts.size
                    
                    if (lastFetchedCountRef.current !== totalCount) {
                        lastFetchedCountRef.current = totalCount
                        setPendingOrdersCount(totalCount)
                    }
                }
            } catch (err) {
                console.error('[OrderNotification] Count reload failed:', err)
            }
        }

        const reloadCustomerStatuses = async (userId: string) => {
            try {
                // Busca orders novas
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('status')
                    .eq('buyer_id', userId)
                    .in('status', ['pending', 'preparing', 'ready'])
                
                // Busca orders legadas
                const { data: legacyData } = await supabase
                    .from('store_sales')
                    .select('status')
                    .eq('buyer_id', userId)
                    .in('status', ['pending', 'preparing', 'ready'])

                const allStatuses = [
                    ...(ordersData?.map(o => o.status) || []),
                    ...(legacyData?.map(l => l.status) || [])
                ]
                // Deduplicar para pegar apenas quais status únicos estão ativos
                const uniqueStatuses = Array.from(new Set(allStatuses))
                setCustomerOrderStatuses(uniqueStatuses)
            } catch (err) {
                console.error('[OrderNotification] Customer status reload failed:', err)
            }
        }

        const setupMerchant = async (userId: string) => {
            try {
                const { data: myStores, error } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug')
                    .eq('owner_id', userId)
                
                if (error) {
                    console.error('[OrderNotification] Error fetching stores:', error.message)
                    return
                }

                // Se o fetch funcionou mas não tem lojas, o contador é 0
                if (!myStores || myStores.length === 0) {
                    setPendingOrdersCount(0)
                    storesListRef.current = []
                    return
                }

                const storeMap: Record<string, { name: string, slug: string }> = {}
                myStores.forEach(s => { 
                    storeMap[s.id] = { name: s.name, slug: s.storeSlug } 
                })
                storesListRef.current = Object.keys(storeMap)

                // Inicializar Contador
                await reloadMerchantCount()

                // Canais Realtime
                if (!merchantChannelRef.current) {
                    // Listener para a tabela nova (orders)
                    const ordersChannel = supabase.channel(`global-notifs-${userId}-orders`)
                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                            if (storeMap[payload.new.store_id]) {
                                reloadMerchantCount()
                                if (payload.new.status === 'pending') {
                                    const buyer = payload.new.buyer_profile_slug || 'cliente'
                                    const store = storeMap[payload.new.store_id].slug
                                    setLatestOrderNotification(`Um pedido de /${buyer} na /${store}`)
                                }
                            }
                        })
                        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                            if (storeMap[payload.new.store_id]) reloadMerchantCount()
                        })
                        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => {
                            reloadMerchantCount()
                        })

                    // Listener para a tabela legada (store_sales)
                    const legacyChannel = supabase.channel(`global-notifs-${userId}-legacy`)
                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'store_sales' }, (payload) => {
                            if (storeMap[payload.new.store_id]) {
                                reloadMerchantCount()
                                if (payload.new.status === 'pending') {
                                    const buyer = payload.new.buyer_name || 'cliente'
                                    const store = storeMap[payload.new.store_id].slug
                                    setLatestOrderNotification(`Um pedido de /${buyer} na /${store}`)
                                }
                            }
                        })
                        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'store_sales' }, (payload) => {
                            if (storeMap[payload.new.store_id]) reloadMerchantCount()
                        })
                        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'store_sales' }, () => {
                            reloadMerchantCount()
                        })

                    merchantChannelRef.current = {
                        unsubscribe: () => {
                            ordersChannel.unsubscribe()
                            legacyChannel.unsubscribe()
                        }
                    }

                    ordersChannel.subscribe()
                    legacyChannel.subscribe()
                }

                // Polling
                if (!pollIntervalRef.current) {
                    pollIntervalRef.current = setInterval(() => {
                        reloadMerchantCount()
                        if (currentUserIdRef.current) {
                            reloadCustomerStatuses(currentUserIdRef.current)
                        }
                    }, 5000)
                }
            } catch (err) {
                console.error('[OrderNotification] Setup failed:', err)
            }
        }



        const setupCustomer = async (userId: string) => {
            try {
                await reloadCustomerStatuses(userId)

                if (!customerChannelRef.current) {
                    const legacyCustomerChannel = supabase.channel(`global-customer-notifs-${userId}-legacy`)
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales', filter: `buyer_id=eq.${userId}` }, () => {
                            reloadCustomerStatuses(userId)
                        })

                    const ordersCustomerChannel = supabase.channel(`global-customer-notifs-${userId}-orders`)
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, () => {
                            reloadCustomerStatuses(userId)
                        })

                    customerChannelRef.current = {
                        unsubscribe: () => {
                            legacyCustomerChannel.unsubscribe()
                            ordersCustomerChannel.unsubscribe()
                        }
                    }

                    legacyCustomerChannel.subscribe()
                    ordersCustomerChannel.subscribe()
                }
            } catch (err) {
                console.error('[OrderNotification] Customer setup failed:', err)
            }
        }

        const handleAuthAction = async (session: any) => {
            if (session?.user) {
                currentUserIdRef.current = session.user.id
                await setupMerchant(session.user.id)
                await setupCustomer(session.user.id)
            }
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                handleAuthAction(session)
            } else if (event === 'SIGNED_OUT') {
                setPendingOrdersCount(0)
                setCustomerOrderStatuses([])
                lastFetchedCountRef.current = null
                if (merchantChannelRef.current) {
                    if (typeof merchantChannelRef.current.unsubscribe === 'function') {
                        merchantChannelRef.current.unsubscribe()
                    } else {
                        supabase.removeChannel(merchantChannelRef.current)
                    }
                    merchantChannelRef.current = null
                }
                if (customerChannelRef.current) {
                    if (typeof customerChannelRef.current.unsubscribe === 'function') {
                        customerChannelRef.current.unsubscribe()
                    } else {
                        supabase.removeChannel(customerChannelRef.current)
                    }
                    customerChannelRef.current = null
                }
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current)
                    pollIntervalRef.current = null
                }
                storesListRef.current = []
            }
        })

        // Inicialização
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) handleAuthAction(session)
        })

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                if (storesListRef.current.length > 0) reloadMerchantCount()
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session?.user) reloadCustomerStatuses(session.user.id)
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            subscription.unsubscribe()
        }
    }, [setPendingOrdersCount, setLatestOrderNotification])

    return null
}
