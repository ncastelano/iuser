// app/(main)/[profileSlug]/[storeSlug]/[slug]/layout.tsx
import { ReactNode } from 'react'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase/client'

type Props = {
    params: Promise<{ profileSlug: string; storeSlug: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const rawParams = await params
    const slug = rawParams.slug || ''
    const profileSlug = rawParams.profileSlug || ''
    const storeSlug = rawParams.storeSlug || ''

    // Identifica se o slug é um UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

    let productQuery = supabase
        .from('products')
        .select('name, description, image_url, price')

    if (isUuid) {
        productQuery = productQuery.eq('id', slug)
    } else {
        productQuery = productQuery.eq('slug', slug)
    }

    const { data: productData, error } = await productQuery.maybeSingle()

    if (!productData || error) {
        return {
            title: 'Produto | iUser',
            description: 'Veja este produto no iUser',
        }
    }

    // Monta a URL da imagem
    let imageUrl = 'https://iuser.com.br/logo.png' // fallback

    if (productData.image_url) {
        if (productData.image_url.startsWith('http')) {
            imageUrl = productData.image_url
        } else {
            // Obtém a URL pública do storage
            const { data } = supabase.storage
                .from('product-images')
                .getPublicUrl(productData.image_url)
            imageUrl = data.publicUrl
        }
    }

    const titleStr = productData.name
    const priceStr = `R$ ${(productData.price || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
    })}`
    const description = productData.description || priceStr
    const url = `https://iuser.com.br/${profileSlug}/${storeSlug}/${slug}`

    return {
        metadataBase: new URL('https://iuser.com.br'),
        title: titleStr,
        description,
        openGraph: {
            title: titleStr,
            description,
            url,
            siteName: 'iuser.com.br',
            images: [{ url: imageUrl, width: 400, height: 400 }],
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: titleStr,
            description,
            images: [imageUrl],
        },
    }
}

export default function ProductLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}