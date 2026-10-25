// src/lib/serviceCards.ts
//
// Os serviços do iUser, os das lojas (serviços do catálogo) e os divulgados por pessoas, já com quem oferece, nota, visitas e
// se a loja está aberta / a pessoa online. Das mais vistas para as menos. Usado por /servicos-disponiveis e pela vitrine
// "Serviços que você pode gostar" da home 3.0 (as duas mostram a mesma coisa).
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'

export interface ServiceCard {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    price: number | null
    minutes: number | null
    views: number
    rating: number
    seller: string
    sellerImage: string | null
    sellerId: string | null
    kind: 'Loja' | 'Pessoa'
    href: string
    /** Serviço de loja: a loja está aberta agora (null = serviço de pessoa) */
    storeOpen: boolean | null
    /** Serviço de pessoa: está online agora (null = serviço de loja) */
    ownerOnline: boolean | null
}

const publicImage = (bucket: string, path: string | null | undefined) => {
    if (!path) return null
    return path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

export async function loadServiceCards(): Promise<ServiceCard[]> {
    const { data: rows } = await supabase
        .from('products')
        .select('id, name, slug, description, image_url, price, duration_minutes, view_count, owner_id, store_id, owner_image_url')
        .eq('is_active', true)
        .or('listing_type.eq.service_offer,and(type.eq.service,listing_type.eq.sale)')
        .order('view_count', { ascending: false })
        .limit(500)
    const list = (rows || []) as any[]
    if (list.length === 0) return []

    const storeIds = [...new Set(list.filter((r) => r.store_id).map((r) => r.store_id))]
    const ownerIds = [...new Set(list.filter((r) => !r.store_id && r.owner_id).map((r) => r.owner_id))]
    const [{ data: stores }, { data: profiles }, { data: reviews }] = await Promise.all([
        storeIds.length ? supabase.from('stores').select('id, name, "storeSlug", logo_url, owner_id, business_hours').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
        ownerIds.length ? supabase.from('profiles').select('id, name, "profileSlug", avatar_url').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('product_reviews').select('product_id, rating').in('product_id', list.map((r) => r.id)),
    ])
    const storeById = new Map((stores || []).map((s: any) => [s.id, s]))
    const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))
    const sums = new Map<string, { sum: number; n: number }>()
    ;(reviews || []).forEach((r: any) => {
        const cur = sums.get(r.product_id) || { sum: 0, n: 0 }
        cur.sum += r.rating; cur.n += 1
        sums.set(r.product_id, cur)
    })

    // Pessoa que presta o serviço está online agora? (quem não mostra a presença aparece como offline)
    const online = new Map<string, boolean>()
    if (ownerIds.length) {
        const { data: seen } = await supabase.rpc('get_last_seen_for', { p_ids: ownerIds })
        ;((seen as { profile_id: string; online: boolean }[]) || []).forEach((r) => online.set(r.profile_id, !!r.online))
    }

    const cards: ServiceCard[] = []
    for (const r of list) {
        const store: any = r.store_id ? storeById.get(r.store_id) : null
        const profile: any = !r.store_id ? profileById.get(r.owner_id) : null
        const slug = store ? store.storeSlug : profile?.profileSlug
        if (!slug || !r.slug) continue
        const rt = sums.get(r.id)
        cards.push({
            id: r.id,
            name: r.name,
            description: r.description,
            imageUrl: publicImage('product-images', r.image_url),
            price: r.price != null ? Number(r.price) : null,
            minutes: r.duration_minutes ?? null,
            views: r.view_count ?? 0,
            rating: rt ? Number((rt.sum / rt.n).toFixed(1)) : 0,
            seller: store ? store.name : `@${slug}`,
            sellerImage: r.owner_image_url || (store ? publicImage('store-logos', store.logo_url) : getAvatarUrl(supabase, profile?.avatar_url) || null),
            sellerId: store ? store.owner_id : r.owner_id,
            kind: store ? 'Loja' : 'Pessoa',
            href: `/${slug}/${r.slug}`,
            storeOpen: store ? isStoreOpenNow(store.business_hours as BusinessHours | null) : null,
            ownerOnline: store ? null : (online.get(r.owner_id) ?? false),
        })
    }
    return cards
}

