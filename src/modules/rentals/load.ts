// src/modules/rentals/load.ts
//
// Carrega o que as telas de aluguel mostram. Só leitura; o endereço completo NÃO vem daqui (get_rental_address, só dono e quem tem visita
// confirmada). Fotos ficam no bucket `product-images`.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HostTrust, RentalListing } from './domain'

export interface RentalCard extends RentalListing {
    ownerName: string | null
    ownerSlug: string | null
    ownerAvatar: string | null
    storeName: string | null
    storeSlug: string | null
    storeLogo: string | null
}

const SELECT = '*, owner:profiles!owner_id(name, profileSlug, avatar_url), store:stores!store_id(name, storeSlug, logo_url)'

const photoUrl = (client: SupabaseClient, path: string) => (path.startsWith('http') ? path : client.storage.from('product-images').getPublicUrl(path).data.publicUrl)

function toCard(client: SupabaseClient, r: any): RentalCard {
    return {
        id: r.id, slug: r.slug, ownerId: r.owner_id, storeId: r.store_id, title: r.title, description: r.description,
        propertyType: r.property_type, rentalKind: r.rental_kind, price: Number(r.price), condoFee: Number(r.condo_fee) || 0, iptuFee: Number(r.iptu_fee) || 0,
        depositAmount: Number(r.deposit_amount) || 0, bedrooms: r.bedrooms, bathrooms: r.bathrooms, parking: r.parking, areaM2: r.area_m2 != null ? Number(r.area_m2) : null,
        furnished: !!r.furnished, petsAllowed: !!r.pets_allowed, amenities: r.amenities || [], rules: r.rules, photos: ((r.photos as string[]) || []).map((p) => photoUrl(client, p)),
        neighborhood: r.neighborhood, city: r.city, state: r.state, approxLat: r.approx_lat, approxLng: r.approx_lng, availableFrom: r.available_from,
        minStayDays: r.min_stay_days, maxGuests: r.max_guests, status: r.status, viewCount: r.view_count || 0, createdAt: r.created_at,
        ownerName: r.owner?.name ?? null, ownerSlug: r.owner?.profileSlug ?? null,
        ownerAvatar: r.owner?.avatar_url ? client.storage.from('avatars').getPublicUrl(r.owner.avatar_url).data.publicUrl : null,
        storeName: r.store?.name ?? null, storeSlug: r.store?.storeSlug ?? null,
        storeLogo: r.store?.logo_url ? (String(r.store.logo_url).startsWith('http') ? r.store.logo_url : client.storage.from('store-logos').getPublicUrl(r.store.logo_url).data.publicUrl) : null,
    }
}

/** Imóveis ativos, os mais novos primeiro (a busca e os filtros rodam no app, que são poucos por vez). */
export async function loadRentalListings(client: SupabaseClient): Promise<RentalCard[]> {
    const { data } = await client.from('rental_listings').select(SELECT).eq('status', 'active').order('created_at', { ascending: false }).limit(300)
    return ((data as any[]) || []).map((r) => toCard(client, r))
}

/** Alguns imóveis ativos (os mais novos) para a vitrine da home. */
export async function loadRentalPreview(client: SupabaseClient, limit = 4): Promise<RentalCard[]> {
    const { data } = await client.from('rental_listings').select(SELECT).eq('status', 'active').order('created_at', { ascending: false }).limit(limit)
    return ((data as any[]) || []).map((r) => toCard(client, r))
}

export async function loadRentalListing(client: SupabaseClient, slug: string): Promise<RentalCard | null> {
    const { data } = await client.from('rental_listings').select(SELECT).eq('slug', slug).maybeSingle()
    return data ? toCard(client, data) : null
}

/** Os anúncios de quem está logado (ativos, pausados e alugados). */
export async function loadMyRentalListings(client: SupabaseClient, userId: string): Promise<RentalCard[]> {
    const { data } = await client.from('rental_listings').select(SELECT).eq('owner_id', userId).order('created_at', { ascending: false })
    return ((data as any[]) || []).map((r) => toCard(client, r))
}

export interface RentalReview { rating: number; comment: string | null; created_at: string; reviewer_name: string | null; reviewer_slug: string | null }
export interface RentalExtras {
    trust: HostTrust | null
    reviews: RentalReview[]
    /** endereço completo: só o dono e quem tem visita confirmada recebem */
    address: { address: string; number: string | null; complement: string | null; lat: number | null; lng: number | null } | null
}

export async function loadRentalExtras(client: SupabaseClient, listing: Pick<RentalListing, 'id' | 'ownerId'>): Promise<RentalExtras> {
    const [t, r, a] = await Promise.all([
        client.rpc('get_rental_host_trust', { p_host: listing.ownerId }),
        client.rpc('get_rental_reviews', { p_listing: listing.id }),
        client.rpc('get_rental_address', { p_listing: listing.id }),
    ])
    return { trust: (t.data as HostTrust | null) || null, reviews: (r.data as RentalReview[] | null) || [], address: (a.data as RentalExtras['address']) || null }
}
