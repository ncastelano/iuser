// components/checkout/DriverFirstNote.tsx
//
// Aviso da etapa de endereço do checkout (catálogo, página do produto e carrinho): em loja com Entregador iUser a loja só recebe o pedido quando um entregador aceitar
// (ENTREGADOR PRIMEIRO, LOJA DEPOIS) e, se ninguém aceitar, a pessoa pode retirar na loja. Só apresenta: a regra mora no banco (create_store_order / delivery_hold_settings).
'use client'

import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

const cache = new Map<string, boolean>()

export default function DriverFirstNote({ storeId, show = true }: { storeId?: string | null; show?: boolean }) {
    const { colors } = useTheme()
    const [on, setOn] = useState<boolean>(() => (storeId ? cache.get(storeId) ?? false : false))
    useEffect(() => {
        if (!storeId || !show) return
        if (cache.has(storeId)) { setOn(cache.get(storeId)!); return }
        let alive = true
        supabase.from('stores').select('iuser_delivery_enabled').eq('id', storeId).maybeSingle().then(({ data }) => {
            const v = !!data?.iuser_delivery_enabled
            cache.set(storeId, v)
            if (alive) setOn(v)
        })
        return () => { alive = false }
    }, [storeId, show])
    if (!show || !on) return null
    return (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl mb-2" style={{ background: '#f9731612', border: '1px solid #f9731640' }}>
            <Truck size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
            <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                <b style={{ color: colors.textPrimary }}>A loja recebe o pedido quando um entregador aceitar.</b> Se demorar, você escolhe retirar na loja (sem o frete) ou cancela.
            </p>
        </div>
    )
}
