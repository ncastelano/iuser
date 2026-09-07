// src/lib/mapboxRoute.ts

export interface RouteResult {
    coords: [number, number][]
    distanceKm: number
    durationMin: number
}

export function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371
    const dLat = (b[1] - a[1]) * Math.PI / 180
    const dLng = (b[0] - a[0]) * Math.PI / 180
    const lat1 = a[1] * Math.PI / 180
    const lat2 = b[1] * Math.PI / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(h))
}

// Estimativa simples pra quando não dá pra chamar a Directions API (ou ela falha):
// velocidade média de carro em trânsito urbano.
const FALLBACK_SPEED_KMH = 30

export async function fetchRoute(from: [number, number], to: [number, number]): Promise<RouteResult> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=simplified&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
        )
        const data = await res.json()
        const route = data.routes?.[0]
        const coords = route?.geometry?.coordinates
        if (coords && coords.length > 1) {
            return { coords, distanceKm: route.distance / 1000, durationMin: route.duration / 60 }
        }
    } catch {
        // cai no fallback de linha reta abaixo
    }
    const distanceKm = haversineKm(from, to)
    return { coords: [from, to], distanceKm, durationMin: (distanceKm / FALLBACK_SPEED_KMH) * 60 }
}

// Desloca uma polyline perpendicularmente à sua própria direção por uma
// distância fixa (em metros). Usado pra separar visualmente duas rotas que
// percorrem a mesma via (ex: motorista tem que ir e voltar pelo mesmo
// caminho) — sem isso uma cor cobre a outra por inteiro no mapa.
export function offsetPolyline(coords: [number, number][], offsetMeters: number): [number, number][] {
    if (coords.length < 2) return coords

    return coords.map((point, i) => {
        const prev = coords[Math.max(0, i - 1)]
        const next = coords[Math.min(coords.length - 1, i + 1)]
        const dx = next[0] - prev[0]
        const dy = next[1] - prev[1]
        const len = Math.hypot(dx, dy) || 1

        // Vetor perpendicular unitário (rotaciona a direção local em 90°).
        const perpX = -dy / len
        const perpY = dx / len

        const latRad = point[1] * Math.PI / 180
        const metersPerDegLat = 111320
        const metersPerDegLng = 111320 * Math.cos(latRad)

        return [
            point[0] + (perpX * offsetMeters) / metersPerDegLng,
            point[1] + (perpY * offsetMeters) / metersPerDegLat,
        ] as [number, number]
    })
}
