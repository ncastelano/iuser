//app/(main)/[profileSlug]/[storeSlug]/[productSlug]/layout.tsx

import { ReactNode } from 'react'
import { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ profileSlug: string; storeSlug: string; productSlug: string }>
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const { profileSlug, storeSlug, productSlug } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    // Identificar se o slug é um ID válido (UUID) para evitar erros no banco
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productSlug)

    let productQuery = supabase
        .from('products')
        .select('name, description, image_url, price')

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
    // O preço formatado como descrição
    const priceStr = `R$ ${(productData.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    const descStr = priceStr
    // O link final pode ser o link da loja como solicitado pelo usuário
    const url = `https://iuser.com.br/${profileSlug}/${storeSlug}`

    return {
        metadataBase: new URL('https://iuser.com.br'),
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
            card: 'summary_large_image',
            title: titleStr,
            description: descStr,
            images: [imageUrl],
        }
    }
}

export default function ProductLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}