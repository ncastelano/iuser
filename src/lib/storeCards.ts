// src/lib/storeCards.ts
//
// Monta os dados do StoreCard (loja + 2 destaques) a partir de ids de loja — pra telas que só guardam o id (ex: "Últimos
// acessados" da home). Uma consulta pras lojas e outra pros produtos, não uma por loja.
import { supabase } from '@/lib/supabase/client'
import type { StoreCardData } from '@/components/StoreCard'

export async function fetchStoreCards(ids: string[]): Promise<Record<string, StoreCardData>> {
    const unique = Array.from(new Set(ids)).slice(0, 60)
    if (unique.length === 0) return {}

    const [storesRes, productsRes] = await Promise.all([
        supabase
            .from('stores')
            .select('id, name, "storeSlug", description, address, logo_url, ratings_avg, ratings_count, owner_id, business_hours, view_count, category')
            .in('id', unique)
            .eq('is_active', true),
        supabase
            .from('products')
            .select('id, name, image_url, price, listing_type, store_id, created_at')
            .in('store_id', unique)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(unique.length * 4),
    ])

    const topByStore: Record<string, StoreCardData['top_products']> = {}
    ;(productsRes.data || []).forEach((p: any) => {
        const list = (topByStore[p.store_id] ||= [])
        if (list.length >= 2) return
        list.push({
            id: p.id,
            name: p.name,
            image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null,
            price: Number(p.price) || 0,
            listing_type: p.listing_type || 'sale',
        })
    })

    const out: Record<string, StoreCardData> = {}
    ;(storesRes.data || []).forEach((s: any) => {
        out[s.id] = {
            ...s,
            logo_url: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null,
            top_products: topByStore[s.id] || [],
            recent_reviews: [],
        }
    })
    return out
}
