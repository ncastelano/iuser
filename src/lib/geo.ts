// Core geolocation utilities for iUser

/**
 * Parses coordinates from various formats (WKT string or GeoJSON object)
 */
export function parseCoords(location: any): [number, number] | null {
    if (!location) return null

    // 1. Se for string JSON, tenta parsear
    if (typeof location === 'string' && (location.startsWith('{') || location.startsWith('['))) {
        try {
            const parsed = JSON.parse(location)
            if (parsed && typeof parsed === 'object') {
                location = parsed
            }
        } catch { /* Ignora e segue */ }
    }

    // 2. Formato GeoJSON (Objeto)
    if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
        const [lng, lat] = location.coordinates
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
    }

    // 3. Formato WKT string (ex: POINT(-46.123 -23.456))
    if (typeof location === 'string' && location.toUpperCase().includes('POINT')) {
        const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) return [parseFloat(match[1]), parseFloat(match[2])]
    }

    // 4. Formato PostGIS Binary Hex (WKB/EWKB) - EX: 0101000020E6100000...
    if (typeof location === 'string' && location.length >= 42 && /^[0-9A-F]+$/i.test(location)) {
        try {
            // Um ponto EWKB (SRID 4326) tem 50 caracteres (25 bytes)
            // Header (9 bytes) + Lng (8 bytes) + Lat (8 bytes)
            const hexToDouble = (hex: string) => {
                const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
                const view = new DataView(bytes.buffer)
                return view.getFloat64(0, true) // Little Endian
            }

            if (location.length === 50) {
                // EWKB com SRID: 0101000020 E6100000 [8 bytes lng] [8 bytes lat]
                const lng = hexToDouble(location.substring(18, 34))
                const lat = hexToDouble(location.substring(34, 50))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            } else if (location.length === 42) {
                // WKB padrão: 0101000000 [8 bytes lng] [8 bytes lat]
                const lng = hexToDouble(location.substring(10, 26))
                const lat = hexToDouble(location.substring(26, 42))
                return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
            }
        } catch (e) {
            console.error('[Geo] Erro ao parsear WKB Hex:', e)
        }
    }

    return null
}

/**
 * Calculates distance in kilometers between two points using the Haversine formula
 */
export function calcDistanceKm(
    userLat: number, 
    userLng: number, 
    storeLocation: any
): number | null {
    if (!userLat || !userLng || !storeLocation) return null

    const coords = parseCoords(storeLocation)
    if (!coords) return null

    const [lon, lat] = coords

    const toRad = (v: number) => (v * Math.PI) / 180
    const R = 6371 // Earth radius in km

    const dLat = toRad(lat - userLat)
    const dLon = toRad(lon - userLng)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(userLat)) *
        Math.cos(toRad(lat)) *
        Math.sin(dLon / 2) ** 2

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const km = R * c

    return km
}

/**
 * Formats a distance in km to a human-readable string (m or km)
 */
export function formatDistance(km: number | null): string | null {
    if (km === null) return null

    if (km < 1) {
        const meters = Math.round(km * 1000)
        return `${meters}m`
    } else {
        return `${km.toFixed(1)}km`
    }
}
