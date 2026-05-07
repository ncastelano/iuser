'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Star, X, ShoppingBag, ArrowRight, Sparkles, MessageSquareHeart } from 'lucide-react'
import { ReviewModal } from './ReviewModal'
import { motion, AnimatePresence } from 'framer-motion'
import { useMerchantStore } from '@/store/useMerchantStore'

export function FinishedOrderTrigger() {
    const [unreviewedOrders, setUnreviewedOrders] = useState<any[]>([])
    const [reviewOrder, setReviewOrder] = useState<any>(null)
    const [showPrompt, setShowPrompt] = useState(false)
    const supabase = createClient()
    const setPendingReviewsCount = useMerchantStore(state => state.setPendingReviewsCount)

    const checkOrders = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Fetch from store_sales as it's the most reliable source right now
        const { data: sales, error: salesError } = await supabase
            .from('store_sales')
            .select('*')
            .eq('buyer_id', user.id)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })

        if (salesError) {
            console.error('Error fetching store_sales:', salesError)
        }

        if (sales && sales.length > 0) {
            // Group by checkout_id to treat as orders
            const grouped = sales.reduce((acc: any, sale: any) => {
                if (!acc[sale.checkout_id]) {
                    acc[sale.checkout_id] = {
                        id: sale.checkout_id, // Use checkout_id as the order ID
                        store_id: sale.store_id,
                        created_at: sale.created_at,
                        items: []
                    }
                }
                acc[sale.checkout_id].items.push(sale)
                return acc
            }, {})

            const orders = Object.values(grouped).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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
        let isMounted = true;
        let channel: any;

        async function setupRealtime() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user || !isMounted) return

            const channelName = `finished-orders-${user.id}-${Date.now()}`
            channel = supabase.channel(channelName)
                .on(
                    'postgres_changes',
                    {
                        event: '*', // Listen to all events to be safe
                        schema: 'public',
                        table: 'store_sales',
                        filter: `buyer_id=eq.${user.id}`
                    },
                    (payload: any) => {
                        const newStatus = payload.new?.status;
                        if (newStatus === 'paid') {
                            // Give a small delay to ensure all items are updated if it's a batch
                            setTimeout(() => checkOrders(), 1000);
                        }
                    }
                )
                .subscribe()
        }

        checkOrders()
        setupRealtime()

        return () => {
            isMounted = false;
            if (channel) supabase.removeChannel(channel)
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
                            {/* Decorative background */}
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
                                    O que você achou dos produtos? Sua avaliação ajuda a comunidade a escolher melhor.
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
                                        Não quero avaliar este
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
                        // If closed without success, we don't automatically mark as dismissed 
                        // unless the user clicks "Não quero avaliar este" in the prompt
                        setShowPrompt(unreviewedOrders.length > 0)
                    }}
                    orderId={reviewOrder.orderId}
                    productId={reviewOrder.productId}
                    productName={reviewOrder.productName}
                    storeId={reviewOrder.storeId}
                    onSuccess={() => {
                        setReviewOrder(null)
                        // This will re-fetch and skip the one just reviewed
                        checkOrders()
                    }}
                />
            )}
        </>
    )
}
