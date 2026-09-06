// src/lib/rideReviews.ts
import { SupabaseClient } from '@supabase/supabase-js'

export interface ProfileRideRating {
    avg: number
    count: number
}

export async function getProfileRideRating(supabase: SupabaseClient, profileId: string): Promise<ProfileRideRating> {
    const { data } = await supabase
        .from('ride_reviews')
        .select('rating')
        .eq('reviewee_id', profileId)

    if (!data || data.length === 0) return { avg: 0, count: 0 }

    const count = data.length
    const avg = data.reduce((sum, r) => sum + r.rating, 0) / count
    return { avg, count }
}

// Versão em lote: uma única query pra várias pessoas de uma vez (evita N+1
// ao montar uma lista de cards, cada um com sua própria nota).
export async function getProfileRideRatingsBatch(
    supabase: SupabaseClient,
    profileIds: string[]
): Promise<Map<string, ProfileRideRating>> {
    const result = new Map<string, ProfileRideRating>()
    if (profileIds.length === 0) return result

    const { data } = await supabase
        .from('ride_reviews')
        .select('reviewee_id, rating')
        .in('reviewee_id', profileIds)

    if (!data) return result

    const grouped = new Map<string, number[]>()
    data.forEach((r) => {
        const list = grouped.get(r.reviewee_id) || []
        list.push(r.rating)
        grouped.set(r.reviewee_id, list)
    })

    grouped.forEach((ratings, id) => {
        const count = ratings.length
        const avg = ratings.reduce((sum, r) => sum + r, 0) / count
        result.set(id, { avg, count })
    })

    return result
}
