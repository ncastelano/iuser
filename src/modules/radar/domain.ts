// src/modules/radar/domain.ts
//
// Regras puras do Radar (mapa do que tem ao redor): distância, filtros, ordenação e quem leva a coroa.
// Sem React e sem rede — testável com `npm run test:radar`.

export type RadarKind = 'loja' | 'servico' | 'produto' | 'pessoa'

export interface RadarItem {
    id: string
    kind: RadarKind
    name: string
    imageUrl: string | null
    lat: number
    lng: number
    /** categoria da loja, nome da loja/dono, "ao vivo"... (linha de apoio do cartão) */
    subtitle: string | null
    /** só lojas: aberta agora? (null = não se aplica) */
    open: boolean | null
    rating: number | null
    ratingsCount: number
    views: number
    sales: number
    comments: number
    followers: number
    createdAt: string | null
    price: number | null
    /** pra onde "Ver" leva */
    href: string
    live: boolean
    points: number
    /** id da loja (produto/serviço de loja) ou do perfil dono */
    ownerId: string | null
}

export type RadarSort = 'perto' | 'vistos' | 'vendidos' | 'avaliados' | 'recentes'

export const SORT_OPTIONS: { id: RadarSort; label: string }[] = [
    { id: 'perto', label: 'Mais perto' },
    { id: 'vistos', label: 'Mais vistos' },
    { id: 'vendidos', label: 'Mais vendidos' },
    { id: 'avaliados', label: 'Melhor avaliados' },
    { id: 'recentes', label: 'Mais recentes' },
]

export const RADIUS_OPTIONS: { km: number | null; label: string }[] = [
    { km: 2, label: '2 km' },
    { km: 5, label: '5 km' },
    { km: 10, label: '10 km' },
    { km: null, label: 'Tudo' },
]

export interface Point { lat: number; lng: number }

/** Distância em linha reta (haversine), em km. */
export function distanceKm(a: Point, b: Point): number {
    const R = 6371
    const rad = (d: number) => (d * Math.PI) / 180
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "850 m", "2,3 km", "14 km". */
export function formatDistance(km: number | null | undefined): string {
    if (km == null) return ''
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** O que pesa pra "mais vistos": pessoas pelos pontos, o resto pelas visualizações. */
export const popularity = (it: Pick<RadarItem, 'kind' | 'views' | 'points'>) => (it.kind === 'pessoa' ? it.points : it.views)

export interface RadarFilters {
    kind: RadarKind
    query: string
    /** só lojas: só as abertas agora (as outras categorias ignoram) */
    onlyOpen: boolean
    radiusKm: number | null
}

export type WithDistance<T> = T & { distanceKm: number | null }

/** Aplica o modo, a busca, "aberto agora" e o raio (o raio só vale com a posição da pessoa). */
export function filterItems(items: RadarItem[], f: RadarFilters, me: Point | null): WithDistance<RadarItem>[] {
    const q = normalize(f.query.replace(/^@/, ''))
    const out: WithDistance<RadarItem>[] = []
    for (const it of items) {
        if (it.kind !== f.kind) continue
        if (q && !normalize(`${it.name} ${it.subtitle || ''}`).includes(q)) continue
        if (f.onlyOpen && it.kind === 'loja' && it.open === false) continue
        const d = me ? distanceKm(me, it) : null
        if (f.radiusKm != null && d != null && d > f.radiusKm) continue
        out.push({ ...it, distanceKm: d })
    }
    return out
}

/** Ordena (sem a posição, "mais perto" cai em "mais vistos"). Empate: pelo nome. */
export function sortItems<T extends RadarItem & { distanceKm: number | null }>(items: T[], sort: RadarSort): T[] {
    const by = (a: T, b: T): number => {
        switch (sort) {
            case 'perto': return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || popularity(b) - popularity(a)
            case 'vendidos': return b.sales - a.sales || popularity(b) - popularity(a)
            case 'avaliados': return (b.rating ?? 0) - (a.rating ?? 0) || b.ratingsCount - a.ratingsCount || popularity(b) - popularity(a)
            case 'recentes': return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            default: return popularity(b) - popularity(a)
        }
    }
    const hasDistance = items.some((i) => i.distanceKm != null)
    const effective: RadarSort = sort === 'perto' && !hasDistance ? 'vistos' : sort
    return [...items].sort((a, b) => (effective === sort ? by(a, b) : popularity(b) - popularity(a)) || a.name.localeCompare(b.name))
}

/** Coroas 1, 2 e 3: os mais populares do que está na tela (independe da ordenação escolhida). */
export function crownRanks(items: Pick<RadarItem, 'id' | 'kind' | 'views' | 'points'>[]): Map<string, number> {
    const top = [...items].sort((a, b) => popularity(b) - popularity(a)).filter((i) => popularity(i) > 0).slice(0, 3)
    return new Map(top.map((it, i) => [it.id, i + 1]))
}

/** Quantos itens de cada tipo passam nos filtros (os chips de modo mostram isso). */
export function countByKind(items: RadarItem[], f: Omit<RadarFilters, 'kind'>, me: Point | null): Record<RadarKind, number> {
    const out: Record<RadarKind, number> = { loja: 0, servico: 0, produto: 0, pessoa: 0 }
    for (const kind of Object.keys(out) as RadarKind[]) out[kind] = filterItems(items, { ...f, kind }, me).length
    return out
}
