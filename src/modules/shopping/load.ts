// src/modules/shopping/load.ts
//
// Carrega o que a página de compras mostra: lojas (com entrega, tempo e nota), os produtos delas e o que a pessoa já
// pediu. Só leitura.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchStoreCards, type StoreCardData } from '@/lib/storeCards'
import { getAvatarUrl } from '@/lib/avatar'
import { distinctRecent, type ShopProduct, type ShopService } from './domain'

export interface ShopData {
    stores: StoreCardData[]
    products: ShopProduct[]
    /** produtos que a pessoa já pediu, do mais recente pro mais antigo */
    reorder: ShopProduct[]
    /** serviços das lojas (agendar) e das pessoas (combinar) */
    services: ShopService[]
}

export async function loadShop(client: SupabaseClient, userId: string | null, me: { lat: number; lng: number } | null): Promise<ShopData> {
    const stores = await fetchStoreCards({ me })
    const byId = new Map(stores.map((s) => [s.id, s]))
    const services = await loadServices(client, stores)
    if (stores.length === 0) return { stores, products: [], reorder: [], services }

    const { data: rows } = await client
        .from('products')
        .select('id, name, slug, image_url, price, category, created_at, view_count, has_addons, stock_quantity, store_id')
        .in('store_id', stores.map((s) => s.id))
        .eq('listing_type', 'sale')
        .neq('type', 'service') // serviços têm a própria página; aqui é o que se compra (físico, digital...)
        .order('view_count', { ascending: false })
        .limit(600)

    const products: ShopProduct[] = ((rows as any[]) || []).flatMap((r) => {
        const s = byId.get(r.store_id)
        if (!s) return []
        return [{
            id: r.id,
            name: r.name,
            slug: r.slug,
            imageUrl: r.image_url ? client.storage.from('product-images').getPublicUrl(r.image_url).data.publicUrl : null,
            price: r.price != null ? Number(r.price) : null,
            category: r.category || null,
            createdAt: r.created_at,
            viewCount: Number(r.view_count) || 0,
            hasAddons: !!r.has_addons,
            stock: r.stock_quantity != null ? Number(r.stock_quantity) : null,
            storeId: s.id,
            storeSlug: s.slug,
            storeName: s.name,
            storeLogo: s.logo,
            storeOpen: s.open,
            storeCategorySlug: s.categorySlug,
            storeRating: s.rating,
            delivery: s.delivery || null,
            time: s.time || null,
            storeOrders: s.orders,
        } satisfies ShopProduct]
    })

    // "Pedir de novo": os itens dos últimos pedidos que ainda existem
    let reorder: ShopProduct[] = []
    if (userId) {
        const { data: orders } = await client
            .from('orders')
            .select('created_at, order_items(product_id)')
            .eq('buyer_id', userId)
            .order('created_at', { ascending: false })
            .limit(15)
        const ids = distinctRecent(((orders as any[]) || []).flatMap((o) => (o.order_items || []).map((i: any) => i.product_id)))
        const byProduct = new Map(products.map((p) => [p.id, p]))
        reorder = ids.map((id) => byProduct.get(id)).filter((p): p is ShopProduct => !!p)
    }

    return { stores, products, reorder, services }
}

/** Serviços para contratar: os das lojas (type 'service' + venda, com preço) e os das pessoas (`service_offer`, valor combinado). */
async function loadServices(client: SupabaseClient, stores: StoreCardData[]): Promise<ShopService[]> {
    const byId = new Map(stores.map((s) => [s.id, s]))
    const img = (p: string | null) => (p ? client.storage.from('product-images').getPublicUrl(p).data.publicUrl : null)
    const cols = 'id, name, slug, image_url, price, category, created_at, view_count, store_id, owner_id'
    const active = 'is_active.is.null,is_active.eq.true'

    const [{ data: storeRows }, { data: personRows }] = await Promise.all([
        stores.length === 0 ? Promise.resolve({ data: [] as any[] }) : client.from('products').select(cols)
            .in('store_id', stores.map((s) => s.id)).eq('listing_type', 'sale').eq('type', 'service').or(active)
            .order('view_count', { ascending: false }).limit(300),
        client.from('products').select(cols).eq('listing_type', 'service_offer').is('store_id', null).or(active)
            .order('view_count', { ascending: false }).limit(150),
    ])

    const out: ShopService[] = []
    for (const r of (storeRows as any[]) || []) {
        const s = byId.get(r.store_id)
        if (!s) continue
        out.push({
            id: r.id, kind: 'store', name: r.name, slug: r.slug, imageUrl: img(r.image_url), price: r.price != null ? Number(r.price) : null, category: r.category || null,
            createdAt: r.created_at, viewCount: Number(r.view_count) || 0, ownerSlug: s.slug, ownerName: s.name, ownerImage: s.logo,
            storeOpen: s.open, storeCategorySlug: s.categorySlug, storeRating: s.rating,
        })
    }

    const people = (personRows as any[]) || []
    const ownerIds = [...new Set(people.map((r) => r.owner_id).filter(Boolean))] as string[]
    const owners = new Map<string, { name: string | null; slug: string | null; avatar: string | null }>()
    if (ownerIds.length > 0) {
        const { data: profs } = await client.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ownerIds)
        for (const p of (profs as any[]) || []) owners.set(p.id, { name: p.name, slug: p.profileSlug, avatar: p.avatar_url })
    }
    for (const r of people) {
        const o = owners.get(r.owner_id)
        if (!o?.slug) continue
        out.push({
            id: r.id, kind: 'person', name: r.name, slug: r.slug, imageUrl: img(r.image_url), price: null, category: r.category || null,
            createdAt: r.created_at, viewCount: Number(r.view_count) || 0, ownerSlug: o.slug, ownerName: o.name || `@${o.slug}`,
            ownerImage: o.avatar ? getAvatarUrl(client, o.avatar) || null : null, storeOpen: true, storeCategorySlug: null, storeRating: null,
        })
    }
    return out
}
