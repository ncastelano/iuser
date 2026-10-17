// src/modules/delivery-estimate/domain.ts
//
// Regras puras da ESTIMATIVA do frete (Etapa 2.3). A CONTA em si mora no banco
// (supabase/migrations/20261097…: _compute_delivery_estimate, versão "est-v1") e é a única fonte do valor; aqui ficam só
// a validação do que o app pode enviar, a checagem de coerência do destino, a apresentação e a soma em centavos.
// Nada aqui calcula frete: o app nunca é autoridade sobre tarifa, preço por km, distância, mínimo, teto ou arredondamento.

export const ESTIMATE_CALCULATION_VERSION = 'est-v1'
export const ESTIMATE_MESSAGE =
    'O valor da entrega poderá ser ajustado durante a busca por um entregador. Você verá o valor final antes do pagamento.'

/** Tolerância entre o ponto marcado pelo app e o endereço geocodificado pelo servidor. */
export const DESTINATION_TOLERANCE_KM = 2

/** Resposta pública da estimativa: só o necessário (sem tarifa, sem regras do admin). */
export interface DeliveryEstimate {
    estimateId: string
    estimatedFreight: number
    distanceKm: number
    calculationVersion: string
    expiresAt: string
}

export interface EstimateRequest {
    storeId: string
    lat: number
    lng: number
    address: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lê o corpo enviado pelo app e devolve SÓ os quatro campos aceitos. Qualquer outro (delivery_fee, estimated_freight,
 * distance, base_fare, price_per_km, min, max…) é descartado aqui e não chega ao cálculo.
 */
export function parseEstimateRequest(body: unknown): { ok: true; value: EstimateRequest } | { ok: false; error: string } {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Dados inválidos' }
    const b = body as Record<string, unknown>
    const storeId = typeof b.storeId === 'string' ? b.storeId.trim() : ''
    if (!UUID.test(storeId)) return { ok: false, error: 'Loja inválida' }
    const lat = typeof b.lat === 'number' ? b.lat : Number.NaN
    const lng = typeof b.lng === 'number' ? b.lng : Number.NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return { ok: false, error: 'Local de entrega inválido' }
    }
    const address = typeof b.address === 'string' ? b.address.trim().replace(/\s+/g, ' ') : ''
    if (address.length < 5 || address.length > 300) return { ok: false, error: 'Informe o endereço de entrega' }
    return { ok: true, value: { storeId, lat, lng, address } }
}

/** Distância em linha reta (km). Usada só para checar coerência de destino/rota, nunca como valor do frete. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const r = (d: number) => (d * Math.PI) / 180
    const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/** O endereço geocodificado pelo servidor bate com o ponto que o app mandou? */
export function destinationMatchesAddress(geocoded: { lat: number; lng: number }, client: { lat: number; lng: number }): boolean {
    return haversineKm(geocoded.lat, geocoded.lng, client.lat, client.lng) <= DESTINATION_TOLERANCE_KM
}

/** Converte a resposta da RPC/rota para o formato do app. */
export function toDeliveryEstimate(raw: Record<string, unknown>): DeliveryEstimate {
    return {
        estimateId: String(raw.estimate_id),
        estimatedFreight: Number(raw.estimated_freight),
        distanceKm: Number(raw.distance_km),
        calculationVersion: String(raw.calculation_version),
        expiresAt: String(raw.expires_at),
    }
}

const toCents = (v: number) => Math.round(v * 100)

/** Resumo do carrinho no V2: tudo em centavos inteiros. A entrega é ESTIMADA; o total também. */
export function estimateTotals(itemsTotal: number, estimatedFreight: number): { itemsCents: number; freightCents: number; totalCents: number } {
    const itemsCents = toCents(itemsTotal)
    const freightCents = toCents(estimatedFreight)
    return { itemsCents, freightCents, totalCents: itemsCents + freightCents }
}

export function formatBRLFromCents(cents: number): string {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}
