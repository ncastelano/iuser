// src/lib/recentServiceLocations.ts

export interface RecentServiceLocation {
    address: string
    coords: [number, number] | null
    timestamp: number
}

const STORAGE_KEY = 'recent_service_locations_v1'
const MAX_ITEMS = 5

export function getRecentServiceLocations(): RecentServiceLocation[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function addRecentServiceLocation(location: { address: string; coords: [number, number] | null }) {
    if (!location.address.trim()) return
    try {
        const current = getRecentServiceLocations()
        const filtered = current.filter((l) => l.address !== location.address)
        const updated = [{ ...location, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
        // Ignora erros de armazenamento
    }
}
