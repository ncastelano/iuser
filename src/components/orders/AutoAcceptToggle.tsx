// components/orders/AutoAcceptToggle.tsx — ACEITE AUTOMÁTICO dos pedidos (por loja; migration 092): ligado, o pedido que chega já vai para "Em preparo".
'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getStoreAutoAccept, setStoreAutoAccept } from '@/modules/order-payment'

export default function AutoAcceptToggle({ storeId, colors }: { storeId: string; colors: { textPrimary: string; textSecondary: string; border: string } }) {
    const [on, setOn] = useState<boolean | null>(null)
    useEffect(() => { getStoreAutoAccept(storeId).then(setOn) }, [storeId])
    if (on === null) return null
    const flip = async () => {
        const next = !on; setOn(next)
        try { await setStoreAutoAccept(storeId, next); toast.success(next ? 'Aceite automático ligado' : 'Aceite automático desligado', { description: next ? 'Os pedidos novos já entram em preparo.' : 'Você aceita ou responde cada pedido.' }) }
        catch (e: any) { setOn(!next); toast.error(e?.message || 'Só a dona da loja muda isso') }
    }
    return (
        <button type="button" onClick={flip} className="w-full flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left" style={{ background: `${colors.border}25` }}>
            <Zap size={16} style={{ color: on ? '#16a34a' : colors.textSecondary }} />
            <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-black" style={{ color: colors.textPrimary }}>Aceite automático</span>
                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{on ? 'Ligado: o pedido que chega já entra em preparo' : 'Desligado: você aceita ou responde cada pedido'}</span>
            </span>
            <span className="w-10 h-6 rounded-full relative transition" style={{ background: on ? '#16a34a' : colors.border }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
            </span>
        </button>
    )
}
