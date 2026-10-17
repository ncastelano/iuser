// Etapa "Revisão" do checkout V2, compartilhada pelos TRÊS caminhos de pedido (página de produto, catálogo e carrinho).
// Dono da estimativa: pede ao servidor (/api/delivery/estimate), guarda junto com o destino a que ela pertence, e só libera
// o envio com uma estimativa válida PARA ESTE destino e dentro da validade. Endereço mudou → a antiga cai na hora e uma nova é
// pedida e mostrada; expirou → idem, com aviso, e o cliente precisa tocar em "Enviar pedido" de novo. Nunca troca valor em silêncio.
// Nada de frete/total sai daqui: só o estimateId vai para o pedido.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { requestDeliveryEstimate } from '@/lib/deliveryEstimate'
import { estimateKey, isEstimateUsable, type DeliveryEstimate } from '@/modules/delivery-estimate'
import { V2OrderReview } from './V2OrderReview'

export const ESTIMATE_EXPIRED_NOTICE = 'A estimativa da entrega expirou. Atualizamos o valor para você.'

export type V2SubmitResult = { estimateRejected?: boolean } | void

export function V2CheckoutReview(props: {
    storeId: string
    itemsTotal: number
    address: string
    lat: number | null
    lng: number | null
    submitting: boolean
    onBack: () => void
    /** Envia o pedido com a estimativa mostrada. Devolve { estimateRejected: true } se o servidor recusou a estimativa. */
    onSubmit: (estimateId: string) => Promise<V2SubmitResult>
}) {
    const { storeId, itemsTotal, address, lat, lng, submitting, onBack, onSubmit } = props
    const key = address.trim() && lat != null && lng != null ? estimateKey(address, lat, lng) : null
    const [saved, setSaved] = useState<{ key: string; estimate: DeliveryEstimate } | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const usable = isEstimateUsable(saved?.estimate ?? null, saved?.key ?? null, key) ? saved!.estimate : null

    const refresh = useCallback(async () => {
        if (!key || lat == null || lng == null) return
        setLoading(true)
        setError(null)
        try {
            const estimate = await requestDeliveryEstimate({ storeId, lat, lng, address })
            setSaved({ key, estimate })
        } catch (err: any) {
            setSaved(null)
            setError(err?.message || 'Não foi possível calcular a entrega')
        } finally {
            setLoading(false)
        }
    }, [storeId, key, lat, lng, address])

    // destino novo (ou primeira vez): a estimativa anterior deixa de valer e uma nova é pedida
    useEffect(() => {
        if (!key) { setSaved(null); return }
        if (!isEstimateUsable(saved?.estimate ?? null, saved?.key ?? null, key)) refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    // vencimento: no horário, busca outra e AVISA; o envio continua dependendo do toque do cliente
    useEffect(() => {
        if (!saved) return
        const ms = Date.parse(saved.estimate.expiresAt) - Date.now()
        if (!Number.isFinite(ms)) return
        const t = setTimeout(() => { toast.info(ESTIMATE_EXPIRED_NOTICE); refresh() }, Math.max(0, ms))
        return () => clearTimeout(t)
    }, [saved, refresh])

    const handleSubmit = async () => {
        // revalida NO TOQUE (não confia no que foi renderizado): venceu entre a tela e o toque, ou o destino mudou → nada é enviado
        const fresh = isEstimateUsable(saved?.estimate ?? null, saved?.key ?? null, key) ? saved!.estimate : null
        if (!fresh) {
            toast.info(ESTIMATE_EXPIRED_NOTICE)
            setSaved(null)
            refresh()
            return
        }
        const result = await onSubmit(fresh.estimateId)
        if (result && result.estimateRejected) { setSaved(null); refresh() }
    }

    return (
        <V2OrderReview
            itemsTotal={itemsTotal}
            estimate={usable}
            loading={loading}
            error={error}
            submitting={submitting}
            onBack={onBack}
            onSubmit={handleSubmit}
            onRetry={refresh}
        />
    )
}
