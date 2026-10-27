// Loja: declara que recebeu do cliente, paga o motorista FORA do iUser (Pix dele) e informa o envio. São declarações; o iUser não move dinheiro.
'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { PAYMENT_LABELS, PIX_TYPE_LABEL, brl, paymentErrorText, paymentStateText } from '@/modules/delivery-search'
import { copyText, usePaymentView } from './usePaymentView'

export default function StoreDeliveryPayment({ dispatchId, onChanged }: { dispatchId: string; onChanged?: () => void }) {
    const { view, reload } = usePaymentView(dispatchId)
    const [busy, setBusy] = useState(false)
    if (!view || view.role !== 'store') return null

    const run = async (fn: () => PromiseLike<{ data: unknown; error: { message: string; hint?: string } | null }>, okMsg: string) => {
        setBusy(true)
        const { data, error } = await fn()
        setBusy(false)
        const r = data as { expired?: boolean; in_verification?: boolean } | null
        if (error) toast.error(paymentErrorText(error.hint, error.message))
        else if (r?.expired) toast.error(r.in_verification ? 'O prazo terminou: o pagamento foi para verificação.' : 'A reserva do entregador venceu antes de você informar. A busca recomeçou.')
        else toast.success(okMsg)
        reload()
        onChanged?.()
    }

    const state = view.state
    return (
        <div className="rounded-xl border p-2.5 flex flex-col gap-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">{paymentStateText('store', state, view.amount_to_pay_driver)}</p>
            {view.driver && <p className="opacity-80">Entregador: {view.driver.name || view.driver.slug}</p>}

            {state === 'awaiting_payment' && (
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-full bg-orange-500 px-3 py-2 font-black text-white disabled:opacity-60"
                    onClick={() => { if (window.confirm(`Confirma que você RECEBEU ${brl(view.total_amount ?? 0)} do cliente? É uma declaração sua.`)) run(() => supabase.rpc('store_report_customer_payment', { p_dispatch: dispatchId }), 'Recebimento informado.') }}
                >
                    {PAYMENT_LABELS.customerReceived}
                </button>
            )}

            {(state === 'awaiting_driver_payment' || state === 'customer_payment_reported') && (
                <>
                    <p>Valor a pagar ao entregador: <b>{brl(view.amount_to_pay_driver ?? 0)}</b></p>
                    {view.driver_pix_key && (
                        <div className="rounded-lg bg-black/5 p-2">
                            <p className="opacity-70">Pix do entregador ({PIX_TYPE_LABEL[view.driver_pix_type || ''] || 'chave'})</p>
                            <p className="break-all font-mono">{view.driver_pix_key}</p>
                            <button type="button" className="mt-1 font-bold underline" onClick={async () => toast[(await copyText(view.driver_pix_key!)) ? 'success' : 'error']('Chave Pix copiada')}>
                                {PAYMENT_LABELS.copyPix}
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-full bg-orange-500 px-3 py-2 font-black text-white disabled:opacity-60"
                        onClick={() => { if (window.confirm(`Confirma que você ENVIOU ${brl(view.amount_to_pay_driver ?? 0)} ao entregador? É uma declaração sua.`)) run(() => supabase.rpc('store_report_driver_payment', { p_dispatch: dispatchId, p_amount: view.amount_to_pay_driver }), 'Pagamento ao entregador informado.') }}
                    >
                        {PAYMENT_LABELS.driverPaid}
                    </button>
                    <p className="opacity-70">O iUser não faz o Pix por você: pague pelo seu banco e depois toque no botão.</p>
                </>
            )}
        </div>
    )
}
