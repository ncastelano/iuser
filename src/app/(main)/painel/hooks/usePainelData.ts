'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Store, Sale, Profile } from '../types'

export function usePainelData() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [sales, setSales] = useState<Sale[]>([])
    const [myPurchases, setMyPurchases] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [profile, setProfile] = useState<Profile | null>(null)

    const loadFinanceData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // Carrega perfil
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            setProfile(profileData)

            // Carrega lojas do usuário
            const { data: myStores } = await supabase.from('stores').select('*').eq('owner_id', user.id)
            if (myStores) {
                setStores(myStores)

                // Se tem lojas, busca os pedidos
                if (myStores.length > 0) {
                    const storeIds = myStores.map(s => s.id)

                    const { data: ordersData } = await supabase
                        .from('orders')
                        .select('*, order_items(*)')
                        .in('store_id', storeIds)
                        .order('created_at', { ascending: false })

                    if (ordersData && ordersData.length > 0) {
                        const formattedSales: Sale[] = []
                        ordersData.forEach(order => {
                            if (order.order_items && order.order_items.length > 0) {
                                order.order_items.forEach((item: any) => {
                                    formattedSales.push({
                                        id: item.id,
                                        created_at: order.created_at,
                                        price: item.total_price || item.price,
                                        quantity: item.quantity,
                                        product_name: item.product_name,
                                        buyer_id: order.buyer_id,
                                        buyer_name: order.buyer_name,
                                        buyer_profile_slug: order.buyer_profile_slug,
                                        store_id: order.store_id,
                                        status: order.status,
                                        checkout_id: order.checkout_id
                                    })
                                })
                            }
                        })
                        setSales(formattedSales)
                    } else {
                        const { data: storeSalesData } = await supabase
                            .from('store_sales')
                            .select('*')
                            .in('store_id', storeIds)
                            .order('created_at', { ascending: false })

                        if (storeSalesData) {
                            setSales(storeSalesData as Sale[])
                        }
                    }
                }
            }

            // Carrega compras do usuário
            const { data: userPurchases } = await supabase
                .from('orders')
                .select('*, order_items(*), stores(name)')
                .eq('buyer_id', user.id)
                .order('created_at', { ascending: false })

            if (userPurchases && userPurchases.length > 0) {
                const formattedPurchases: Sale[] = []
                userPurchases.forEach(order => {
                    if (order.order_items && order.order_items.length > 0) {
                        order.order_items.forEach((item: any) => {
                            formattedPurchases.push({
                                id: item.id,
                                created_at: order.created_at,
                                price: item.total_price || item.price,
                                quantity: item.quantity,
                                product_name: item.product_name,
                                buyer_id: order.buyer_id,
                                buyer_name: order.buyer_name,
                                buyer_profile_slug: order.buyer_profile_slug,
                                store_id: order.store_id,
                                status: order.status,
                                checkout_id: order.checkout_id,
                                store_name: order.stores?.name
                            })
                        })
                    }
                })
                setMyPurchases(formattedPurchases)
            } else {
                const { data: legacyPurchases } = await supabase
                    .from('store_sales')
                    .select('*, stores(name)')
                    .eq('buyer_id', user.id)
                    .order('created_at', { ascending: false })

                if (legacyPurchases) {
                    setMyPurchases(legacyPurchases.map((p: any) => ({
                        ...p,
                        store_name: p.stores?.name
                    })))
                }
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error)
            toast.error('Erro ao carregar dados do painel')
        } finally {
            setLoading(false)
        }
    }

    const toggleStoreStatus = async (storeId: string) => {
        const store = stores.find(s => s.id === storeId)
        if (!store) return
        const newStatus = !store.is_open
        const { error } = await supabase.from('stores').update({ is_open: newStatus }).eq('id', storeId)
        if (!error) {
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, is_open: newStatus } : s))
            toast.success(`Loja ${newStatus ? 'aberta' : 'fechada'}!`)
        }
    }

    useEffect(() => {
        loadFinanceData()

        const channel = supabase.channel('painel-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadFinanceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales' }, () => loadFinanceData())
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    return {
        stores,
        sales,
        myPurchases,
        loading,
        profile,
        toggleStoreStatus,
        loadFinanceData,
        supabase
    }
}