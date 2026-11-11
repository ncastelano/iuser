// Sugestões de lugares do /pedir-motorista (página de busca do local): lugares recentes e EMPRESAS DO iUSER, cada uma com uma ESTIMATIVA
// de valor (decisão do dono, 11/11/2026): a corrida pela Tarifa iUser — nunca abaixo do valor mínimo de uma corrida — MAIS R$ 6 fixos, que
// fazem as vezes de ~3 km de deslocamento do motorista até a partida (ainda não se sabe quem vai). É só uma ideia do preço; o valor de
// verdade sai na hora do pedido (rota, motorista, ofertas). Regra pura: npm run test:ride-places.

/** o deslocamento do motorista até a partida, pré-estabelecido (≈ 3 km) */
export const PICKUP_ESTIMATE = 6
/** linha reta → caminho pelas ruas (aproximado) */
export const ROAD_FACTOR = 1.3

export function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371
    const dLat = ((b[1] - a[1]) * Math.PI) / 180
    const dLng = ((b[0] - a[0]) * Math.PI) / 180
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Estimativa da corrida até/de um lugar: tarifa da corrida (pelos km de rua) com o mínimo de uma corrida, + R$ 6 de deslocamento.
 * Sem ponto de referência (km = null), fica no mínimo + R$ 6 ("a partir de").
 */
export function placeEstimate(km: number | null, tripFare: (km: number) => number, minFare: number): { value: number; approx: boolean } {
    const trip = km != null && Number.isFinite(km) ? Math.max(minFare, tripFare(km)) : minFare
    return { value: Math.round((trip + PICKUP_ESTIMATE) * 100) / 100, approx: km == null }
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
