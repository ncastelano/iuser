import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://www.iuser.com.br'
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

/**
 * Generates OpenGraph and Twitter metadata for an owner page (Store or Profile).
 * Route: /[ownerSlug]
 */
export async function generateOwnerMetadata(ownerSlug: string): Promise<Metadata> {
    const defaultLogoUrl = `${BASE_URL}/logo.png`
    const pageUrl = `${BASE_URL}/${ownerSlug}`

    const supabase = getSupabaseClient()
    if (!supabase || !ownerSlug) {
        return {
            title: 'iUser | Mostre o que você tem de melhor!',
            description: 'Os melhores produtos e serviços, você encontra aqui!',
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
            const avatarUrl = getPublicStorageUrl('avatars', profile.avatar_url) || defaultLogoUrl

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
                            alt: displayName,
                        },
                    ],
                    type: 'profile',
                },
                twitter: {
                    card: 'summary_large_image',
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
            const logoUrl = getPublicStorageUrl('store-logos', store.logo_url) || defaultLogoUrl

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
                            alt: displayName,
                        },
                    ],
                    type: 'website',
                },
                twitter: {
                    card: 'summary_large_image',
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
        // Buscar o produto/publicação
        const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('slug', slug)
            .maybeSingle()

        if (product) {
            let ownerName = ownerSlug
            let ownerImage: string | null = null

            // Tenta buscar informações do dono (Perfil ou Loja) para complementar
            if (product.store_id) {
                const { data: store } = await supabase
                    .from('stores')
                    .select('name, logo_url')
                    .eq('id', product.store_id)
                    .maybeSingle()
                if (store) {
                    if (store.name) ownerName = store.name
                    if (store.logo_url) ownerImage = getPublicStorageUrl('store-logos', store.logo_url)
                }
            } else if (product.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name, avatar_url')
                    .eq('id', product.owner_id)
                    .maybeSingle()
                if (profile) {
                    if (profile.name) ownerName = profile.name
                    if (profile.avatar_url) ownerImage = getPublicStorageUrl('avatars', profile.avatar_url)
                }
            }

            const isSale = product.listing_type === 'sale'
            const formattedPrice = product.price != null ? ` - R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : ''
            const title = `${product.name}${formattedPrice} | ${ownerName}`
            const description = product.description || `Confira ${product.name} no iUser!`

            const imageUrl = getPublicStorageUrl('product-images', product.image_url) || ownerImage || defaultLogoUrl

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

            return {
                title,
                description,
                alternates: { canonical: pageUrl },
                openGraph: {
                    title,
                    description,
                    url: pageUrl,
                    siteName: 'iUser',
                    images: [{ url: imageUrl, alt: publication.name || 'Publicação' }],
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
