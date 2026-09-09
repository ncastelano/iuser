import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const BASE_URL = 'https://www.iuser.com.br'
const DEFAULT_LOGO_DIMENSIONS = { width: 1254, height: 1254 }
// Chute razoável só usado se a imagem real falhar ao baixar/ler — evita
// deixar a tag sem width/height (é isso que fazia o WhatsApp/Facebook
// recusar a mostrar a imagem nas publicações, mesmo com og:image presente).
const FALLBACK_IMAGE_DIMENSIONS = { width: 1200, height: 630 }
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function getPublicStorageUrl(bucket: string, path: string | null | undefined): string | null {
    if (!path) return null
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path
    }
    let cleanPath = path
    if (bucket === 'avatars') {
        if (cleanPath.startsWith('avatars/')) {
            cleanPath = cleanPath.replace('avatars/', '')
        }
    }
    if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.substring(1)
    }
    if (!SUPABASE_URL) return null
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanPath}`
}

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return null
    return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Passa a imagem por /api/og-thumb pra garantir um quadrado pequeno (300x300)
// — avatar_url/logo_url vêm do Storage em qualquer tamanho, e a maioria dos
// apps (WhatsApp, Telegram, iMessage) só mostra a miniatura do lado do texto
// quando a imagem é pequena; do contrário preferem esticar em cima, como banner.
function toThumbUrl(imageUrl: string): string {
    return `${BASE_URL}/api/og-thumb?src=${encodeURIComponent(imageUrl)}`
}

// Lê as dimensões reais da imagem — produtos/publicações têm foto de
// qualquer tamanho/proporção (ao contrário do avatar/logo, que sempre vira
// um quadrado pequeno via toThumbUrl). Sem width/height no og:image, vários
// apps (WhatsApp, Facebook) simplesmente não mostram nenhuma imagem.
async function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const buffer = Buffer.from(await res.arrayBuffer())
        const meta = await sharp(buffer).metadata()
        if (!meta.width || !meta.height) return null
        return { width: meta.width, height: meta.height }
    } catch {
        return null
    }
}

/**
 * Generates OpenGraph and Twitter metadata for an owner page (Store or Profile).
 * Route: /[ownerSlug]
 */
export async function generateOwnerMetadata(ownerSlug: string): Promise<Metadata> {
    const defaultLogoUrl = `${BASE_URL}/logo-preview.png`
    const pageUrl = `${BASE_URL}/${ownerSlug}`

    const supabase = getSupabaseClient()
    if (!supabase || !ownerSlug) {
        return {
            title: 'iUser | Mostre o que você tem de melhor!',
            description: 'Tudo o que você precisa está aqui!',
        }
    }

    try {
        // 1. Tenta buscar como Perfil
        const { data: profile } = await supabase
            .from('profiles')
            .select('name, profileSlug, avatar_url, bio')
            .eq('profileSlug', ownerSlug)
            .maybeSingle()

        if (profile) {
            const displayName = profile.name ? profile.name : `@${profile.profileSlug}`
            const title = `${displayName} (@${profile.profileSlug}) | iUser`
            const description = profile.bio || `Confira o perfil de ${displayName} no iUser!`
            const rawAvatarUrl = getPublicStorageUrl('avatars', profile.avatar_url)
            const avatarUrl = rawAvatarUrl ? toThumbUrl(rawAvatarUrl) : defaultLogoUrl

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title: `${displayName} (@${profile.profileSlug})`,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [
                        {
                            url: avatarUrl,
                            width: 300,
                            height: 300,
                            alt: displayName,
                            type: 'image/png',
                        },
                    ],
                    type: 'profile',
                },
                twitter: {
                    card: 'summary',
                    title: `${displayName} (@${profile.profileSlug})`,
                    description,
                    images: [avatarUrl],
                },
            }
        }

        // 2. Tenta buscar como Loja
        const { data: store } = await supabase
            .from('stores')
            .select('name, storeSlug, logo_url, description')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()

        if (store) {
            const displayName = store.name ? store.name : store.storeSlug
            const title = `${displayName} (@${store.storeSlug}) | iUser`
            const description = store.description || `Confira a loja ${displayName} no iUser! Os melhores produtos e serviços.`
            const rawLogoUrl = getPublicStorageUrl('store-logos', store.logo_url)
            const logoUrl = rawLogoUrl ? toThumbUrl(rawLogoUrl) : defaultLogoUrl

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title: `${displayName} (@${store.storeSlug})`,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [
                        {
                            url: logoUrl,
                            width: 300,
                            height: 300,
                            alt: displayName,
                            type: 'image/png',
                        },
                    ],
                    type: 'website',
                },
                twitter: {
                    card: 'summary',
                    title: `${displayName} (@${store.storeSlug})`,
                    description,
                    images: [logoUrl],
                },
            }
        }
    } catch (err) {
        console.error('[generateOwnerMetadata] Erro ao buscar metadados:', err)
    }

    return {
        title: 'Perfil ou Loja não encontrado | iUser',
        description: 'O perfil ou loja procurado não existe no iUser.',
    }
}

/**
 * Generates OpenGraph and Twitter metadata for a store's catalog page.
 * Route: /[ownerSlug]/catalogo
 * Mesma ideia do perfil/loja: logo pequena e quadrada, card "summary" — o
 * catálogo é uma lista de produtos, não uma publicação, então a logo da loja
 * aparece do lado do texto em vez de em cima.
 */
export async function generateCatalogMetadata(ownerSlug: string): Promise<Metadata> {
    const defaultLogoUrl = `${BASE_URL}/logo-preview.png`
    const pageUrl = `${BASE_URL}/${ownerSlug}/catalogo`

    const supabase = getSupabaseClient()
    if (!supabase || !ownerSlug) {
        return {
            title: 'Catálogo | iUser',
            description: 'Confira o catálogo no iUser!',
        }
    }

    try {
        const { data: store } = await supabase
            .from('stores')
            .select('name, storeSlug, logo_url, description')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()

        if (store) {
            const displayName = store.name ? store.name : store.storeSlug
            const title = `Catálogo de ${displayName} | iUser`
            const description = store.description || `Confira o catálogo de ${displayName} no iUser!`
            const rawLogoUrl = getPublicStorageUrl('store-logos', store.logo_url)
            const logoUrl = rawLogoUrl ? toThumbUrl(rawLogoUrl) : defaultLogoUrl

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title: `Catálogo de ${displayName}`,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [
                        {
                            url: logoUrl,
                            width: 300,
                            height: 300,
                            alt: displayName,
                            type: 'image/png',
                        },
                    ],
                    type: 'website',
                },
                twitter: {
                    card: 'summary',
                    title: `Catálogo de ${displayName}`,
                    description,
                    images: [logoUrl],
                },
            }
        }
    } catch (err) {
        console.error('[generateCatalogMetadata] Erro ao buscar metadados:', err)
    }

    return {
        title: 'Catálogo não encontrado | iUser',
        description: 'A loja procurada não existe no iUser.',
    }
}

/**
 * Generates OpenGraph and Twitter metadata for a product or publication under /[ownerSlug]/[slug]
 */
export async function generateProductOrPublicationMetadata(
    ownerSlug: string,
    slug: string
): Promise<Metadata> {
    const defaultLogoUrl = `${BASE_URL}/logo.png`
    const pageUrl = `${BASE_URL}/${ownerSlug}/${slug}`

    const supabase = getSupabaseClient()
    if (!supabase || !slug) {
        return {
            title: 'Produto | iUser',
            description: 'Confira no iUser!',
        }
    }

    try {
        // Busca o produto/publicacao ja com a loja ou o perfil dono embutidos,
        // numa unica query em vez de uma segunda consulta sequencial.
        const { data: product } = await supabase
            .from('products')
            .select('*, store:store_id(name, logo_url), owner:owner_id(name, avatar_url)')
            .eq('slug', slug)
            .maybeSingle()

        if (product) {
            let ownerName = ownerSlug
            let ownerImage: string | null = null

            const store = (product as any).store
            const owner = (product as any).owner

            if (store) {
                if (store.name) ownerName = store.name
                if (store.logo_url) ownerImage = getPublicStorageUrl('store-logos', store.logo_url)
            } else if (owner) {
                if (owner.name) ownerName = owner.name
                if (owner.avatar_url) ownerImage = getPublicStorageUrl('avatars', owner.avatar_url)
            }

            const isSale = product.listing_type === 'sale'
            const formattedPrice = product.price != null ? ` - R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : ''
            const title = `${product.name}${formattedPrice} | ${ownerName}`
            const description = product.description || `Confira ${product.name} no iUser!`

            const imageUrl = getPublicStorageUrl('product-images', product.image_url) || ownerImage || defaultLogoUrl
            const dimensions = imageUrl === defaultLogoUrl
                ? DEFAULT_LOGO_DIMENSIONS
                : (await getImageDimensions(imageUrl)) || FALLBACK_IMAGE_DIMENSIONS

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [
                        {
                            url: imageUrl,
                            width: dimensions.width,
                            height: dimensions.height,
                            alt: product.name,
                        },
                    ],
                    type: isSale ? 'website' : 'article',
                },
                twitter: {
                    card: 'summary_large_image',
                    title,
                    description,
                    images: [imageUrl],
                },
            }
        }
    } catch (err) {
        console.error('[generateProductOrPublicationMetadata] Erro ao buscar metadados:', err)
    }

    return {
        title: 'Produto ou Publicação | iUser',
        description: 'Confira no iUser!',
    }
}

/**
 * Generates OpenGraph and Twitter metadata for /publicacoes/[slug]
 */
export async function generatePublicationMetadata(slug: string): Promise<Metadata> {
    const defaultLogoUrl = `${BASE_URL}/logo.png`
    const pageUrl = `${BASE_URL}/publicacoes/${slug}`

    const supabase = getSupabaseClient()
    if (!supabase || !slug) {
        return {
            title: 'Publicação | iUser',
            description: 'Confira no iUser!',
        }
    }

    try {
        const { data: publication } = await supabase
            .from('products')
            .select('*')
            .eq('slug', slug)
            .eq('listing_type', 'publication')
            .maybeSingle()

        if (publication) {
            const title = `${publication.name || 'Publicação'} | iUser`
            const description = publication.description || 'Confira esta publicação no iUser!'
            const imageUrl = getPublicStorageUrl('product-images', publication.image_url) || defaultLogoUrl
            const dimensions = imageUrl === defaultLogoUrl
                ? DEFAULT_LOGO_DIMENSIONS
                : (await getImageDimensions(imageUrl)) || FALLBACK_IMAGE_DIMENSIONS

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [{
                        url: imageUrl,
                        width: dimensions.width,
                        height: dimensions.height,
                        alt: publication.name || 'Publicação',
                    }],
                    type: 'article',
                },
                twitter: {
                    card: 'summary_large_image',
                    title,
                    description,
                    images: [imageUrl],
                },
            }
        }
    } catch (err) {
        console.error('[generatePublicationMetadata] Erro:', err)
    }

    return {
        title: 'Publicação não encontrada | iUser',
        description: 'Esta publicação não está disponível.',
    }
}
