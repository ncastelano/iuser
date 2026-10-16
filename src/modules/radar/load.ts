// src/modules/radar/load.ts
//
// Carrega tudo que o Radar mostra (lojas, serviços, produtos e pessoas com localização) já no formato RadarItem.
// Só leitura. Itens sem coordenada não entram (o Radar é um mapa).
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCoords } from '@/lib/geoParse'
import { getProfilesHiddenFromMap } from '@/lib/mapPrivacy'
import { isStoreOpenNow } from '@/lib/storeHours'
import { resolveCategoria } from '@/lib/categorias'
import type { RadarItem } from './domain'

type Coords = [number, number] | null
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export async function loadRadar(client: SupabaseClient): Promise<RadarItem[]> {
    const [storesRes, productsRes, peopleRes, metricsRes] = await Promise.all([
        client.from('stores').select('id, name, "storeSlug", logo_url, category, location, store_lat, store_lng, business_hours, ratings_avg, ratings_count, view_count, created_at, owner_id').eq('is_active', true),
        client.from('products').select('id, name, slug, type, listing_type, image_url, price, view_count, created_at, store_id, owner_id, location, lat, lng, service_type, category')
            .in('listing_type', ['sale', 'service_offer']).limit(1500),
        client.rpc('get_people_on_map', { p_limit: 200 }),
        client.rpc('get_radar_metrics'),
    ])
    const stores = (storesRes.data as any[]) || []
    const productsRaw = (productsRes.data as any[]) || []
    const metrics = (metricsRes.data as { stores: Record<string, { sales: number; comments: number; followers: number }>; products: Record<string, { sales: number; comments: number }> } | null) || { stores: {}, products: {} }

    // perfis que desligaram "Aparecer no mapa" não entram com os seus serviços
    const hidden = await getProfilesHiddenFromMap(productsRaw.filter((p) => !p.store_id).map((p) => p.owner_id))
    const products = productsRaw.filter((p) => p.store_id || !p.owner_id || !hidden.has(p.owner_id))

    const storeById = new Map(stores.map((s) => [s.id as string, s]))
    const storeCoords = (s: any): Coords => parseCoords(s?.location) || (finite(Number(s?.store_lng)) && finite(Number(s?.store_lat)) && s?.store_lat != null ? [Number(s.store_lng), Number(s.store_lat)] : null)

    // slug dos donos de produto sem loja (a página do serviço pessoal é /<perfil>/<slug>)
    const ownerIds = Array.from(new Set(products.filter((p) => !p.store_id && p.owner_id).map((p) => p.owner_id as string)))
    const slugByOwner = new Map<string, { slug: string | null; name: string | null }>()
    if (ownerIds.length) {
        const { data: profs } = await client.from('profiles').select('id, "profileSlug", name').in('id', ownerIds)
        ;(profs || []).forEach((p: any) => slugByOwner.set(p.id, { slug: p.profileSlug, name: p.name }))
    }

    const items: RadarItem[] = []

    for (const s of stores) {
        const c = storeCoords(s)
        if (!c) continue
        const m = metrics.stores[s.id]
        const ratingsCount = Number(s.ratings_count) || 0
        items.push({
            id: s.id, kind: 'loja', name: s.name,
            imageUrl: s.logo_url ? (String(s.logo_url).startsWith('http') ? s.logo_url : client.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl) : null,
            lng: c[0], lat: c[1],
            subtitle: resolveCategoria(s.category)?.nome || s.category || null,
            open: isStoreOpenNow(s.business_hours),
            rating: ratingsCount > 0 && Number(s.ratings_avg) > 0 ? Number(s.ratings_avg) : null, ratingsCount,
            views: Number(s.view_count) || 0, sales: Number(m?.sales) || 0, comments: Number(m?.comments) || 0, followers: Number(m?.followers) || 0,
            createdAt: s.created_at || null, price: null, href: `/${s.storeSlug}`, live: false, points: 0, ownerId: s.owner_id || null,
        })
    }

    for (const p of products) {
        const kind = p.type === 'service' ? 'servico' : 'produto'
        const store = p.store_id ? storeById.get(p.store_id) : null
        const own: Coords = parseCoords(p.location) || (finite(p.lat) && finite(p.lng) ? [p.lng, p.lat] : null)
        const c = own || storeCoords(store)
        if (!c) continue
        const owner = p.owner_id ? slugByOwner.get(p.owner_id) : null
        const href = store ? `/${store.storeSlug}/${p.slug}` : owner?.slug ? `/${owner.slug}/${p.slug}` : null
        if (!href) continue
        const m = metrics.products[p.id]
        items.push({
            id: p.id, kind, name: p.name,
            imageUrl: p.image_url ? client.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null,
            lng: c[0], lat: c[1],
            subtitle: store?.name || (owner?.slug ? `@${owner.slug}` : owner?.name || null),
            open: null, rating: null, ratingsCount: 0,
            views: Number(p.view_count) || 0, sales: Number(m?.sales) || 0, comments: Number(m?.comments) || 0, followers: 0,
            createdAt: p.created_at || null, price: p.price != null ? Number(p.price) : null, href, live: false, points: 0, ownerId: p.store_id || p.owner_id || null,
        })
    }

    for (const p of ((peopleRes.data as any[]) || [])) {
        if (!finite(p.lat) || !finite(p.lng)) continue
        items.push({
            id: p.id, kind: 'pessoa', name: p.profile_slug ? `@${p.profile_slug}` : p.name || 'Pessoa',
            imageUrl: p.avatar_url ? (String(p.avatar_url).startsWith('http') ? p.avatar_url : client.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl) : null,
            lng: p.lng, lat: p.lat, subtitle: p.is_live ? 'Ao vivo agora' : null, open: null, rating: null, ratingsCount: 0,
            views: 0, sales: 0, comments: 0, followers: 0, createdAt: null, price: null,
            href: p.profile_slug ? `/${p.profile_slug}` : '/', live: !!p.is_live, points: Number(p.points) || 0, ownerId: p.id,
        })
    }

    return items
}
