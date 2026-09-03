// src/lib/recentRideDestinations.ts

export interface RecentRideDestination {
    address: string
    coords: [number, number] | null
    timestamp: number
}

const STORAGE_KEY = 'recent_ride_destinations_v1'
const MAX_ITEMS = 5

export function getRecentRideDestinations(): RecentRideDestination[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function addRecentRideDestination(destination: { address: string; coords: [number, number] | null }) {
    if (!destination.address.trim()) return
    try {
        const current = getRecentRideDestinations()
        const filtered = current.filter((d) => d.address !== destination.address)
        const updated = [{ ...destination, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
        // Ignora erros de armazenamento
    }
}
