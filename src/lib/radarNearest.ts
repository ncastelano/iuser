// src/lib/radarNearest.ts
//
// Os 3 mais próximos de cada tipo (lojas, produtos e serviços), do mais perto pro mais
// longe — o Radar da home alterna entre eles. Mesmas fontes e mesma leitura de coordenadas do /radar
// (stores.location; products.location ou lat/lng, senão a loja dona do item).
import { supabase } from '@/lib/supabase/client'
import { parseCoords } from '@/lib/geoParse'
import { haversineKm } from '@/lib/mapboxRoute'
import { getProfilesHiddenFromMap } from '@/lib/mapPrivacy'

export type NearestKind = 'loja' | 'produto' | 'servico' | 'pessoa'

export interface NearestItem {
    kind: NearestKind
    id: string
    name: string
    subtitle: string | null
    imageUrl: string | null
    price: number | null
    // null quando não há local de referência (aí a lista é a dos mais vistos)
    distanceKm: number | null
    viewCount: number
    // Pontuação (só pessoas): sem local de referência, a lista é por pontos
    points?: number
    href: string
}

export function formatDistance(km: number): string {
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    return `${km.toFixed(1).replace('.', ',')} km`
}

// userId: o que é da própria pessoa (loja, produto ou serviço dela) nunca entra.
export async function fetchNearest(origin: { lat: number; lng: number } | null, userId?: string | null): Promise<Record<NearestKind, NearestItem[]>> {
    const from: [number, number] | null = origin ? [origin.lng, origin.lat] : null

    const [{ data: stores }, { data: products }] = await Promise.all([
        supabase.from('stores').select('id, name, storeSlug, logo_url, location, owner_id, category, view_count'),
        supabase
            .from('products')
            .select('id, name, slug, image_url, price, type, listing_type, store_id, owner_id, location, lat, lng, service_type, view_count')
            .eq('is_active', true)
            .in('listing_type', ['sale', 'service_offer']),
    ])

    // Perfis que não querem aparecer no mapa não entram com os serviços dele
    const hiddenOwners = await getProfilesHiddenFromMap((products || []).filter((p: any) => !p.store_id).map((p: any) => p.owner_id))
    const visibleProducts = (products || []).filter((p: any) => p.store_id || !p.owner_id || !hiddenOwners.has(p.owner_id))

    const storeById = new Map((stores || []).map((s: any) => [s.id, s]))
    // Com local: distância até o item (e ignora o que não tem coordenada). Sem local: não
    // precisa de coordenada nenhuma, a ordem é por visualizações.
    const km = (coords: [number, number] | null): number | null | undefined => {
        if (!from) return null
        return coords ? haversineKm(from, coords) : undefined
    }
    const storeImage = (path: string | null) => (path ? supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl : null)
    const productImage = (path: string | null) => (path ? supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl : null)

    // --- loja mais próxima ---
    const nearestStores: NearestItem[] = []
    for (const s of (stores || []) as any[]) {
        const d = km(parseCoords(s.location))
        if (d === undefined || !s.storeSlug) continue
        if (userId && s.owner_id === userId) continue
        nearestStores.push({ kind: 'loja', id: s.id, name: s.name, subtitle: s.category || null, imageUrl: storeImage(s.logo_url), price: null, distanceKm: d, viewCount: Number(s.view_count) || 0, href: `/${s.storeSlug}` })
    }

    // --- produto e serviço mais próximos ---
    const coordsOf = (p: any): [number, number] | null =>
        parseCoords(p.location)
        || (Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lng, p.lat] as [number, number] : null)
        || parseCoords(storeById.get(p.store_id)?.location)

    const ownerIds = Array.from(new Set(visibleProducts.filter((p: any) => p.listing_type === 'service_offer' && p.owner_id).map((p: any) => p.owner_id)))
    const { data: owners } = ownerIds.length
        ? await supabase.from('profiles').select('id, profileSlug, name').in('id', ownerIds)
        : { data: [] as any[] }
    const ownerById = new Map((owners || []).map((o: any) => [o.id, o]))

    const nearestProducts: NearestItem[] = []
    const nearestServices: NearestItem[] = []
    for (const p of visibleProducts as any[]) {
        const d = km(coordsOf(p))
        if (d === undefined) continue
        const store = storeById.get(p.store_id)
        const owner = ownerById.get(p.owner_id)
        if (userId && (p.owner_id === userId || store?.owner_id === userId)) continue
        const baseSlug = store?.storeSlug || owner?.profileSlug
        if (!baseSlug || !p.slug) continue
        const isService = p.listing_type === 'service_offer' || p.type === 'service'
        if (isService) {
            nearestServices.push({ kind: 'servico', id: p.id, name: p.name, subtitle: store?.name || owner?.name || null, imageUrl: productImage(p.image_url), price: null, distanceKm: d, viewCount: Number(p.view_count) || 0, href: `/${baseSlug}/${p.slug}` })
        } else if (p.listing_type === 'sale' && p.type === 'physical') {
            nearestProducts.push({
                kind: 'produto', id: p.id, name: p.name, subtitle: store?.name || null,
                imageUrl: productImage(p.image_url), price: p.price != null ? Number(p.price) : null, distanceKm: d, viewCount: Number(p.view_count) || 0, href: `/${baseSlug}/${p.slug}`,
            })
        }
    }

    // --- pessoas que escolheram aparecer no mapa (já vem filtrado pelo banco: perfil + "Aparecer no mapa") ---
    const { data: peopleRows } = await supabase.rpc('get_people_on_map', { p_limit: 200 })
    const nearestPeople: NearestItem[] = []
    for (const p of (peopleRows || []) as any[]) {
        if (!p.profile_slug || (userId && p.id === userId)) continue
        const d = km(Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lng, p.lat] as [number, number] : null)
        if (d === undefined) continue
        const avatar = p.avatar_url ? (String(p.avatar_url).startsWith('http') ? p.avatar_url : supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl) : null
        nearestPeople.push({ kind: 'pessoa', id: p.id, name: p.name || `@${p.profile_slug}`, subtitle: `@${p.profile_slug}`, imageUrl: avatar, price: null, distanceKm: d, viewCount: 0, points: Number(p.points) || 0, href: `/${p.profile_slug}` })
    }

    // Com local: os 3 mais perto. Sem local: os 3 mais vistos.
    const top3 = (list: NearestItem[]) => list
        .sort((a, b) => (from ? (a.distanceKm as number) - (b.distanceKm as number) : b.viewCount - a.viewCount))
        .slice(0, 3)
    // Pessoas sem local de referência: as de mais pontos
    const top3People = nearestPeople
        .sort((a, b) => (from ? (a.distanceKm as number) - (b.distanceKm as number) : (b.points || 0) - (a.points || 0)))
        .slice(0, 3)
    return { loja: top3(nearestStores), produto: top3(nearestProducts), servico: top3(nearestServices), pessoa: top3People }
}
