// src/modules/service-requests/published.ts
//
// Profissionais e lojas que já oferecem serviço na plataforma (a vitrine "perto de você" da tela do pedido):
// serviços publicados por pessoas (products.listing_type='service_offer') e serviços vendidos por lojas
// (products.type='service'). Perfis que não querem aparecer no mapa ficam de fora.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProfilesHiddenFromMap } from '@/lib/mapPrivacy'
import { getAvatarUrl } from '@/lib/avatar'

export interface PublishedService {
    id: string
    kind: 'profile' | 'store'
    name: string
    imageUrl: string | null
    serviceType: string | null
    ownerName: string | null
    avatarUrl: string | undefined
    targetSlug: string | null
    viewCount: number
}

export async function loadPublishedServices(client: SupabaseClient): Promise<PublishedService[]> {
    const [{ data: profileRows }, { data: storeRows }] = await Promise.all([
        client.from('products').select('id, name, image_url, service_type, owner_id, view_count').eq('listing_type', 'service_offer').order('view_count', { ascending: false }).limit(60),
        client.from('products').select('id, name, image_url, store_id, view_count').eq('type', 'service').eq('listing_type', 'sale').order('view_count', { ascending: false }).limit(60),
    ])

    const hidden = await getProfilesHiddenFromMap((profileRows || []).map((r: any) => r.owner_id))
    const visible = (profileRows || []).filter((r: any) => !hidden.has(r.owner_id))
    const ownerIds = Array.from(new Set(visible.map((r: any) => r.owner_id).filter(Boolean)))
    const storeIds = Array.from(new Set((storeRows || []).map((r: any) => r.store_id).filter(Boolean)))

    const [profiles, stores] = await Promise.all([
        ownerIds.length ? client.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
        storeIds.length ? client.from('stores').select('id, name, storeSlug, logo_url').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const profileById = new Map((profiles.data || []).map((p: any) => [p.id, p]))
    const storeById = new Map((stores.data || []).map((s: any) => [s.id, s]))
    const productImage = (path: string | null) => (path ? client.storage.from('product-images').getPublicUrl(path).data.publicUrl : null)

    const fromProfiles: PublishedService[] = visible.map((r: any) => {
        const p: any = profileById.get(r.owner_id)
        return {
            id: r.id, kind: 'profile', name: r.name, imageUrl: productImage(r.image_url), serviceType: r.service_type,
            ownerName: p?.name || null, avatarUrl: getAvatarUrl(client, p?.avatar_url), targetSlug: p?.profileSlug || null, viewCount: r.view_count || 0,
        }
    })
    const fromStores: PublishedService[] = (storeRows || [])
        .filter((r: any) => r.store_id && storeById.has(r.store_id))
        .map((r: any) => {
            const s: any = storeById.get(r.store_id)
            return {
                id: r.id, kind: 'store', name: r.name, imageUrl: productImage(r.image_url), serviceType: null,
                ownerName: s.name, avatarUrl: s.logo_url ? client.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : undefined,
                targetSlug: s.storeSlug, viewCount: r.view_count || 0,
            }
        })

    return [...fromProfiles, ...fromStores].sort((a, b) => b.viewCount - a.viewCount)
}
