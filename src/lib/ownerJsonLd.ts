// src/lib/ownerJsonLd.ts — dados estruturados (schema.org) da LOJA e do PERFIL, para o Google entender a página
// (aparecer na busca com o nome, a categoria e a nota). SÓ campos públicos: nada de endereço completo, telefone, Pix ou e-mail.
// Lojas privadas, inativas ou bloqueadas NÃO geram o bloco.
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://www.iuser.com.br'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
// servidor: a chave de serviço deixa conferir privacidade/bloqueio (colunas que o público não lê); só os campos públicos saem no JSON
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function publicImage(bucket: string, path: string | null | undefined): string | null {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    if (!SUPABASE_URL) return null
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}`
}

function clip(text: string | null | undefined, max = 300): string | undefined {
    const t = (text || '').replace(/\s+/g, ' ').trim()
    return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : undefined
}

/** O bloco de dados estruturados da página /[ownerSlug] (loja ou perfil), ou null se não houver nada público para mostrar. */
export async function buildOwnerJsonLd(ownerSlug: string): Promise<Record<string, unknown> | null> {
    if (!SUPABASE_URL || !SUPABASE_KEY || !ownerSlug) return null
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const url = `${BASE_URL}/${ownerSlug}`

    // 1) loja pública ativa
    const { data: store } = await supabase
        .from('stores')
        .select('name, storeSlug, description, logo_url, category, ratings_avg, ratings_count, is_active, is_private')
        .eq('storeSlug', ownerSlug)
        .maybeSingle()
    if (store && store.is_active && !store.is_private) {
        const json: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'Store',
            name: store.name,
            url,
            description: clip(store.description),
            image: publicImage('store-logos', store.logo_url),
            additionalType: store.category || undefined,
        }
        const count = Number(store.ratings_count) || 0
        if (count > 0 && store.ratings_avg != null) {
            json.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(store.ratings_avg), reviewCount: count, bestRating: 5, worstRating: 1 }
        }
        return json
    }

    // 2) perfil público (pessoa)
    const { data: profile } = await supabase
        .from('profiles')
        .select('name, profileSlug, avatar_url, is_active, is_blocked')
        .eq('profileSlug', ownerSlug)
        .maybeSingle()
    if (profile && profile.is_active !== false && !profile.is_blocked) {
        return {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: profile.name || `@${profile.profileSlug}`,
            alternateName: `@${profile.profileSlug}`,
            url,
            image: publicImage('avatars', profile.avatar_url),
        }
    }
    return null
}

/**
 * Dados estruturados de um PRODUTO ou SERVIÇO de loja (rota /<loja>/<produto>), para o Google mostrar nome, foto e preço.
 * Só produto de loja pública e ativa; publicação, digital e item de perfil (sem loja) NÃO geram o bloco.
 * Serviço sem valor ("a combinar") não declara preço, nunca "R$ 0".
 */
export async function buildProductJsonLd(storeSlug: string, productSlug: string): Promise<Record<string, unknown> | null> {
    if (!SUPABASE_URL || !SUPABASE_KEY || !storeSlug || !productSlug) return null
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: store } = await supabase
        .from('stores')
        .select('id, name, storeSlug, is_active, is_private')
        .eq('storeSlug', storeSlug)
        .maybeSingle()
    if (!store || !store.is_active || store.is_private) return null

    const { data: product } = await supabase
        .from('products')
        .select('name, description, price, image_url, slug, type, listing_type, is_active, stock_quantity')
        .eq('store_id', store.id)
        .eq('slug', productSlug)
        .maybeSingle()
    if (!product || !product.is_active) return null
    // publicação não é vitrine de produto; digital fica fora desta etapa (conteúdo pago)
    if (product.listing_type === 'publication' || product.type === 'digital') return null

    const isService = product.type === 'service'
    const url = `${BASE_URL}/${store.storeSlug}/${product.slug}`
    const json: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': isService ? 'Service' : 'Product',
        name: product.name,
        url,
        description: clip(product.description),
        image: publicImage('product-images', product.image_url),
        brand: isService ? undefined : { '@type': 'Brand', name: store.name },
        provider: isService ? { '@type': 'Organization', name: store.name, url: `${BASE_URL}/${store.storeSlug}` } : undefined,
    }
    const price = Number(product.price)
    if (price > 0) {
        const offer: Record<string, unknown> = {
            '@type': 'Offer',
            url,
            priceCurrency: 'BRL',
            price: price.toFixed(2),
            seller: { '@type': 'Organization', name: store.name },
        }
        if (!isService) offer.availability = product.stock_quantity == null || Number(product.stock_quantity) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
        json.offers = offer
    }
    return json
}
