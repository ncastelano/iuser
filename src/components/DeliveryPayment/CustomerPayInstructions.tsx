// Cliente: como pagar a LOJA diretamente (o iUser não participa do dinheiro). Nunca mostra o Pix do motorista.
'use client'

import { toast } from '@/lib/toast'
import { PAYMENT_NOTE, PIX_TYPE_LABEL, brl, paymentStateText, remainingLabel } from '@/modules/delivery-search'
import { copyText, usePaymentView } from './usePaymentView'

export default function CustomerPayInstructions({ dispatchId }: { dispatchId: string }) {
    const { view } = usePaymentView(dispatchId)
    if (!view || view.role !== 'customer') return null
    const paying = view.state === 'awaiting_payment'
    const left = paying ? remainingLabel(view.reserved_until) : null
    return (
        <div className="rounded-xl border p-3 flex flex-col gap-2 text-sm">
            <p className="font-black">{paying ? 'Pague diretamente à loja' : paymentStateText('customer', view.state)}</p>
            {paying && (
                <>
                    <div className="flex justify-between"><span className="opacity-70">Produtos</span><span>{brl(view.items_total ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="opacity-70">Entrega</span><span>{brl(view.delivery_fee ?? 0)}</span></div>
                    <div className="flex justify-between font-black border-t pt-1"><span>Total a pagar à loja</span><span>{brl(view.total_amount ?? 0)}</span></div>
                    {view.store?.accepts_pix && view.store.pix_key ? (
                        <div className="rounded-lg bg-black/5 p-2">
                            <p className="text-xs opacity-70">Pix da loja ({PIX_TYPE_LABEL[view.store.pix_key_type || ''] || 'chave'})</p>
                            <p className="break-all font-mono text-xs">{view.store.pix_key}</p>
                            <button
                                type="button"
                                className="mt-1 text-xs font-bold underline"
                                onClick={async () => toast[(await copyText(view.store!.pix_key!)) ? 'success' : 'error'](view.store ? 'Chave Pix copiada' : '')}
                            >
                                Copiar chave Pix
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs opacity-80">Combine a forma de pagamento diretamente com a loja{view.store?.name ? ` (${view.store.name})` : ''}.</p>
                    )}
                    {left && <p className="text-xs opacity-70">Reserva do entregador: {left}</p>}
                </>
            )}
            <p className="text-[11px] opacity-70">{PAYMENT_NOTE}</p>
        </div>
    )
}
