// src/lib/recentRideOrigins.ts

export interface RecentRideOrigin {
    address: string
    coords: [number, number] | null
    timestamp: number
}

const STORAGE_KEY = 'recent_ride_origins_v1'
const MAX_ITEMS = 5

export function getRecentRideOrigins(): RecentRideOrigin[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function addRecentRideOrigin(origin: { address: string; coords: [number, number] | null }) {
    if (!origin.address.trim()) return
    try {
        const current = getRecentRideOrigins()
        const filtered = current.filter((o) => o.address !== origin.address)
        const updated = [{ ...origin, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
        // Ignora erros de armazenamento
    }
}
