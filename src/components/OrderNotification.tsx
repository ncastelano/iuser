'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, DollarSign, CreditCard, Truck, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useMerchantStore } from '@/store/useMerchantStore'

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

function showNewOrderCard(order: {
    storeName: string
    buyerLabel: string
    totalAmount: number
    paymentMethod?: string | null
    deliveryOption?: string | null
}) {
    const paymentLabel = order.paymentMethod ? (PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod) : null
    const deliveryLabel = order.deliveryOption ? (DELIVERY_LABELS[order.deliveryOption] || order.deliveryOption) : null

    toast.custom((id) => (
        <div
            style={{
                background: NOTIFICATION_GRADIENT,
                color: '#ffffff',
                borderRadius: 20,
                padding: '16px 18px',
                boxShadow: '0 12px 32px rgba(220,38,38,0.45)',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                width: 340,
                maxWidth: '92vw',
            }}
        >
            <div
                style={{
                    width: 42,
                    height: 42,
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <ShoppingBag size={20} color="#ffffff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#ffffff', margin: 0 }}>
                    Novo pedido recebido!
                </p>
                <p style={{ fontSize: 12, color: '#ffffff', opacity: 0.95, margin: '2px 0 0', fontWeight: 700 }}>
                    {order.storeName}
                </p>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={12} color="#ffffff" /> {order.buyerLabel}
                    </span>
                    <span style={{ fontSize: 12, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DollarSign size={12} color="#ffffff" /> R$ {order.totalAmount.toFixed(2)}
                    </span>
                    {paymentLabel && (
                        <span style={{ fontSize: 12, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CreditCard size={12} color="#ffffff" /> {paymentLabel}
                        </span>
                    )}
                    {deliveryLabel && (
                        <span style={{ fontSize: 12, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Truck size={12} color="#ffffff" /> {deliveryLabel}
                        </span>
                    )}
                </div>
            </div>
            <button
                onClick={() => toast.dismiss(id)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', flexShrink: 0, opacity: 0.85, padding: 0 }}
                aria-label="Fechar"
            >
                <X size={16} />
            </button>
        </div>
    ), { duration: 10000 })
}

export function OrderNotification() {
    const setPendingOrdersCount = useMerchantStore(s => s.setPendingOrdersCount)
    const setLatestOrderNotification = useMerchantStore(s => s.setLatestOrderNotification)
    const setCustomerOrderStatuses = useMerchantStore(s => s.setCustomerOrderStatuses)
    const setLatestCustomerNotification = useMerchantStore(s => s.setLatestCustomerNotification)

    const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const storesListRef = useRef<string[]>([])
    const storeMapRef = useRef<Record<string, { name: string; slug: string }>>({})
    const lastCountRef = useRef<number | null>(null)
    const isFirstLoadRef = useRef(true)
    const statusMapRef = useRef<Record<string, string>>({})
    const userIdRef = useRef<string | null>(null)
    const isSettingUpRef = useRef(false)

    const notify = useCallback((title: string, body: string) => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: '/icon.png' }) } catch { }
        }
    }, [])

    // Merchant: conta apenas pedidos pendentes da tabela orders
    const reloadMerchant = useCallback(async () => {
        const ids = storesListRef.current
        if (!ids.length) return
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('checkout_id')
                .in('store_id', ids)
                .eq('status', 'pending')

            const checkouts = new Set(orders?.map((o: any) => o.checkout_id) || [])
            const count = checkouts.size
            if (lastCountRef.current !== count) {
                lastCountRef.current = count
                setPendingOrdersCount(count)
            }
        } catch (e) {
            console.error('[OrderNotification] reload merchant error', e)
        }
    }, [setPendingOrdersCount])

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
                        if (storeMap[payload.new.store_id]) {
                            reloadMerchant()
                            if (payload.new.status === 'pending') {
                                const buyer = payload.new.buyer_profile_slug || 'cliente'
                                const store = storeMap[payload.new.store_id].slug
                                const msg = `Novo pedido de /${buyer} na /${store}`
                                setLatestOrderNotification(msg)
                                notify('Novo Pedido!', msg)
                                showNewOrderCard({
                                    storeName: storeMap[payload.new.store_id].name,
                                    buyerLabel: payload.new.buyer_profile_slug
                                        ? `@${payload.new.buyer_profile_slug}`
                                        : (payload.new.buyer_name || 'Cliente presencial'),
                                    totalAmount: Number(payload.new.total_amount || 0),
                                    paymentMethod: payload.new.payment_method,
                                    deliveryOption: payload.new.delivery_option,
                                })
                            }
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
    }, [cleanup, reloadMerchant, reloadCustomer, setPendingOrdersCount, setLatestOrderNotification, notify])

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
    }, []) // executa apenas na montagem

    return null
}