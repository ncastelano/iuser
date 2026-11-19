// src/modules/items/load.ts — o que a pessoa já tem, lido COMO ela (RLS): produtos dos pedidos pagos e os serviços agendados com ela.
import { supabase } from '@/lib/supabase/client'
import { groupOwned, type BoughtLine, type OwnedProduct } from './domain'

export interface OwnedProductCard extends OwnedProduct { image: string | null; slug: string | null }

export async function loadOwnedProducts(me: string): Promise<OwnedProductCard[]> {
    const { data: orders, error } = await supabase.from('orders').select('id, created_at, stores(name, storeSlug)')
        .eq('buyer_id', me).eq('status', 'paid').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    if (!orders?.length) return []
    const byOrder = new Map(orders.map((o: any) => [o.id, o]))
    const { data: items } = await supabase.from('order_items').select('order_id, product_id, product_name, quantity, unit_price').in('order_id', orders.map((o: any) => o.id))
    const ids = [...new Set((items || []).map((i: any) => i.product_id).filter(Boolean))]
    const prods = new Map<string, any>()
    if (ids.length) {
        const { data } = await supabase.from('products').select('id, slug, image_url, type').in('id', ids.slice(0, 300))
        for (const p of data || []) prods.set((p as any).id, p)
    }
    const lines: BoughtLine[] = (items || [])
        .filter((i: any) => prods.get(i.product_id)?.type !== 'digital')   // o digital tem o seu lugar (Digitais)
        .map((i: any) => {
            const o: any = byOrder.get(i.order_id)
            return { productId: i.product_id, name: i.product_name || 'Produto', quantity: Number(i.quantity) || 1, unitPrice: Number(i.unit_price) || 0,
                orderId: i.order_id, at: o?.created_at || '', storeName: o?.stores?.name || null, storeSlug: o?.stores?.storeSlug || null }
        })
    return groupOwned(lines).map((g) => {
        const p = g.productId ? prods.get(g.productId) : null
        const image = p?.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null
        return { ...g, image, slug: p?.slug || null }
    })
}

export interface MyService {
    id: string; name: string; date: string; time: string; status: string; with: string | null; slug: string | null; logo: string | null
}

export async function loadMyServices(me: string): Promise<MyService[]> {
    const { data, error } = await supabase.from('appointments')
        .select('id, service_name, date, time, status, store_name, store_slug, store_logo_url, owner_slug, rental_listing_id')
        .eq('customer_id', me).in('status', ['confirmed', 'completed']).is('rental_listing_id', null)
        .order('date', { ascending: false }).order('time', { ascending: false }).limit(100)
    if (error) throw error
    return (data || []).filter((a: any) => a.service_name).map((a: any) => ({
        id: a.id, name: a.service_name, date: a.date, time: (a.time || '').slice(0, 5), status: a.status,
        with: a.store_name || (a.owner_slug ? `@${a.owner_slug}` : null), slug: a.store_slug || a.owner_slug || null,
        logo: !a.store_logo_url ? null : /^https?:\/\//.test(a.store_logo_url) ? a.store_logo_url : supabase.storage.from('store-logos').getPublicUrl(a.store_logo_url).data.publicUrl,
    }))
}
