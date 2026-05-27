// Funções utilitárias de geolocalização

export function parseCoords(location: any): [number, number] | null {
    if (!location) return null

    if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
        try {
            const parsed = JSON.parse(location)
            if (parsed && typeof parsed === 'object') {
                location = parsed
            }
        } catch { }
    }

    if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
        const [lng, lat] = location.coordinates
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
    }

    if (typeof location === 'string' && location.toUpperCase().includes('POINT')) {
        const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) return [parseFloat(match[1]), parseFloat(match[2])]
    }

    if (typeof location === 'string' && location.length >= 42 && /^[0-9A-F]+$/i.test(location)) {
        try {
            const hexToDouble = (hex: string) => {
                const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
                const view = new DataView(bytes.buffer)
                return view.getFloat64(0, true)
            }

            if (location.length === 50) {
                const lng = hexToDouble(location.substring(18, 34))
                const lat = hexToDouble(location.substring(34, 50))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            } else if (location.length === 42) {
                const lng = hexToDouble(location.substring(10, 26))
                const lat = hexToDouble(location.substring(26, 42))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            }
        } catch (e) {
            console.error('[Geo] WKB Error:', e)
        }
    }

    return null
}

export function calcDistanceKm(
    storeLocation: any,
    referenceLocation: { lat: number; lng: number } | null
): number | null {
    if (!referenceLocation || !storeLocation) return null

    const coords = parseCoords(storeLocation)
    if (!coords) return null

    const [lon, lat] = coords
    const R = 6371
    const dLat = (lat - referenceLocation.lat) * Math.PI / 180
    const dLon = (lon - referenceLocation.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(referenceLocation.lat * Math.PI / 180) *
        Math.cos(lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(distance: number | null): string | null {
    if (distance === null) return null
    return distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`
}