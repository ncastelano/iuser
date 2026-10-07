// src/lib/geoParse.ts
//
// Lê a coluna geográfica `location` do Supabase (PostGIS) em qualquer um dos
// formatos em que ela chega: GeoJSON, WKT "POINT(lng lat)" ou WKB em hexa.
// Devolve [lng, lat] ou null. Usado pelo /radar e pelos cards do Radar da home.

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
        } catch (e) { console.error('[Geo] WKB Error:', e) }
    }

    return null
}

