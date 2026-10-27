// Itens compartilháveis nas conversas e nas comunidades (loja, serviço, produto, publicação e perfil) e como virar cartão.
// Só dado PÚBLICO: vem de `get_share_cards` (RPC security definer que devolve os mesmos campos que qualquer visitante vê).
// Uma mensagem cita no máximo um item: `ref_store_id`, `ref_profile_id` ou `ref_product_id` (produto, serviço e publicação são `products`).
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { getRequestTitle, getServiceLabel } from '@/lib/serviceTypes'
import { shortAddress } from '@/lib/serviceBoard'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'

// 'request' (pedido de serviço do Procurar serviço) só chega por LINK colado/compartilhado; não está no seletor nem tem coluna de referência.
export type ShareKind = 'store' | 'service' | 'product' | 'publication' | 'profile' | 'request'

export interface ShareCard {
    kind: ShareKind
    id: string
    title: string
    subtitle: string | null
    detail: string | null
    imageUrl: string | null
    href: string
    rating: number | null
    ratingsCount: number
    open?: boolean | null
}

export const SHARE_KINDS: { kind: ShareKind; label: string }[] = [
    { kind: 'store', label: 'Loja' },
    { kind: 'service', label: 'Serviço' },
    { kind: 'product', label: 'Produto' },
    { kind: 'publication', label: 'Publicação' },
    { kind: 'profile', label: 'Perfil' },
]

/** Texto que acompanha o cartão quando a pessoa não escreve nada (e que o balão esconde, porque o cartão já diz). */
export const SHARE_DEFAULT_TEXT: Record<ShareKind, string> = {
    store: 'Compartilhou uma loja',
    service: 'Compartilhou um serviço',
    product: 'Compartilhou um produto',
    publication: 'Compartilhou uma publicação',
    profile: 'Compartilhou um perfil',
    request: 'Compartilhou um pedido de serviço',
}
const DEFAULT_TEXTS = new Set(Object.values(SHARE_DEFAULT_TEXT))
export const isDefaultShareText = (t: string) => DEFAULT_TEXTS.has((t || '').trim())

/** Colunas de referência a gravar na mensagem para esse cartão. */
export function refColumns(card: ShareCard): { ref_product_id?: string; ref_store_id?: string; ref_profile_id?: string } {
    if (card.kind === 'store') return { ref_store_id: card.id }
    if (card.kind === 'profile') return { ref_profile_id: card.id }
    return { ref_product_id: card.id }
}

export interface MessageRefs { ref_product_id?: string | null; ref_store_id?: string | null; ref_profile_id?: string | null }
export const cardKeyOf = (m: MessageRefs): string | null =>
    m.ref_store_id ? `store:${m.ref_store_id}` : m.ref_profile_id ? `profile:${m.ref_profile_id}` : m.ref_product_id ? `product:${m.ref_product_id}` : null

const money = (n: number | null | undefined) => (n == null ? null : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const productImg = (p?: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('product-images').getPublicUrl(p).data.publicUrl) : null)
const logoImg = (p?: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('store-logos').getPublicUrl(p).data.publicUrl) : null)

function fromRpc(json: any): ShareCard[] {
    const out: ShareCard[] = []
    for (const p of json?.products || []) {
        const kind: ShareKind = p.listing_type === 'publication' ? 'publication' : p.type === 'service' ? 'service' : 'product'
        out.push({
            kind, id: p.id, title: p.name, subtitle: p.owner_name || null,
            detail: kind === 'publication' ? (p.description || null) : kind === 'service' && !(Number(p.price) > 0) ? 'Valor a combinar' : money(p.price),
            imageUrl: productImg(p.image_url), href: p.owner_slug ? `/${p.owner_slug}/${p.slug || p.id}` : '#',
            rating: p.ratings_avg != null ? Number(p.ratings_avg) : null, ratingsCount: p.ratings_count || 0,
        })
    }
    for (const s of json?.stores || []) {
        out.push({
            kind: 'store', id: s.id, title: s.name, subtitle: [s.category, (s.address || '').split(',')[0]?.trim()].filter(Boolean).join(' · ') || null,
            detail: null, imageUrl: logoImg(s.logo_url), href: `/${s.slug}`,
            rating: s.ratings_avg != null ? Number(s.ratings_avg) : null, ratingsCount: s.ratings_count || 0,
            open: s.business_hours ? isStoreOpenNow(s.business_hours as BusinessHours) : null,
        })
    }
    for (const p of json?.profiles || []) {
        out.push({
            kind: 'profile', id: p.id, title: p.slug ? `@${p.slug}` : p.name, subtitle: p.name && p.slug ? p.name : null,
            detail: p.bio || null, imageUrl: getAvatarUrl(supabase, p.avatar_url) || null, href: `/${p.slug}`,
            rating: p.ratings_avg != null ? Number(p.ratings_avg) : null, ratingsCount: p.ratings_count || 0,
        })
    }
    return out
}

/** Cartão de um pedido de serviço (link /procurar-servico?pedido=<id>): só o que a vitrine pública já mostra (rua/bairro, sem número). */
export async function fetchRequestCard(id: string): Promise<ShareCard | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    const { data: r } = await supabase.from('service_requests')
        .select('id, requester_id, service_type, custom_service, description, location_address, photo_urls, status').eq('id', id).maybeSingle()
    if (!r) return null
    const { data: p } = await supabase.from('profiles').select('name, profileSlug').eq('id', r.requester_id).maybeSingle()
    const place = shortAddress(r.location_address || '').replace(/[,\s]+\d+\s*\w*$/, '')
    const status = r.status === 'pending' ? null : r.status === 'accepted' ? 'Contratado' : r.status === 'completed' ? 'Concluído' : null
    return {
        kind: 'request', id: r.id, title: getRequestTitle(r.description, r.service_type, r.custom_service, 120),
        subtitle: [getServiceLabel(r.service_type, r.custom_service), place, status].filter(Boolean).join(' · '),
        detail: p ? (p.profileSlug ? `@${p.profileSlug}` : p.name) : null,
        imageUrl: (r.photo_urls as string[] | null)?.[0] || null, href: `/procurar-servico?ver=${r.id}`, rating: null, ratingsCount: 0,
    }
}

export const cardKey = (c: ShareCard) => `${c.kind === 'store' ? 'store' : c.kind === 'profile' ? 'profile' : 'product'}:${c.id}`

/** Busca os cartões de uma lista de mensagens (uma chamada só). */
export async function fetchShareCards(msgs: MessageRefs[]): Promise<Record<string, ShareCard>> {
    const products = [...new Set(msgs.map((m) => m.ref_product_id).filter(Boolean) as string[])]
    const stores = [...new Set(msgs.map((m) => m.ref_store_id).filter(Boolean) as string[])]
    const profiles = [...new Set(msgs.map((m) => m.ref_profile_id).filter(Boolean) as string[])]
    if (products.length + stores.length + profiles.length === 0) return {}
    const { data } = await supabase.rpc('get_share_cards', { p_products: products, p_stores: stores, p_profiles: profiles })
    return Object.fromEntries(fromRpc(data).map((c) => [cardKey(c), c]))
}

/** Busca do seletor de compartilhar (o que é seu vem primeiro). */
export async function searchShareTargets(kind: ShareKind, q: string): Promise<ShareCard[]> {
    const { data: ids } = await supabase.rpc('search_share_targets', { p_kind: kind, p_q: q, p_limit: 20 })
    const list = (ids as string[] | null) || []
    if (list.length === 0) return []
    const { data } = await supabase.rpc('get_share_cards', {
        p_products: kind === 'service' || kind === 'product' || kind === 'publication' ? list : [],
        p_stores: kind === 'store' ? list : [], p_profiles: kind === 'profile' ? list : [],
    })
    const byId = new Map(fromRpc(data).map((c) => [c.id, c]))
    return list.map((id) => byId.get(id)).filter(Boolean) as ShareCard[]
}
