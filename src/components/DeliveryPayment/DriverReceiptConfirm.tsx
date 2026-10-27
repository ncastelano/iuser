// Motorista: confirma (ou nega) o recebimento do frete declarado pela loja. Só "Recebi" libera a entrega.
'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { PAYMENT_LABELS, paymentErrorText, paymentStateText } from '@/modules/delivery-search'
import { usePaymentView } from './usePaymentView'

export default function DriverReceiptConfirm({ dispatchId, onChanged }: { dispatchId: string; onChanged?: () => void }) {
    const { view, reload } = usePaymentView(dispatchId)
    const [busy, setBusy] = useState(false)
    if (!view || view.role !== 'driver') return null
    const amount = view.amount_to_receive ?? view.frozen_freight ?? 0

    const answer = async (received: boolean) => {
        setBusy(true)
        const { error } = await supabase.rpc('driver_report_receipt', { p_dispatch: dispatchId, p_received: received, p_amount: received ? amount : null })
        setBusy(false)
        if (error) toast.error(paymentErrorText((error as { hint?: string }).hint, error.message))
        else toast.success(received ? 'Recebimento confirmado. Entrega liberada.' : 'Registramos que você não recebeu. O pagamento ficou em verificação.')
        reload()
        onChanged?.()
    }

    return (
        <div className="mt-2 flex flex-col gap-2 text-xs">
            <p className="font-bold">{paymentStateText('driver', view.state, amount)}</p>
            {view.can_respond && (
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => answer(true)} className="rounded-full bg-green-600 px-3 py-2 font-black text-white disabled:opacity-60">
                        {PAYMENT_LABELS.driverReceived(amount)}
                    </button>
                    <button type="button" disabled={busy} onClick={() => answer(false)} className="rounded-full border px-3 py-2 font-black disabled:opacity-60">
                        {PAYMENT_LABELS.driverNotReceived}
                    </button>
                </div>
            )}
        </div>
    )
}
