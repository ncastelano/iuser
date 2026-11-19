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

// ===== Pedidos favoritos e "Repetir pedido" (migration 20261130000090) =====
export interface FavoriteOrder { orderId: string; storeName: string; storeSlug: string | null; logo: string | null; items: string; total: number; at: string }

export async function loadFavoriteOrderIds(): Promise<Set<string>> {
    const { data } = await supabase.from('order_favorites').select('order_id')
    return new Set((data || []).map((r: any) => r.order_id))
}

export async function setOrderFavorite(orderId: string, on: boolean): Promise<void> {
    const q = on ? supabase.from('order_favorites').insert({ order_id: orderId }) : supabase.from('order_favorites').delete().eq('order_id', orderId)
    const { error } = await q
    if (error && !(on && error.code === '23505')) throw error
    window.dispatchEvent(new Event('iuser-order-favorites'))
}

export async function loadFavoriteOrders(): Promise<FavoriteOrder[]> {
    const { data: favs } = await supabase.from('order_favorites').select('order_id, created_at').order('created_at', { ascending: false }).limit(30)
    if (!favs?.length) return []
    const { data: orders } = await supabase.from('orders').select('id, created_at, total_amount, stores(name, storeSlug, logo_url), order_items(product_name, quantity)').in('id', favs.map((f: any) => f.order_id))
    const byId = new Map((orders || []).map((o: any) => [o.id, o]))
    return favs.map((f: any) => byId.get(f.order_id)).filter(Boolean).map((o: any) => ({
        orderId: o.id, storeName: o.stores?.name || 'Loja', storeSlug: o.stores?.storeSlug || null,
        logo: !o.stores?.logo_url ? null : /^https?:\/\//.test(o.stores.logo_url) ? o.stores.logo_url : supabase.storage.from('store-logos').getPublicUrl(o.stores.logo_url).data.publicUrl,
        items: (o.order_items || []).map((i: any) => `${i.quantity}× ${i.product_name}`).join(', '),
        total: Number(o.total_amount) || 0, at: o.created_at,
    }))
}

/** Põe de novo no carrinho os itens de um pedido (preço de HOJE; item que saiu do ar fica de fora). Devolve a loja e quantos entraram. */
export async function repeatOrder(orderId: string): Promise<{ storeSlug: string | null; added: number; skipped: number }> {
    const { useCartStore } = await import('@/store/useCartStore')
    const { data: o, error } = await supabase.from('orders').select('id, stores(name, storeSlug, logo_url), order_items(product_id, quantity)').eq('id', orderId).single()
    if (error || !o) throw error || new Error('Pedido não encontrado')
    const store: any = (o as any).stores
    const lines = ((o as any).order_items || []).filter((i: any) => i.product_id)
    const ids = [...new Set(lines.map((i: any) => i.product_id))]
    const { data: prods } = ids.length ? await supabase.from('products').select('id, name, price, image_url, slug, type, description, category, is_active').in('id', ids) : { data: [] as any[] }
    const map = new Map((prods || []).map((p: any) => [p.id, p]))
    let added = 0, skipped = 0
    const add = useCartStore.getState().addItem
    for (const l of lines) {
        const p: any = map.get(l.product_id)
        if (!p || !p.is_active || p.type === 'digital' || p.type === 'service' || !store?.storeSlug) { skipped++; continue }
        const n = Math.max(1, Math.min(50, Number(l.quantity) || 1))
        for (let k = 0; k < n; k++) add(store.storeSlug, { name: store.name, logo_url: store.logo_url ?? null }, { id: p.id, name: p.name, price: Number(p.price) || 0, image_url: p.image_url, type: p.type, slug: p.slug, description: p.description, category: p.category })
        added += n
    }
    return { storeSlug: store?.storeSlug || null, added, skipped }
}
