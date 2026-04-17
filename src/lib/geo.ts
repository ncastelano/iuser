// Core geolocation utilities for iUser

/**
 * Parses coordinates from various formats (WKT string or GeoJSON object)
 */
export function parseCoords(location: any): [number, number] | null {
    if (!location) return null

    // If string JSON, try to parse
    if (typeof location === 'string') {
        try {
            const parsed = JSON.parse(location)
            if (parsed && typeof parsed === 'object') {
                location = parsed
            }
        } catch {
            // Continue to other checks
        }
    }

    // GeoJSON format
    if (location?.type === 'Point' && Array.isArray(location.coordinates)) {
        const [lng, lat] = location.coordinates
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : null
    }

    // WKT string format
    if (typeof location === 'string') {
        const match = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        return match ? [parseFloat(match[1]), parseFloat(match[2])] : null
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
