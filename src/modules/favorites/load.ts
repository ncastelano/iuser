// src/modules/favorites/load.ts — conversa com o banco (RPCs dos favoritos). Nenhuma regra aqui: quem decide é o banco.
import { supabase } from '@/lib/supabase/client'
import type { DriverSuggestion, ExclusiveOffer, FavoriteDriver, FavoritesState, MyFavoriteStore } from './domain'
import { DEFAULT_WINDOW } from './domain'

const num = (v: unknown) => (v == null ? null : Number(v))
/** logo da loja: guardado como caminho no bucket store-logos (ou já um link) */
const logoUrl = (p: string | null | undefined) => (p ? (p.startsWith('http') ? p : supabase.storage.from('store-logos').getPublicUrl(p).data.publicUrl) : null)

export async function fetchStoreFavorites(storeId: string): Promise<FavoritesState> {
    const { data, error } = await supabase.rpc('get_store_favorites', { p_store: storeId })
    if (error) throw error
    const d = (data || {}) as { items?: any[]; favorites_first?: boolean; window_seconds?: number }
    const items: FavoriteDriver[] = (d.items || []).map((r) => ({
        driverId: r.driver_id, name: r.name || 'Motorista', slug: r.slug || null, photo: r.photo || null, status: r.status, online: !!r.online,
        deliveries: Number(r.deliveries) || 0, ratingAvg: num(r.rating_avg), ratingCount: Number(r.rating_count) || 0,
    }))
    return { items, favoritesFirst: d.favorites_first !== false, windowSeconds: Number(d.window_seconds) || DEFAULT_WINDOW }
}

export async function suggestDrivers(storeId: string, q: string): Promise<DriverSuggestion[]> {
    const { data, error } = await supabase.rpc('suggest_favorite_drivers', { p_store: storeId, p_q: q.trim() || null })
    if (error) throw error
    return ((data || []) as any[]).map((r) => ({ driverId: r.driver_id, name: r.name || 'Motorista', slug: r.slug || null, photo: r.photo || null, deliveries: Number(r.deliveries) || 0, ratingAvg: num(r.rating_avg), ratingCount: Number(r.rating_count) || 0 }))
}

export async function inviteDriver(storeId: string, driverId: string): Promise<void> {
    const { error } = await supabase.rpc('store_add_favorite_driver', { p_store: storeId, p_driver: driverId })
    if (error) throw error
}
export async function removeDriver(storeId: string, driverId: string): Promise<void> {
    const { error } = await supabase.rpc('store_remove_favorite_driver', { p_store: storeId, p_driver: driverId })
    if (error) throw error
}
export async function saveSettings(storeId: string, favoritesFirst: boolean, windowSeconds: number): Promise<void> {
    const { error } = await supabase.rpc('set_store_favorites_settings', { p_store: storeId, p_first: favoritesFirst, p_window: windowSeconds })
    if (error) throw error
}

// ===== lado do motorista =====
export async function fetchMyFavoriteStores(): Promise<MyFavoriteStore[]> {
    const { data, error } = await supabase.rpc('get_my_favorite_stores')
    if (error) throw error
    return ((data || []) as any[]).map((r) => ({ storeId: r.store_id, storeName: r.store_name || 'Loja', storeSlug: r.store_slug || null, logo: logoUrl(r.logo_url), status: r.status, invitedAt: r.invited_at }))
}
export async function respondInvite(storeId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_favorite_invite', { p_store: storeId, p_accept: accept })
    if (error) throw error
}
export async function leaveStore(storeId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_favorite', { p_store: storeId })
    if (error) throw error
}
export async function fetchMyExclusiveOffers(): Promise<ExclusiveOffer[]> {
    const { data, error } = await supabase.rpc('get_my_exclusive_offers')
    if (error) throw error
    return ((data || []) as any[]).map((r) => ({ rideId: r.ride_id, until: r.exclusive_until, storeName: r.store_name || 'Loja' }))
}
