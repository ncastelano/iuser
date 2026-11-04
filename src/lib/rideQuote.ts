// src/lib/rideQuote.ts — o valor de uma corrida para o MOTORISTA, numa conta só, usada pelos DOIS lugares que mostram corridas (o Canal do Motorista da home
// e /aceitar-corridas) para os valores nunca mais divergirem. Sem rede nem React; as fórmulas de tarifa entram por parâmetro (tripFare/pickupFee), então
// aqui só vive a composição: distância da ROTA em vez do km gravado quando divergem, Tarifa iUser (+ deslocamento), Minha tarifa, o piso por hora e qual valor mostrar.
// Testado em scripts/test-ride-quote.mjs (npm run test:ride-quote).
import { hourlyFloor, perHour, round2, suggestedFare } from '../modules/negotiation/domain.ts'

/** km da rota que o mapa mostra só vale no lugar do km gravado no pedido quando a diferença passa disto */
export const ROUTE_KM_TOLERANCE = 0.3

export interface RideQuoteInput<Shape> {
    /** frete fixo da loja (entrega): não se recalcula pela rota nem entra em piso */
    offeredPrice: number | null
    /** km gravado no pedido e km da rota que o mapa mostra (null = ainda não veio) */
    distanceKm: number | null
    routeKm: number | null
    platformShape: Shape
    customShape: Shape | null
    /** o motorista usa a tarifa própria (pricing_mode = custom) */
    useCustom: boolean
    /** km do motorista até a partida (null = sem posição) */
    pickupKm: number | null
    /** minutos de ir buscar e da corrida (do mapa); sem os dois não há ganho por hora nem piso */
    pickupMin: number | null
    tripMin: number | null
    minHourly: number | null
    tripFare: (shape: Shape, km: number | null) => number
    pickupFee: (shape: Shape, km: number) => number
}

export interface RideQuote {
    /** km usado na conta da corrida */
    tripKm: number | null
    /** Tarifa iUser da corrida sozinha (sem deslocamento) */
    platformTrip: number
    /** Tarifa iUser com o deslocamento até a partida */
    platform: number
    /** Minha tarifa (com o piso por hora quando o motorista tem mínimo); null = o motorista não tem tarifa própria */
    custom: number | null
    /** o que o card destaca como "você pode ganhar" */
    shown: number
    shownKind: 'offered' | 'custom' | 'platform'
    minutes: number | null
    /** ganho por hora do valor destacado (valor ÷ tempo total) */
    perHour: number | null
}

export function rideQuote<Shape>(i: RideQuoteInput<Shape>): RideQuote {
    const useRoute = i.offeredPrice == null && i.routeKm != null && i.distanceKm != null && Math.abs(i.routeKm - i.distanceKm) > ROUTE_KM_TOLERANCE
    const tripKm = useRoute ? i.routeKm : i.distanceKm ?? i.routeKm
    const platformTrip = i.tripFare(i.platformShape, tripKm)
    const pickupAmount = i.pickupKm != null ? i.pickupFee(i.platformShape, i.pickupKm) : 0
    const platform = round2(platformTrip + pickupAmount)
    const minutes = i.pickupMin != null && i.tripMin != null ? i.pickupMin + i.tripMin : null
    const floor = hourlyFloor(minutes, i.minHourly)
    const custom = i.customShape ? suggestedFare(i.tripFare(i.customShape, tripKm), floor) : null

    let shown = platform
    let shownKind: RideQuote['shownKind'] = 'platform'
    if (i.offeredPrice != null) { shown = i.offeredPrice; shownKind = 'offered' }
    else if (i.useCustom && custom != null) { shown = custom; shownKind = 'custom' }
    return { tripKm, platformTrip: round2(platformTrip), platform, custom, shown: round2(shown), shownKind, minutes, perHour: perHour(shown, minutes) }
}
