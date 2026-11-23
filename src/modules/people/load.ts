// src/modules/people/load.ts — as fontes de cada seção da página /social. Só dado PÚBLICO (nome, @, foto, pontos, bairro).
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { fetchFeed } from '@/modules/flash'
import { normalizeQuery, personFromMapRow, placeFromRow, sortNearby, type Person, type Place } from './domain'

export const avatarOf = (path: string | null): string | null => getAvatarUrl(supabase, path) ?? null

const PUBLIC = 'id, name, profileSlug, avatar_url, created_at, ratings_avg, service_mode_active'
const toPerson = (r: any, extra: Partial<Person> = {}): Person => ({
    id: r.id, name: r.name || `@${r.profileSlug}`, slug: r.profileSlug, avatarPath: r.avatar_url || null, points: 0, distanceKm: null, joinedAt: r.created_at || null, ratingAvg: r.ratings_avg != null ? Number(r.ratings_avg) : null, ...extra,
})

/** Quem escolheu aparecer no Radar, perto de quem vê (sem local: as de mais pontos) */
export async function loadNearbyPeople(origin: { lat: number; lng: number } | null, userId: string | null, limit = 12): Promise<Person[]> {
    const { data, error } = await supabase.rpc('get_people_on_map', { p_limit: 300 })
    if (error) throw error
    const list = ((data || []) as Record<string, any>[]).map((r) => personFromMapRow(r, origin)).filter((p): p is Person => !!p && p.id !== userId)
    return sortNearby(list, !!origin).slice(0, limit)
}

export async function loadPlaces(limit = 8): Promise<Place[]> {
    const { data, error } = await supabase.rpc('get_people_places', { p_limit: limit })
    if (error) throw error
    const places = ((data || []) as Record<string, any>[]).map(placeFromRow).filter((p): p is Place => !!p)
    return fillPlaceCenters(places)
}

// Bairro sem centro (menos de 2 pessoas com local): procura o BAIRRO pelo nome no Mapbox, perto de um bairro que já tem centro
// (só o nome do bairro sai do aparelho; guardado nesta aba)
async function fillPlaceCenters(places: Place[]): Promise<Place[]> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const near = places.find((p) => p.lat != null && p.lng != null)
    if (!token || !near || typeof window === 'undefined') return places
    return Promise.all(places.map(async (p) => {
        if (p.lat != null && p.lng != null) return p
        const key = `iuser_place_center:${p.place}`
        try {
            const cached = sessionStorage.getItem(key)
            if (cached) { const [lat, lng] = JSON.parse(cached); return { ...p, lat, lng } }
        } catch { /* sem armazenamento */ }
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(p.place)}.json?types=neighborhood,locality,district&country=br&limit=1&language=pt&proximity=${near.lng},${near.lat}&access_token=${token}`
            const j = await fetch(url).then((r) => r.json())
            const c = j?.features?.[0]?.center as [number, number] | undefined
            if (!c) return p
            // longe demais do bairro de referência (> 40 km): outro lugar com o mesmo nome, não usa
            const dLat = c[1] - (near.lat as number), dLng = c[0] - (near.lng as number)
            if (Math.sqrt(dLat * dLat + dLng * dLng) > 0.4) return p
            const lat = Math.round(c[1] * 100) / 100, lng = Math.round(c[0] * 100) / 100
            try { sessionStorage.setItem(key, JSON.stringify([lat, lng])) } catch { /* ok */ }
            return { ...p, lat, lng }
        } catch { return p }
    }))
}

export async function loadPeopleInPlace(place: string, limit = 24): Promise<Person[]> {
    const { data, error } = await supabase.rpc('get_people_in_place', { p_place: place, p_limit: limit })
    if (error) throw error
    return ((data || []) as Record<string, any>[]).map((r) => personFromMapRow({ ...r, lat: null, lng: null }, null)).filter((p): p is Person => !!p)
}

/** As de mais pontos (a mesma conta do "Melhores perfis") */
export async function loadTopPeople(limit = 12): Promise<Person[]> {
    const { data, error } = await supabase.rpc('get_best_profiles', { p_limit: limit })
    if (error) throw error
    const rows = (data || []) as { id: string; points: number }[]
    if (!rows.length) return []
    const { data: profs } = await supabase.from('profiles').select(PUBLIC).in('id', rows.map((r) => r.id))
    const by = new Map((profs || []).map((p: any) => [p.id, p]))
    return rows.map((r) => (by.get(r.id) ? toPerson(by.get(r.id), { points: Number(r.points) || 0 }) : null)).filter((p): p is Person => !!p && !!p.slug)
}

export async function loadNewPeople(limit = 14): Promise<Person[]> {
    const { data, error } = await supabase.from('profiles').select(PUBLIC).eq('is_active', true).not('profileSlug', 'is', null).order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return (data || []).map((r: any) => toPerson(r))
}

/** Quem oferece serviço (modo prestador ligado), com o primeiro serviço dele */
export async function loadServiceProviders(limit = 10): Promise<Person[]> {
    const { data, error } = await supabase.from('profiles').select(PUBLIC).eq('is_active', true).eq('service_mode_active', true).not('profileSlug', 'is', null).order('ratings_avg', { ascending: false, nullsFirst: false }).limit(limit)
    if (error) throw error
    const people = (data || []) as any[]
    if (!people.length) return []
    const { data: svc } = await supabase.from('products').select('owner_id, name').eq('listing_type', 'service_offer').eq('is_active', true).in('owner_id', people.map((p) => p.id))
    const first = new Map<string, string>()
    for (const s of (svc || []) as any[]) if (!first.has(s.owner_id)) first.set(s.owner_id, s.name)
    return people.map((p) => toPerson(p, { offers: first.get(p.id) || null }))
}

export async function searchPeople(q: string, limit = 12): Promise<Person[]> {
    const n = normalizeQuery(q)
    if (n.length < 2) return []
    const like = `%${n.replace(/[%_,()]/g, ' ')}%`
    const { data, error } = await supabase.from('profiles').select(PUBLIC).eq('is_active', true).not('profileSlug', 'is', null).or(`name.ilike.${like},profileSlug.ilike.${like}`).limit(limit)
    if (error) throw error
    return (data || []).map((r: any) => toPerson(r))
}

export interface CommunityCard { id: string; slug: string; name: string; city: string | null; image: string | null }
export async function loadCommunities(limit = 8): Promise<CommunityCard[]> {
    const { data, error } = await supabase.from('communities').select('id, slug, name, city, image_url').eq('is_listed', true).order('created_at', { ascending: true }).limit(limit)
    if (error) throw error
    return (data || []).map((c: any) => ({ id: c.id, slug: c.slug, name: c.name, city: c.city || null, image: !c.image_url ? null : /^https?:\/\//.test(c.image_url) ? c.image_url : supabase.storage.from('community-photos').getPublicUrl(c.image_url).data.publicUrl }))   // a foto já vem com o endereço completo
}

/** `mode='following'`: só de quem a pessoa segue (sem login volta vazio) */
export const loadFlashes = (limit = 12, mode: 'all' | 'following' = 'all') => fetchFeed(mode, null, 'flash').then((r) => r.slice(0, limit))
export const loadPublications = (limit = 10, mode: 'all' | 'following' = 'all') => fetchFeed(mode, null, 'publication').then((r) => r.slice(0, limit))

/** Publicações das LOJAS (as das pessoas vêm do feed do Flash): as mais novas, com o nome e o logo da loja. Só campos públicos. */
export interface StorePublication { id: string; slug: string | null; title: string; image: string | null; storeName: string; storeLogo: string | null; createdAt: string }
export async function loadStorePublications(limit = 10): Promise<StorePublication[]> {
    const { data, error } = await supabase.from('products')
        .select('id, slug, name, description, image_url, created_at, stores!inner(name, logo_url, is_active)')
        .eq('listing_type', 'publication').eq('is_active', true).not('store_id', 'is', null).eq('stores.is_active', true)
        .order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    const pub = (bucket: string, p: string | null) => !p ? null : /^https?:\/\//.test(p) ? p : supabase.storage.from(bucket).getPublicUrl(p).data.publicUrl
    return (data || []).map((r: any) => ({
        id: r.id, slug: r.slug || null, title: r.name || r.description || '', image: pub('product-images', r.image_url),
        storeName: r.stores?.name || 'Loja', storeLogo: pub('store-logos', r.stores?.logo_url || null), createdAt: r.created_at,
    }))
}
