// src/lib/radarNearest.ts
//
// Os 3 mais próximos de cada tipo (lojas, produtos e serviços), do mais perto pro mais
// longe — o Radar da home alterna entre eles. Mesmas fontes e mesma leitura de coordenadas do /radar
// (stores.location; products.location ou lat/lng, senão a loja dona do item).
import { supabase } from '@/lib/supabase/client'
import { parseCoords } from '@/lib/geoParse'
import { haversineKm } from '@/lib/mapboxRoute'

export type NearestKind = 'loja' | 'produto' | 'servico'

export interface NearestItem {
    kind: NearestKind
    id: string
    name: string
    subtitle: string | null
    imageUrl: string | null
    price: number | null
    distanceKm: number
    href: string
}

export function formatDistance(km: number): string {
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    return `${km.toFixed(1).replace('.', ',')} km`
}

// userId: o que é da própria pessoa (loja, produto ou serviço dela) nunca entra.
export async function fetchNearest(origin: { lat: number; lng: number }, userId?: string | null): Promise<Record<NearestKind, NearestItem[]>> {
    const from: [number, number] = [origin.lng, origin.lat]

    const [{ data: stores }, { data: products }] = await Promise.all([
        supabase.from('stores').select('id, name, storeSlug, logo_url, location, owner_id, category'),
        supabase
            .from('products')
            .select('id, name, slug, image_url, price, type, listing_type, store_id, owner_id, location, lat, lng, service_type')
            .eq('is_active', true)
            .in('listing_type', ['sale', 'service_offer']),
    ])

    const storeById = new Map((stores || []).map((s: any) => [s.id, s]))
    const km = (coords: [number, number] | null) => (coords ? haversineKm(from, coords) : null)
    const storeImage = (path: string | null) => (path ? supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl : null)
    const productImage = (path: string | null) => (path ? supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl : null)

    // --- loja mais próxima ---
    const nearestStores: NearestItem[] = []
    for (const s of (stores || []) as any[]) {
        const d = km(parseCoords(s.location))
        if (d == null || !s.storeSlug) continue
        if (userId && s.owner_id === userId) continue
        nearestStores.push({ kind: 'loja', id: s.id, name: s.name, subtitle: s.category || null, imageUrl: storeImage(s.logo_url), price: null, distanceKm: d, href: `/${s.storeSlug}` })
    }

    // --- produto e serviço mais próximos ---
    const coordsOf = (p: any): [number, number] | null =>
        parseCoords(p.location)
        || (Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lng, p.lat] as [number, number] : null)
        || parseCoords(storeById.get(p.store_id)?.location)

    const ownerIds = Array.from(new Set((products || []).filter((p: any) => p.listing_type === 'service_offer' && p.owner_id).map((p: any) => p.owner_id)))
    const { data: owners } = ownerIds.length
        ? await supabase.from('profiles').select('id, profileSlug, name').in('id', ownerIds)
        : { data: [] as any[] }
    const ownerById = new Map((owners || []).map((o: any) => [o.id, o]))

    const nearestProducts: NearestItem[] = []
    const nearestServices: NearestItem[] = []
    for (const p of (products || []) as any[]) {
        const d = km(coordsOf(p))
        if (d == null) continue
        const store = storeById.get(p.store_id)
        const owner = ownerById.get(p.owner_id)
        if (userId && (p.owner_id === userId || store?.owner_id === userId)) continue
        const baseSlug = store?.storeSlug || owner?.profileSlug
        if (!baseSlug || !p.slug) continue
        const isService = p.listing_type === 'service_offer' || p.type === 'service'
        if (isService) {
            nearestServices.push({ kind: 'servico', id: p.id, name: p.name, subtitle: store?.name || owner?.name || null, imageUrl: productImage(p.image_url), price: null, distanceKm: d, href: `/${baseSlug}/${p.slug}` })
        } else if (p.listing_type === 'sale' && p.type === 'physical') {
            nearestProducts.push({
                kind: 'produto', id: p.id, name: p.name, subtitle: store?.name || null,
                imageUrl: productImage(p.image_url), price: p.price != null ? Number(p.price) : null, distanceKm: d, href: `/${baseSlug}/${p.slug}`,
            })
        }
    }

    const top3 = (list: NearestItem[]) => list.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3)
    return { loja: top3(nearestStores), produto: top3(nearestProducts), servico: top3(nearestServices) }
}
