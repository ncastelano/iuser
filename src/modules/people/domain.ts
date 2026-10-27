// src/modules/people/domain.ts — regras puras da página /pessoas: o que é uma "pessoa" na lista, distância, ordenação e textos.
// Sem React nem rede; testado em scripts/test-people.mjs (npm run test:people).

export interface Person {
    id: string
    name: string
    slug: string
    avatarPath: string | null
    points: number
    /** distância até quem está vendo (km), quando há local de referência */
    distanceKm: number | null
    /** só "novos por aqui": quando entrou */
    joinedAt?: string | null
    /** só "quem oferece serviços": o que oferece */
    offers?: string | null
    ratingAvg?: number | null
}
export interface Place { place: string; count: number; avatars: string[] }

const toRad = (d: number) => (d * Math.PI) / 180
/** Distância em km entre dois pontos (haversine) */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A linha de get_people_on_map → pessoa, já com a distância (se houver local de referência) */
export function personFromMapRow(r: Record<string, any>, origin: { lat: number; lng: number } | null): Person | null {
    if (!r?.profile_slug || !r?.id) return null
    const has = Number.isFinite(r.lat) && Number.isFinite(r.lng)
    return {
        id: String(r.id), name: r.name || `@${r.profile_slug}`, slug: String(r.profile_slug), avatarPath: r.avatar_url || null, points: Number(r.points) || 0,
        distanceKm: origin && has ? distanceKm(origin, { lat: Number(r.lat), lng: Number(r.lng) }) : null,
    }
}

/** Do mais perto ao mais longe; sem local de referência (ou sem posição), pelos pontos */
export function sortNearby(list: Person[], hasOrigin: boolean): Person[] {
    return [...list].sort((a, b) => {
        if (hasOrigin) {
            const da = a.distanceKm ?? Infinity, db = b.distanceKm ?? Infinity
            if (da !== db) return da - db
        }
        return b.points - a.points
    })
}

export function formatKm(km: number): string {
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    return `${km.toFixed(1).replace('.', ',')} km`
}

/** "37 pessoas" / "1 pessoa" */
export function peopleLabel(n: number): string {
    return `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`
}

/** "entrou hoje", "entrou há 3 dias", "entrou em out." */
export function joinedLabel(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return ''
    const days = Math.floor((now - new Date(iso).getTime()) / 86400000)
    if (days <= 0) return 'entrou hoje'
    if (days === 1) return 'entrou ontem'
    if (days < 14) return `entrou há ${days} dias`
    return `entrou em ${new Date(iso).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`
}

/** A linha de get_people_places → local */
export function placeFromRow(r: Record<string, any>): Place | null {
    if (!r?.place) return null
    return { place: String(r.place), count: Number(r.people_count) || 0, avatars: Array.isArray(r.avatars) ? r.avatars.filter(Boolean).map(String) : [] }
}

/** Busca simples de pessoas: tira acento/maiúscula; precisa de 2 letras ou mais */
export function normalizeQuery(q: string): string {
    return (q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/^@/, '').trim()
}
export const canSearch = (q: string) => normalizeQuery(q).length >= 2
