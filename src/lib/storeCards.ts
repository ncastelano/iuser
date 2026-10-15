// src/lib/storeCards.ts
//
// Dados do card de loja da 3.0 (home e /lojas): entrega (grátis, valor, a partir de, só retirada), tempo estimado,
// faixa de preço e avaliação. Uma carga só, usada pelas duas telas.
import { supabase } from '@/lib/supabase/client'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'
import { resolveCategoria } from '@/lib/categorias'
import type { StoreCardItem } from '@/components/StoreImageCard'

export interface StoreCardData extends StoreCardItem {
    views: number
    orders: number
    ratingsCount: number
    createdAt: string
    categorySlug: string | null
}

interface DeliveryInfo { label: string; time: string | null }

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLng = (b.lng - a.lng) * Math.PI / 180
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

/** Entrega do jeito que o checkout calcula (grátis / fixa / por distância), com a localização da pessoa quando existe */
function deliveryOf(s: any, me: { lat: number; lng: number } | null): DeliveryInfo {
    if (!s.accepts_delivery) return { label: s.accepts_pickup ? 'Só retirada' : '', time: null }
    const store = s.store_lat != null && s.store_lng != null ? { lat: Number(s.store_lat), lng: Number(s.store_lng) } : null
    const distance = me && store ? km(me, store) : null

    // tempo: o que a loja informou; senão, uma estimativa pela distância (deslocamento + preparo)
    let time: string | null = null
    if (s.prep_time_min != null && s.prep_time_max != null) {
        time = `${s.prep_time_min}–${s.prep_time_max} min`
    } else if (distance != null) {
        const lo = roundTo5(15 + distance * 3)
        time = `~${lo}–${lo + 15} min`
    }

    const type = s.delivery_type as string | null
    if (type === 'free') return { label: 'Entrega grátis', time }
    if (type === 'fixed') {
        const fee = Number(s.delivery_fee) || 0
        return { label: fee > 0 ? `Entrega ${brl(fee)}` : 'Entrega grátis', time }
    }
    if (type === 'distance') {
        const base = Number(s.delivery_base_fee) || 0
        const baseDist = Number(s.delivery_base_distance) || 0
        const perKm = Number(s.delivery_fee_per_km) || 0
        if (distance == null) return { label: `Entrega a partir de ${brl(base)}`, time }
        const fee = distance <= baseDist ? base : base + (distance - baseDist) * perKm
        return { label: `Entrega ${brl(Math.round(fee * 100) / 100)}`, time }
    }
    return { label: 'Faz entrega', time }
}

export function priceRangeLabel(min: number | null, max: number | null): string | null {
    if (min == null) return null
    if (max == null || max <= min) return brl(min)
    return `${brl(min)} – ${brl(max)}`
}

export async function fetchStoreCards(opts: { limit?: number; me?: { lat: number; lng: number } | null } = {}): Promise<StoreCardData[]> {
    const { data } = await supabase
        .from('stores')
        .select('id, name, "storeSlug", logo_url, category, ratings_avg, ratings_count, view_count, business_hours, created_at, accepts_delivery, accepts_pickup, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng, prep_time_min, prep_time_max')
        .eq('is_active', true)
        .limit(opts.limit ?? 400)
    const rows = (data || []) as any[]
    const [{ data: counts }, { data: ranges }] = await Promise.all([
        supabase.rpc('get_store_order_counts'),
        supabase.rpc('get_store_price_ranges'),
    ])
    const orders = new Map(((counts as { store_id: string; orders_count: number }[]) || []).map((c) => [c.store_id, Number(c.orders_count) || 0]))
    const prices = new Map(((ranges as { store_id: string; min_price: number; max_price: number }[]) || []).map((r) => [r.store_id, r]))

    return rows.map((s) => {
        const d = deliveryOf(s, opts.me || null)
        const pr = prices.get(s.id)
        const logo = s.logo_url ? (s.logo_url.startsWith('http') ? s.logo_url : supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl) : null
        const ratingsCount = Number(s.ratings_count) || 0
        return {
            id: s.id, name: s.name, slug: s.storeSlug, logo,
            category: s.category || null,
            categorySlug: resolveCategoria(s.category)?.slug || null,
            rating: ratingsCount > 0 && Number(s.ratings_avg) > 0 ? Number(s.ratings_avg) : null,
            ratingsCount,
            open: isStoreOpenNow(s.business_hours as BusinessHours | null),
            delivery: d.label || null,
            time: d.time,
            price: priceRangeLabel(pr ? Number(pr.min_price) : null, pr ? Number(pr.max_price) : null),
            views: Number(s.view_count) || 0,
            orders: orders.get(s.id) || 0,
            createdAt: s.created_at,
        } as StoreCardData
    })
}
