// O cliente cancela o pedido enquanto a LOJA ainda não aceitou (migration ...68: cancel_held_order vale também para pedido já com a loja).
// Dois toques (cancelar → confirmar) para não cancelar sem querer; o banco recusa se a loja aceitou nesse meio-tempo (hint store_accepted).
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

// o cartão do pedido (CarrinhoScreen.OrderCard) é RECRIADO a cada atualização da lista (a cada 8 s): a confirmação aberta mora aqui fora,
// por pedido, para não sumir entre o primeiro e o segundo toque
const confirmingIds = new Set<string>()

export default function CancelPendingOrder({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
    const [confirming, setConfirmingState] = useState(() => confirmingIds.has(orderId))
    const setConfirming = (v: boolean) => { if (v) confirmingIds.add(orderId); else confirmingIds.delete(orderId); setConfirmingState(v) }
    const [busy, setBusy] = useState(false)

    const cancel = async () => {
        setBusy(true)
        const { error } = await supabase.rpc('cancel_held_order', { p_order: orderId })
        setBusy(false)
        setConfirming(false)
        if (error) {
            toast.error((error as { hint?: string }).hint === 'store_accepted' ? 'A loja acabou de aceitar o pedido. Fale com ela pela conversa.' : error.message)
        } else {
            toast.success('Pedido cancelado.')
        }
        window.dispatchEvent(new Event('iuser-orders-changed'))
    }

    if (!confirming) {
        return (
            <button type="button" onClick={() => setConfirming(true)}
                className={`${compact ? 'mt-2' : 'mt-3'} w-full h-9 rounded-full border text-xs font-black`} style={{ borderColor: '#ef444466', color: '#dc2626' }}>
                Cancelar pedido
            </button>
        )
    }
    return (
        <div className={`${compact ? 'mt-2' : 'mt-3'} flex gap-2`}>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex-1 h-9 rounded-full border text-xs font-black opacity-80">Voltar</button>
            <button type="button" onClick={cancel} disabled={busy} className="flex-1 h-9 rounded-full text-xs font-black text-white disabled:opacity-60" style={{ background: '#dc2626' }}>
                {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
        </div>
    )
}
