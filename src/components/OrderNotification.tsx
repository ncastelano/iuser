'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useMerchantStore } from '@/store/useMerchantStore'

export function OrderNotification() {
    const supabase = createClient()
    const setPendingOrdersCount = useMerchantStore(state => state.setPendingOrdersCount)

    useEffect(() => {
        let channel: any = null

        async function setup() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Load stores owned by the user
            const { data: myStores } = await supabase.from('stores').select('id, name').eq('owner_id', user.id)
            if (!myStores || myStores.length === 0) return

            const storeMap: Record<string, string> = {}
            myStores.forEach(s => {
                storeMap[s.id] = s.name
            })

            // Busca a contagem inicial de pedidos pendentes
            const storeIds = Object.keys(storeMap)
            if (storeIds.length > 0) {
                const { count } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .in('store_id', storeIds)
                    .eq('status', 'pending')
                
                setPendingOrdersCount(count || 0)
            }

            // Listen to new orders and updates
            channel = supabase
                .channel('global-order-notifications')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'orders' },
                    (payload) => {
                        const storeId = payload.new.store_id
                        if (storeMap[storeId]) {
                            if (payload.new.status === 'pending') {
                                setPendingOrdersCount(useMerchantStore.getState().pendingOrdersCount + 1)
                            }
                            const amount = payload.new.total_amount || 0
                            toast.success(`🚨 Novo pedido em ${storeMap[storeId]}! R$ ${amount.toFixed(2)}`)
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'orders' },
                    (payload) => {
                        const storeId = payload.new.store_id
                        if (storeMap[storeId]) {
                            const oldStatus = payload.old?.status
                            const newStatus = payload.new.status
                            
                            // Se era pendente e agora não é mais, diminui
                            if (oldStatus === 'pending' && newStatus !== 'pending') {
                                setPendingOrdersCount(Math.max(0, useMerchantStore.getState().pendingOrdersCount - 1))
                            }
                            // Se não era pendente e agora é, aumenta
                            else if (oldStatus !== 'pending' && newStatus === 'pending') {
                                setPendingOrdersCount(useMerchantStore.getState().pendingOrdersCount + 1)
                            }
                        }
                    }
                )
                .subscribe()
        }

        setup()

        return () => {
            if (channel) {
                supabase.removeChannel(channel)
            }
        }
    }, [])

    return null
}
