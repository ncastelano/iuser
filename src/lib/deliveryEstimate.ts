// src/lib/deliveryEstimate.ts
//
// Cliente da estimativa oficial do frete (Etapa 2.3). Só ENVIA a loja e o destino e MOSTRA o que o servidor devolveu.
// Não calcula nada e não aceita valor de frete/distância/tarifa de lugar nenhum.
import { supabase } from '@/lib/supabase/client'
import { toDeliveryEstimate, type DeliveryEstimate, type EstimateRequest } from '@/modules/delivery-estimate'

export async function requestDeliveryEstimate(req: EstimateRequest): Promise<DeliveryEstimate> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Entre na sua conta para ver a entrega')
    const res = await fetch('/api/delivery/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        // só estes quatro campos existem no contrato
        body: JSON.stringify({ storeId: req.storeId, lat: req.lat, lng: req.lng, address: req.address }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Não foi possível calcular a entrega')
    return toDeliveryEstimate({
        estimate_id: json.estimateId, estimated_freight: json.estimatedFreight, distance_km: json.distanceKm,
        calculation_version: json.calculationVersion, expires_at: json.expiresAt,
    })
}
