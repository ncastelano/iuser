// src/modules/service-requests/domain.ts
//
// Regras puras do pedido de serviço ("Precisa de um profissional?"): o que falta pra poder enviar e como o endereço
// é mostrado. Sem React e sem rede — testável com `npm run test:service-requests`.

export interface ServiceRequestInput {
    /** id do tipo (pintor, eletricista...) ou 'outro' */
    serviceType: string | null
    /** nome escrito pela pessoa quando o tipo é 'outro' */
    customService: string
    address: string
    description: string
    photoCount: number
}

export const MAX_PHOTOS = 20

/** O que ainda falta preencher, na ordem em que a tela pede (vazio = pode enviar). */
export function missingFields(input: ServiceRequestInput): string[] {
    const missing: string[] = []
    if (!input.serviceType || (input.serviceType === 'outro' && !input.customService.trim())) missing.push('serviço')
    if (!input.address.trim()) missing.push('endereço')
    if (!input.description.trim()) missing.push('descrição')
    if (input.photoCount < 1) missing.push('foto')
    return missing
}

/** "Rua A, 12, Centro, Porto Velho - RO" → rua na primeira linha, bairro/cidade na segunda. */
export function splitAddress(address: string): { street: string; area: string } {
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
    return { street: parts[0] || '', area: parts.slice(1, 3).join(', ') }
}

/** Só o começo do endereço, cortado (chips de locais recentes). */
export function shortAddress(address: string, max = 28): string {
    const first = address.split(',')[0].trim()
    return first.length > max ? `${first.slice(0, max - 2)}...` : first
}

// ===== "Ao meu redor": distância e raio =====

export interface GeoPoint { lat: number | null; lng: number | null }

/** Raios do filtro (km); `null` = sem limite. */
export const RADIUS_OPTIONS: { km: number | null; label: string }[] = [
    { km: 5, label: '5 km' },
    { km: 10, label: '10 km' },
    { km: 20, label: '20 km' },
    { km: null, label: 'Tudo' },
]
export const DEFAULT_RADIUS_KM = 10

/** Distância em linha reta (haversine), em km. `null` se algum dos pontos não tem coordenada. */
export function distanceKm(a: GeoPoint | null | undefined, b: GeoPoint | null | undefined): number | null {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
    const R = 6371
    const rad = (d: number) => (d * Math.PI) / 180
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "850 m", "2,3 km", "14 km". */
export function formatDistance(km: number | null): string {
    if (km == null) return ''
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`
}

/**
 * Filtra pelo raio e ordena do mais perto pro mais longe. Sem a posição da pessoa não há raio nem ordem por
 * distância (volta como veio). Com raio ativo, quem não tem coordenada não é "ao redor" e sai.
 */
export function aroundMe<T extends GeoPoint>(items: T[], me: GeoPoint | null, radiusKm: number | null): (T & { distanceKm: number | null })[] {
    const withDistance = items.map((it) => ({ ...it, distanceKm: distanceKm(me, it) }))
    if (!me || me.lat == null || me.lng == null) return withDistance
    const inside = radiusKm == null ? withDistance : withDistance.filter((it) => it.distanceKm != null && it.distanceKm <= radiusKm)
    return inside.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}

/** Quantos itens de cada chave (tipo de serviço), do maior pro menor. */
export function countBy<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
    const map = new Map<string, number>()
    for (const it of items) map.set(key(it), (map.get(key(it)) || 0) + 1)
    return Array.from(map, ([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
