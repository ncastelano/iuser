import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { categorias } from './categorias'

const BASE_URL = 'https://www.iuser.com.br'
// Toda prévia de link usa uma miniatura QUADRADA PEQUENA (200x200). O WhatsApp,
// Telegram e iMessage só mostram a imagem do lado esquerdo do texto quando o
// og:image tem menos de 300px de largura; a partir disso viram um banner
// grande em cima. Por isso o tamanho é 200 (e não 300).
const THUMB_SIZE = 200
const DEFAULT_THUMB_URL = `${'https://www.iuser.com.br'}/logo-preview-thumb.png`
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


// Categoria da loja pode estar salva como slug ("saude") ou como nome ("Serviços").
function categoryName(raw: string | null | undefined): string | null {
    if (!raw) return null
    const found = categorias.find((c) => c.slug === raw || c.nome === raw)
    return found ? found.nome : raw
}

// "Rua X, Bairro, Porto Velho - Rondônia, 76808-054, Brazil" → "Porto Velho - RO"
function cityFromAddress(address: string | null | undefined): string | null {
    if (!address) return null
    const m = address.match(/,\s*([^,]+?)\s-\s([^,]+?)(?:,|$)/)
    return m ? `${m[1].trim()} - ${m[2].trim()}` : null
}

// Uma linha de destaque + a descrição: "⭐ 4,8 (23) · Saúde · Porto Velho - Rondônia · Faz entrega".
function joinParts(parts: (string | null | false | undefined)[]): string {
    return parts.filter(Boolean).join(' · ')
}

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return null
    return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Passa a imagem por /api/og-thumb pra garantir um quadrado pequeno (200x200)
// — avatar_url/logo_url vêm do Storage em qualquer tamanho, e a maioria dos
// apps (WhatsApp, Telegram, iMessage) só mostra a miniatura do lado do texto
// quando a imagem é pequena; do contrário preferem esticar em cima, como banner.
function toThumbUrl(imageUrl: string): string {
    return `${BASE_URL}/api/og-thumb?src=${encodeURIComponent(imageUrl)}`
}

/**
 * Generates OpenGraph and Twitter metadata for an owner page (Store or Profile).
 * Route: /[ownerSlug]
 */
export async function generateOwnerMetadata(ownerSlug: string): Promise<Metadata> {
    const defaultLogoUrl = DEFAULT_THUMB_URL
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
            .select('name, profileSlug, avatar_url, bio, description, address, ratings_avg, ratings_count, is_seller')
            .eq('profileSlug', ownerSlug)
            .maybeSingle()

        if (profile) {
            const displayName = profile.name ? profile.name : `@${profile.profileSlug}`
            const title = `${displayName} (@${profile.profileSlug}) | iUser`
            const rating = Number(profile.ratings_avg) > 0 && Number(profile.ratings_count) > 0
                ? `⭐ ${Number(profile.ratings_avg).toFixed(1).replace('.', ',')} (${profile.ratings_count})`
                : null
            const highlight = joinParts([rating, cityFromAddress(profile.address)])
            const about = (profile.bio || profile.description || '').trim()
            const description = [highlight, about || `Confira o perfil de ${displayName} no iUser: compre, venda, dirija e preste serviços.`].filter(Boolean).join(' — ')
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
                            width: THUMB_SIZE,
                            height: THUMB_SIZE,
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
            .select('name, storeSlug, logo_url, description, category, address, ratings_avg, ratings_count, accepts_delivery, accepts_pickup')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()

        if (store) {
            const displayName = store.name ? store.name : store.storeSlug
            const cat = categoryName(store.category)
            const title = `${displayName}${cat ? ` · ${cat}` : ''} | iUser`
            const rating = Number(store.ratings_avg) > 0 && Number(store.ratings_count) > 0
                ? `⭐ ${Number(store.ratings_avg).toFixed(1).replace('.', ',')} (${store.ratings_count})`
                : null
            const highlight = joinParts([
                rating,
                cityFromAddress(store.address),
                store.accepts_delivery && 'Faz entrega',
                !store.accepts_delivery && store.accepts_pickup && 'Retirada no local',
            ])
            const about = (store.description || '').replace(/\s+/g, ' ').trim()
            const description = [highlight, about || `Confira a loja ${displayName} no iUser! Os melhores produtos e serviços.`].filter(Boolean).join(' — ')
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
                            width: THUMB_SIZE,
                            height: THUMB_SIZE,
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
    const defaultLogoUrl = DEFAULT_THUMB_URL
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
                            width: THUMB_SIZE,
                            height: THUMB_SIZE,
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

            const rawImageUrl = getPublicStorageUrl('product-images', product.image_url) || ownerImage
            const imageUrl = rawImageUrl ? toThumbUrl(rawImageUrl) : defaultLogoUrl
            const dimensions = { width: THUMB_SIZE, height: THUMB_SIZE }

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
                    card: 'summary',
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
 * Mesma resolução loja-vs-perfil de generateProductOrPublicationMetadata: o
 * dono da publicação pode ser uma loja (store_id) ou uma pessoa (owner_id),
 * e o preview do link deve mostrar o nome e a imagem de quem publicou, com
 * fallback pra logo/avatar do dono quando a publicação não tem imagem própria.
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
            .select('*, store:store_id(name, logo_url), owner:owner_id(name, avatar_url)')
            .eq('slug', slug)
            .eq('listing_type', 'publication')
            .maybeSingle()

        if (publication) {
            let ownerName: string | null = null
            let ownerImage: string | null = null

            const store = (publication as any).store
            const owner = (publication as any).owner

            if (store) {
                if (store.name) ownerName = store.name
                if (store.logo_url) ownerImage = getPublicStorageUrl('store-logos', store.logo_url)
            } else if (owner) {
                if (owner.name) ownerName = owner.name
                if (owner.avatar_url) ownerImage = getPublicStorageUrl('avatars', owner.avatar_url)
            }

            const title = `${publication.name || 'Publicação'} | ${ownerName || 'iUser'}`
            const description = publication.description || 'Confira esta publicação no iUser!'
            const rawImageUrl = getPublicStorageUrl('product-images', publication.image_url) || ownerImage
            const imageUrl = rawImageUrl ? toThumbUrl(rawImageUrl) : defaultLogoUrl
            const dimensions = { width: THUMB_SIZE, height: THUMB_SIZE }

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
                    card: 'summary',
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

/**
 * Generates OpenGraph and Twitter metadata for /convite?ref={profileSlug}
 * Mesma ideia do perfil: foto de quem convidou (não a logo genérica) do lado
 * do texto quando o link é colado no WhatsApp/Telegram/iMessage — é a foto
 * que faz o convite parecer pessoal antes mesmo de abrir o link.
 */
export async function generateInviteMetadata(ref: string | undefined): Promise<Metadata> {
    const defaultLogoUrl = DEFAULT_THUMB_URL
    const pageUrl = ref ? `${BASE_URL}/convite?ref=${encodeURIComponent(ref)}` : `${BASE_URL}/convite`

    const fallback: Metadata = {
        title: 'Convite para o iUser',
        description: 'Compre, venda, preste serviço ou dirija — tudo numa plataforma só.',
        openGraph: {
            title: 'Convite para o iUser',
            description: 'Compre, venda, preste serviço ou dirija — tudo numa plataforma só.',
            url: pageUrl,
            siteName: 'iUser',
            images: [{ url: defaultLogoUrl, width: 1254, height: 1254, alt: 'iUser' }],
            type: 'website',
        },
    }

    const supabase = getSupabaseClient()
    if (!supabase || !ref) return fallback

    try {
        const { data: inviter } = await supabase
            .from('profiles')
            .select('name, profileSlug, avatar_url')
            .eq('profileSlug', ref)
            .maybeSingle()

        if (!inviter) return fallback

        const displayName = inviter.name || `@${inviter.profileSlug}`
        const title = `${displayName} te chamou pro iUser`
        const description = `Entre pelo convite de @${inviter.profileSlug}: compre, venda, dirija ou preste serviço no iUser. Taxa 0% no plano ou só R$ 0,50 por transação.`
        const rawAvatarUrl = getPublicStorageUrl('avatars', inviter.avatar_url)
        const avatarUrl = rawAvatarUrl ? toThumbUrl(rawAvatarUrl) : defaultLogoUrl

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
                        url: avatarUrl,
                        width: THUMB_SIZE,
                        height: THUMB_SIZE,
                        alt: displayName,
                        type: 'image/png',
                    },
                ],
                type: 'profile',
            },
            twitter: {
                card: 'summary',
                title,
                description,
                images: [avatarUrl],
            },
        }
    } catch (err) {
        console.error('[generateInviteMetadata] Erro ao buscar metadados:', err)
    }

    return fallback
}
