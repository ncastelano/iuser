// src/modules/driver-call/domain.ts
//
// CHAMAR UM MOTORISTA (17/11/2026, decisão do dono): a página /chamar/<@ do motorista> é o pedido de corrida DIRETO para uma pessoa —
// limpa, com o motorista em destaque no alto, a partida e a chegada, o VALOR pela tarifa dele (o laranja do iUser) e o pagamento.
// Regras puras (sem React, sem banco): o texto e o estado do botão e o pedido que vai para `ride_requests` (o mesmo caminho do
// /pedir-motorista: o banco confere tudo; o valor vai depois como a OFERTA do passageiro por `set_passenger_offer`).
// Testes: npm run test:driver-call.

export type CallPayment = 'pix' | 'dinheiro' | 'cartao'
export type CallVehicleKind = 'carro' | 'moto' | 'bicicleta'

export interface CallPlace { address: string; coords: [number, number] | null }

/** "Ana Paula Souza" → "Ana"; vazio → "o motorista" */
export function firstName(name: string | null | undefined): string {
    const n = (name || '').trim().split(/\s+/)[0]
    return n || 'o motorista'
}

export const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

export interface CallCtaInput {
    driverName: string | null
    isSelf: boolean
    hasOrigin: boolean
    hasDestination: boolean
    payment: CallPayment | null
    price: number | null
    submitting: boolean
}

/** O botão de baixo: o que ele diz e se dá para tocar. `missing` = o que falta (para marcar o campo). */
export function callCta(i: CallCtaInput): { label: string; disabled: boolean; missing: 'self' | 'origin' | 'destination' | 'payment' | null } {
    if (i.isSelf) return { label: 'Este é o seu perfil de motorista', disabled: true, missing: 'self' }
    if (i.submitting) return { label: 'Chamando…', disabled: true, missing: null }
    if (!i.hasOrigin) return { label: 'Escolha de onde você sai', disabled: false, missing: 'origin' }
    if (!i.hasDestination) return { label: 'Escolha para onde vai', disabled: false, missing: 'destination' }
    if (!i.payment) return { label: 'Escolha o pagamento', disabled: false, missing: 'payment' }
    const who = `Chamar ${firstName(i.driverName)}`
    return { label: i.price != null ? `${who} · ${brl(i.price)}` : who, disabled: false, missing: null }
}

/** Tempo da corrida usado no pedido e na tarifa por tempo: o MESMO do /pedir-motorista (40 km/h na cidade) */
export const AVERAGE_SPEED_KMH = 40
export const tripMinutes = (km: number) => (km / AVERAGE_SPEED_KMH) * 60

/** Troco digitado ("50", "50,00") → número; vazio ou inválido → null */
export function parseChange(text: string): number | null {
    const v = Number(text.replace(/\./g, '').replace(',', '.').trim())
    return text.trim() && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

/** O pedido de corrida (1 pessoa) que vai para ride_requests, com o motorista como PREFERIDO */
export function buildCallRide(a: {
    requesterId: string
    driverId: string
    vehicleKind: CallVehicleKind
    origin: CallPlace
    destination: CallPlace
    originComplement: string
    notes: string
    payment: CallPayment
    cashChange: string
    contactless: boolean | null
    route: { distanceKm: number; durationMin: number } | null
}): Record<string, unknown> {
    return {
        requester_id: a.requesterId,
        preferred_driver_id: a.driverId !== a.requesterId ? a.driverId : null,
        ride_type: 'pessoa',
        passenger_count: 1,
        vehicle_type: a.vehicleKind,
        origin_address: a.origin.address.trim(),
        destination_address: a.destination.address.trim(),
        origin_complement: a.originComplement.trim() || null,
        notes: a.notes.trim() || null,
        payment_method: a.payment,
        cash_change_for: a.payment === 'dinheiro' ? parseChange(a.cashChange) : null,
        card_is_contactless: a.payment === 'cartao' ? a.contactless : null,
        wants_air_conditioning: false,
        origin_lat: a.origin.coords ? a.origin.coords[1] : null,
        origin_lng: a.origin.coords ? a.origin.coords[0] : null,
        destination_lat: a.destination.coords ? a.destination.coords[1] : null,
        destination_lng: a.destination.coords ? a.destination.coords[0] : null,
        distance_km: a.route?.distanceKm ?? null,
        duration_min: a.route?.durationMin ?? null,
    }
}

/** Os parâmetros de partida que a página aceita (?origem=&origem_lat=&origem_lng=, os mesmos do /pedir-motorista) */
export function placeFromParams(params: URLSearchParams, prefix: 'origem' | 'chegada'): CallPlace | null {
    const address = (params.get(prefix) || '').trim()
    if (!address) return null
    const lat = Number(params.get(`${prefix}_lat`)), lng = Number(params.get(`${prefix}_lng`))
    const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    return { address: address.slice(0, 300), coords: ok ? [lng, lat] : null }
}
