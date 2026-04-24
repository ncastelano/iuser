'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, Store } from 'lucide-react'

export function OrderNotification() {
    const supabase = createClient()
    const [stores, setStores] = useState<Record<string, string>>({}) // id -> name
    const [notification, setNotification] = useState<{ id: string, storeName: string, amount: number, buyerName: string } | null>(null)

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
            setStores(storeMap)

            // Listen to new orders
            channel = supabase
                .channel('global-order-notifications')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'orders' },
                    (payload) => {
                        const storeId = payload.new.store_id
                        if (storeMap[storeId]) {
                            // É um pedido para uma loja do usuário!
                            setNotification({
                                id: payload.new.checkout_id,
                                storeName: storeMap[storeId],
                                amount: payload.new.total_amount,
                                buyerName: payload.new.buyer_profile_slug || payload.new.buyer_name || 'Cliente'
                            })

                            // Tocar um som se quiser (opcional)
                            // const audio = new Audio('/notification.mp3')
                            // audio.play().catch(() => {})

                            // Esconder depois de 10 segundos
                            setTimeout(() => setNotification(null), 10000)
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

    if (!notification) return null

    return (
        <div className="fixed top-4 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none animate-in slide-in-from-top-10 fade-in duration-500">
            <div className="bg-foreground text-background rounded-2xl p-4 shadow-2xl flex items-start gap-4 max-w-sm w-full pointer-events-auto border border-border/20">
                <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black uppercase tracking-widest text-green-500 mb-1">
                        Novo Pedido!
                    </h3>
                    <p className="text-xs font-bold text-background/90 truncate mb-1">
                        {notification.storeName}
                    </p>
                    <p className="text-[10px] text-background/70 font-medium">
                        @{notification.buyerName} acabou de fazer um pedido de <span className="font-black italic">R$ {notification.amount.toFixed(2)}</span>
                    </p>
                </div>
                <button 
                    onClick={() => setNotification(null)}
                    className="p-1 rounded-full hover:bg-background/20 transition-colors text-background/50 hover:text-background"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
