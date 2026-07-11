'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Star, X, ShoppingBag, ArrowRight, Sparkles, MessageSquareHeart } from 'lucide-react'
import { ReviewModal } from './ReviewModal'
import { motion, AnimatePresence } from 'framer-motion'
import { useMerchantStore } from '@/store/useMerchantStore'
import { toast } from 'sonner'

export function FinishedOrderTrigger() {
    const [unreviewedOrders, setUnreviewedOrders] = useState<any[]>([])
    const [reviewOrder, setReviewOrder] = useState<any>(null)
    const [showPrompt, setShowPrompt] = useState(false)
    const setPendingReviewsCount = useMerchantStore(state => state.setPendingReviewsCount)
    const notifiedRef = useRef<Record<string, string>>({})

    const checkOrders = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Buscar apenas pedidos pagos com seus itens e nome da loja
        const { data: paidOrders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                id,
                checkout_id,
                store_id,
                created_at,
                buyer_name,
                stores(name),
                order_items(product_id, product_name)
            `)
            .eq('buyer_id', user.id)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })

        if (ordersError) {
            console.error('Error fetching orders:', ordersError)
            return
        }

        if (paidOrders && paidOrders.length > 0) {
            // Mapear para o formato esperado
            const orders = paidOrders.map((order: any) => ({
                id: order.checkout_id,
                store_id: order.store_id,
                store_name: order.stores?.name || 'Loja',
                created_at: order.created_at,
                items: (order.order_items || []).map((item: any) => ({
                    product_id: item.product_id,
                    product_name: item.product_name
                }))
            }))

            // Verificar avaliações já realizadas
            const { data: reviews } = await supabase
                .from('product_reviews')
                .select('order_id')
                .eq('profile_id', user.id)

            const reviewedOrderIds = new Set(reviews?.map(r => r.order_id) || [])
            const dismissedOrderIds = new Set(JSON.parse(localStorage.getItem('dismissed_reviews') || '[]'))

            const pending = orders.filter((o: any) => !reviewedOrderIds.has(o.id) && !dismissedOrderIds.has(o.id))

            setUnreviewedOrders(pending)
            setPendingReviewsCount(pending.length)
            setShowPrompt(pending.length > 0)
        } else {
            setUnreviewedOrders([])
            setPendingReviewsCount(0)
            setShowPrompt(false)
        }
    }

    useEffect(() => {
        let isMounted = true
        let channel: any

        async function setupRealtime() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user || !isMounted) return

            const handlePayload = (payload: any) => {
                const newStatus = payload.new?.status
                const checkoutId = payload.new?.checkout_id
                const storeName = payload.new?.stores?.name || 'Loja'

                if (!checkoutId || !newStatus) return
                if (notifiedRef.current[checkoutId] === newStatus) return
                notifiedRef.current[checkoutId] = newStatus

                if (newStatus === 'pending') {
                    toast.success(`📦 Pedido Recebido!`, {
                        description: `A loja ${storeName} recebeu seu pedido e logo irá confirmar.`,
                        icon: <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse border-2 border-white" />,
                        style: {
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '1.5rem'
                        }
                    })
                } else if (newStatus === 'preparing') {
                    toast.success(`👨‍🍳 Em Preparo!`, {
                        description: `Seu pedido na ${storeName} está sendo preparado agora.`,
                        icon: <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce border-2 border-white" />,
                        style: {
                            background: 'linear-gradient(135deg, #eab308, #d97706)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '1.5rem'
                        }
                    })
                } else if (newStatus === 'ready') {
                    toast.success(`✅ Pedido Pronto!`, {
                        description: `Pode retirar seu pedido na ${storeName}!`,
                        icon: <div className="w-3 h-3 bg-purple-500 rounded-full animate-ping border-2 border-white" />,
                        style: {
                            background: 'linear-gradient(135deg, #a855f7, #9333ea)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '1.5rem'
                        },
                        duration: 10000
                    })
                } else if (newStatus === 'paid') {
                    toast.success(`🎉 Pedido Finalizado!`, {
                        description: `Obrigado por comprar na ${storeName}! Avalie agora.`,
                        icon: <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white" />,
                        style: {
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '1.5rem'
                        }
                    })
                    setTimeout(() => checkOrders(), 2000)
                }
            }

            // Apenas canal de orders (não usamos store_sales)
            const channelOrders = supabase.channel(`finished-orders-${user.id}-${Date.now()}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${user.id}` }, handlePayload)
                .subscribe()

            channel = {
                unsubscribe: () => {
                    supabase.removeChannel(channelOrders)
                }
            }
        }

        checkOrders()
        setupRealtime()

        return () => {
            isMounted = false
            if (channel) channel.unsubscribe()
        }
    }, [supabase])

    const handleClose = () => {
        const currentOrder = unreviewedOrders[0]
        if (currentOrder) {
            const dismissedOrderIds = JSON.parse(localStorage.getItem('dismissed_reviews') || '[]')
            dismissedOrderIds.push(currentOrder.id)
            localStorage.setItem('dismissed_reviews', JSON.stringify(dismissedOrderIds))
            checkOrders()
        }
    }

    const handleStartReview = () => {
        const currentOrder = unreviewedOrders[0]
        if (currentOrder && currentOrder.items && currentOrder.items.length > 0) {
            const firstItem = currentOrder.items[0]
            setReviewOrder({
                isOpen: true,
                orderId: currentOrder.id,
                productId: firstItem.product_id,
                productName: firstItem.product_name,
                storeId: currentOrder.store_id
            })
            setShowPrompt(false)
        }
    }

    return (
        <>
            <AnimatePresence>
                {showPrompt && unreviewedOrders.length > 0 && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-500 to-red-600" />
                            <div className="absolute top-0 left-0 w-full h-32 overflow-hidden opacity-20">
                                <Sparkles className="absolute top-4 left-4 text-white w-12 h-12 rotate-12" />
                                <ShoppingBag className="absolute top-8 right-8 text-white w-16 h-16 -rotate-12" />
                            </div>

                            <button
                                onClick={handleClose}
                                className="absolute right-4 top-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors z-20"
                            >
                                <X size={18} className="text-white" />
                            </button>

                            <div className="relative pt-20 px-8 pb-8 text-center">
                                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6 -mt-10 border-4 border-orange-50">
                                    <MessageSquareHeart size={40} className="text-orange-500" />
                                </div>

                                {unreviewedOrders.length > 1 && (
                                    <div className="inline-block px-3 py-1 bg-orange-100 rounded-full text-[10px] font-black text-orange-600 uppercase mb-4 tracking-wider">
                                        {unreviewedOrders.length} pedidos pendentes
                                    </div>
                                )}

                                <h3 className="text-2xl font-black italic text-gray-900 leading-tight mb-2">
                                    Seu pedido foi finalizado! 🎉
                                </h3>
                                <p className="text-sm text-gray-500 font-medium leading-relaxed mb-8">
                                    O que você achou dos produtos? Sua avaliação ajuda outras pessoas na hora da compra!
                                </p>

                                <div className="space-y-3">
                                    <button
                                        onClick={handleStartReview}
                                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
                                    >
                                        Avaliar Agora <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                    <button
                                        onClick={handleClose}
                                        className="w-full py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-all"
                                    >
                                        Avaliar depois
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {reviewOrder && (
                <ReviewModal
                    isOpen={reviewOrder.isOpen}
                    onClose={() => {
                        setReviewOrder(null)
                        setShowPrompt(unreviewedOrders.length > 0)
                    }}
                    orderId={reviewOrder.orderId}
                    productId={reviewOrder.productId}
                    productName={reviewOrder.productName}
                    storeId={reviewOrder.storeId}
                    onSuccess={() => {
                        setReviewOrder(null)
                        checkOrders()
                    }}
                />
            )}
        </>
    )
}