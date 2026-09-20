// src/lib/savedRidePlaces.ts
import { supabase } from '@/lib/supabase/client'

export type RidePlaceKind = 'origin' | 'destination'

export interface SavedRidePlace {
    address: string
    coords: [number, number] | null
    timestamp: number
}

const MAX_ITEMS = 8

export async function fetchSavedRidePlaces(userId: string, kind: RidePlaceKind): Promise<SavedRidePlace[]> {
    const { data } = await supabase
        .from('saved_ride_places')
        .select('address, lng, lat, last_used_at')
        .eq('profile_id', userId)
        .eq('kind', kind)
        .order('last_used_at', { ascending: false })
        .limit(MAX_ITEMS)
    return (data || []).map((r) => ({
        address: r.address,
        coords: r.lng != null && r.lat != null ? [r.lng, r.lat] : null,
        timestamp: new Date(r.last_used_at).getTime(),
    }))
}

export async function saveRidePlace(
    userId: string,
    kind: RidePlaceKind,
    place: { address: string; coords: [number, number] | null }
): Promise<void> {
    if (!place.address.trim()) return
    await supabase.from('saved_ride_places').upsert(
        {
            profile_id: userId,
            kind,
            address: place.address,
            lng: place.coords?.[0] ?? null,
            lat: place.coords?.[1] ?? null,
            last_used_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,kind,address' }
    )
}
