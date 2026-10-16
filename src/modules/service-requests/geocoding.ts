// src/modules/service-requests/geocoding.ts
//
// Endereço ↔ coordenadas (Mapbox Geocoding). Sem estado; quem chama decide o que fazer com o resultado.

const TOKEN = () => process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export interface AddressHit {
    place_name: string
    center: [number, number]
}

export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${TOKEN()}&language=pt&types=address,place,locality`)
        const data = await res.json()
        return data.features?.[0]?.place_name || null
    } catch {
        return null
    }
}

export async function searchAddress(query: string): Promise<AddressHit[]> {
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${TOKEN()}&language=pt&limit=5&country=br`)
        const data = await res.json()
        return data.features || []
    } catch {
        return []
    }
}
