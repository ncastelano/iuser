// Sugestões de lugares do /pedir-motorista (páginas de busca da partida e da chegada): lugares recentes e EMPRESAS DO iUSER. Só a CHEGADA
// mostra a ESTIMATIVA do valor (decisão do dono, 11/11/2026), feita com a MESMA conta que o motorista vê no card da corrida (`lib/rideQuote`):
//   • a corrida da partida até o lugar pela Tarifa iUser do VEÍCULO escolhido, com a distância e o TEMPO reais pelas ruas (Mapbox Matrix;
//     sem resposta, linha reta × 1,3 a 40 km/h);
//   • + o DESLOCAMENTO do motorista até a partida: do motorista ativo mais perto (pela tarifa por km); sem ninguém por perto, 3 km (≈ R$ 6);
//   • nunca abaixo do mínimo da plataforma (R$ 40 por hora do tempo de buscar + corrida) nem do valor mínimo de uma corrida.
// Mostrada como "± R$ X": o valor de verdade sai no pedido (qual motorista aceita, trânsito, ofertas). Regra pura: npm run test:ride-places.
import { rideQuote } from '../../lib/rideQuote.ts'

/** sem motorista por perto, o deslocamento suposto até a partida (≈ R$ 6 na Tarifa iUser de carro) */
export const PICKUP_DEFAULT_KM = 3
/** velocidade média para o tempo quando não há a rota de verdade (a mesma do resto do app) */
export const AVG_KMH = 40
/** linha reta → caminho pelas ruas (aproximado) */
export const ROAD_FACTOR = 1.3

export interface Leg { km: number; min: number }
export const legFromKm = (km: number): Leg => ({ km, min: (km / AVG_KMH) * 60 })

/**
 * A estimativa de uma corrida até um lugar: `trip` = partida → lugar; `pickup` = motorista → partida (null = os 3 km supostos).
 * Sem `trip` (ainda sem partida), só o mínimo + o deslocamento.
 */
export function placeQuote<S>(o: {
    trip: Leg | null
    pickup: Leg | null
    shape: S
    tripFare: (shape: S, km: number | null) => number
    pickupFee: (shape: S, km: number) => number
    minPerMinute: number
}): { value: number; perHour: number | null } {
    const trip = o.trip ?? { km: 0, min: 0 }
    const pickup = o.pickup ?? legFromKm(PICKUP_DEFAULT_KM)
    const q = rideQuote<S>({
        offeredPrice: null, distanceKm: trip.km, routeKm: trip.km, platformShape: o.shape, customShape: null, useCustom: false,
        pickupKm: pickup.km, pickupMin: pickup.min, tripMin: trip.min, minHourly: null, minPerMinute: o.minPerMinute,
        tripFare: o.tripFare, pickupFee: o.pickupFee,
    })
    return { value: q.platform, perHour: q.perHour }
}

export function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371
    const dLat = ((b[1] - a[1]) * Math.PI) / 180
    const dLng = ((b[0] - a[0]) * Math.PI) / 180
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
}

/** km de rua entre dois pontos (linha reta × fator), ou null se faltar um deles */
export function roadKm(from: [number, number] | null | undefined, to: [number, number] | null | undefined): number | null {
    if (!from || !to) return null
    return Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10
}

/** abreviações comuns de endereço, para "avenida sete" achar "Av. Sete de Setembro" */
const ABBR: Record<string, string> = { avenida: 'av', av: 'av', rua: 'r', r: 'r', travessa: 'tv', tv: 'tv', alameda: 'al', al: 'al', estrada: 'est', est: 'est', praca: 'pc', pc: 'pc' }
const words = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => ABBR[w] ?? w)

/** o que bate com o que a pessoa digitou: cada palavra digitada (sem acento nem maiúscula, abreviações de endereço iguais) aparece no
 *  começo de alguma palavra do texto, em qualquer ordem */
export function matches(text: string, query: string): boolean {
    const q = words(query)
    if (!q.length) return true
    const t = words(text)
    return q.every((w) => t.some((x) => x.startsWith(w)))
}
