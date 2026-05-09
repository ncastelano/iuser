import { ReactNode } from 'react'
import { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ storeSlug: string; productSlug: string }>
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const resolvedParams = await params
    const storeSlug = Array.isArray(resolvedParams.storeSlug) ? resolvedParams.storeSlug[0] : resolvedParams.storeSlug
    const productSlug = Array.isArray(resolvedParams.productSlug) ? resolvedParams.productSlug[0] : resolvedParams.productSlug
    const profileSlug = (resolvedParams as any).profileSlug

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    // Buscar loja vinculada ao perfil correto
    const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, profiles!inner(profileSlug)')
        .ilike('storeSlug', storeSlug)
        .ilike('profiles.profileSlug', profileSlug)
        .maybeSingle()

    if (!storeData) {
        return {}
    }

    // Identificar se o slug é um ID válido (UUID) para evitar erros no banco
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productSlug)

    let productQuery = supabase
        .from('products')
        .select('name, description, image_url, price')
        .eq('store_id', storeData.id)

    if (isUuid) {
        productQuery = productQuery.eq('id', productSlug)
    } else {
        productQuery = productQuery.eq('slug', productSlug)
    }

    const { data: productData, error } = await productQuery.maybeSingle()

    if (!productData || error) {
        return {}
    }

    const fallbackImage = 'https://iuser.com.br/logo.png'
    let imageUrl = fallbackImage

    if (productData.image_url) {
        if (productData.image_url.startsWith('http')) {
            imageUrl = productData.image_url
        } else {
            imageUrl = supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
        }
    }

    const titleStr = productData.name
    const descStr = `Confira ${productData.name} na loja ${storeData.name} no iUser.`
    const url = `https://iuser.com.br/${profileSlug}/${storeSlug}/${productSlug}`

    return {
        title: titleStr,
        description: descStr,
        openGraph: {
            title: titleStr,
            description: descStr,
            url,
            siteName: 'iuser.com.br',
            images: [{ url: imageUrl, width: 400, height: 400 }],
            type: 'article',
        },
        twitter: {
            card: 'summary',
            title: titleStr,
            description: descStr,
            images: [imageUrl],
        }
    }
}

export default function ProductLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}