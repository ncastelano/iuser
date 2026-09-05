'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, DollarSign, CreditCard, Truck, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useMerchantStore, type StoreOrderCounts } from '@/store/useMerchantStore'

const NOTIFICATION_GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const PAYMENT_LABELS: Record<string, string> = {
    pix: 'PIX',
    cartao: 'Cartão',
    dinheiro: 'Dinheiro',
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
}

const DELIVERY_LABELS: Record<string, string> = {
    entrega: 'Entrega',
    pickup: 'Retirada / Presencial',
}

interface PendingOrderInfo {
    storeName: string
    buyerLabel: string
    totalAmount: number
    paymentMethod?: string | null
    deliveryOption?: string | null
}

// Card persistente: fica na tela até o pedido sair de "pending" (aceito/recusado/etc.)
function showOrderCard(orderId: string, order: PendingOrderInfo) {
    const paymentLabel = order.paymentMethod ? (PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod) : null
    const deliveryLabel = order.deliveryOption ? (DELIVERY_LABELS[order.deliveryOption] || order.deliveryOption) : null

    toast.custom((id) => (
        <div
            style={{
                background: NOTIFICATION_GRADIENT,
                color: '#ffffff',
                borderRadius: 20,
                padding: '14px 16px',
                boxShadow: '0 12px 32px rgba(220,38,38,0.45)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                width: 340,
                maxWidth: '92vw',
            }}
        >
            <div
                style={{
                    width: 46,
                    height: 46,
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.22)',
                    border: '1.5px solid rgba(255,255,255,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <ShoppingBag size={22} color="#ffffff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontWeight: 800, fontSize: 13, color: '#ffffff', margin: 0 }}>
                        Novo pedido pendente
                    </p>
                    <span
                        style={{
                            fontSize: 9,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            background: 'rgba(255,255,255,0.25)',
                            color: '#ffffff',
                            borderRadius: 9999,
                            padding: '1px 6px',
                        }}
                    >
                        aguardando
                    </span>
                </div>
                <p style={{ fontSize: 12, color: '#ffffff', opacity: 0.95, margin: '2px 0 0', fontWeight: 700 }}>
                    {order.storeName}
                </p>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 11.5, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={11} color="#ffffff" /> {order.buyerLabel}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DollarSign size={11} color="#ffffff" /> R$ {order.totalAmount.toFixed(2)}
                    </span>
                    {paymentLabel && (
                        <span style={{ fontSize: 11.5, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CreditCard size={11} color="#ffffff" /> {paymentLabel}
                        </span>
                    )}
                    {deliveryLabel && (
                        <span style={{ fontSize: 11.5, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Truck size={11} color="#ffffff" /> {deliveryLabel}
                        </span>
                    )}
                </div>
            </div>
            <button
                onClick={() => toast.dismiss(id)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 9999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
                aria-label="Fechar"
            >
                <X size={13} />
            </button>
        </div>
    ), { id: `order-${orderId}`, duration: Infinity })
}

export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(s => s.setPendingOrdersCount)
    const setLatestOrderNotification = useMerchantStore(s => s.setLatestOrderNotification)
    const setCustomerOrderStatuses = useMerchantStore(s => s.setCustomerOrderStatuses)
    const setLatestCustomerNotification = useMerchantStore(s => s.setLatestCustomerNotification)
    const setStoreOrderCounts = useMerchantStore(s => s.setStoreOrderCounts)

    const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const storesListRef = useRef<string[]>([])
    const storeMapRef = useRef<Record<string, { name: string; slug: string }>>({})
    const lastCountRef = useRef<number | null>(null)
    const pendingOrderIdsRef = useRef<Set<string>>(new Set())
    const isFirstLoadRef = useRef(true)
    const statusMapRef = useRef<Record<string, string>>({})
    const userIdRef = useRef<string | null>(null)
    const isSettingUpRef = useRef(false)

    const notify = useCallback((title: string, body: string) => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: '/icon.png' }) } catch { }
        }
    }, [])

    const dismissOrderCards = useCallback(() => {
        pendingOrderIdsRef.current.forEach((id) => toast.dismiss(`order-${id}`))
        pendingOrderIdsRef.current = new Set()
    }, [])

    // Merchant: contagens (gerais e por loja) + cards persistentes de pedidos pendentes
    const reloadMerchant = useCallback(async () => {
        const ids = storesListRef.current
        if (!ids.length) return
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, store_id, status, checkout_id, buyer_name, buyer_profile_slug, total_amount, payment_method, delivery_option')
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

            // Cards de notificação: um por pedido pendente, até ele deixar de estar pendente
            const currentIds = new Set<string>(pendingOrders.map((o: any) => o.id))
            pendingOrders.forEach((o: any) => {
                const store = storeMapRef.current[o.store_id]
                if (!store) return
                showOrderCard(o.id, {
                    storeName: store.name,
                    buyerLabel: o.buyer_profile_slug ? `@${o.buyer_profile_slug}` : (o.buyer_name || 'Cliente presencial'),
                    totalAmount: Number(o.total_amount || 0),
                    paymentMethod: o.payment_method,
                    deliveryOption: o.delivery_option,
                })
            })
            pendingOrderIdsRef.current.forEach((id) => {
                if (!currentIds.has(id)) toast.dismiss(`order-${id}`)
            })
            pendingOrderIdsRef.current = currentIds
        } catch (e) {
            console.error('[OrderNotification] reload merchant error', e)
        }
    }, [setPendingOrdersCount, setStoreOrderCounts])

    // Customer: busca apenas orders do comprador
    const reloadCustomer = useCallback(async (userId: string) => {
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, status')
                .eq('buyer_id', userId)
                .in('status', ['pending', 'preparing', 'ready', 'paid'])

            if (!orders) return

            if (!isFirstLoadRef.current) {
                orders.forEach((order: any) => {
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
            orders.forEach((o: any) => { newMap[o.id] = o.status })
            statusMapRef.current = newMap
            isFirstLoadRef.current = false

            setCustomerOrderStatuses(Array.from(new Set(orders.map((o: any) => o.status))))
        } catch (e) {
            console.error('[OrderNotification] reload customer error', e)
        }
    }, [setCustomerOrderStatuses, setLatestCustomerNotification, notify])

    const cleanup = useCallback(() => {
        channelsRef.current.forEach(ch => supabase.removeChannel(ch))
        channelsRef.current = []
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
        dismissOrderCards()
        storesListRef.current = []
        storeMapRef.current = {}
        lastCountRef.current = null
        isSettingUpRef.current = false
    }, [dismissOrderCards])

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
                        if (storeMap[payload.new.store_id]) {
                            if (payload.new.status === 'pending') {
                                const buyer = payload.new.buyer_profile_slug || 'cliente'
                                const store = storeMap[payload.new.store_id].slug
                                const msg = `Novo pedido de /${buyer} na /${store}`
                                setLatestOrderNotification(msg)
                                notify('Novo Pedido!', msg)
                            }
                            reloadMerchant()
                        }
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
    }, [cleanup, reloadMerchant, reloadCustomer, setPendingOrdersCount, setStoreOrderCounts, setLatestOrderNotification, notify])

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
