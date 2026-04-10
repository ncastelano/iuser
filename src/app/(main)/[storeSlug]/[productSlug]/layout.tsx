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

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    // Buscar loja
    const { data: storeData } = await supabase
        .from('stores')
        .select('id, name')
        .ilike('storeSlug', storeSlug)
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

    let imageUrl = ''
    if (productData.image_url) {
        if (productData.image_url.startsWith('http')) {
            imageUrl = productData.image_url
        } else {
            imageUrl = supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
        }
    }

    const formattedPrice = productData.price != null 
        ? `R$ ${productData.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
        : ''

    const titleStr = formattedPrice ? `${productData.name} - ${formattedPrice}` : productData.name
    const descStr = `Loja: ${storeData.name}`

    return {
        title: titleStr,
        description: descStr,
        openGraph: {
            title: titleStr,
            description: descStr,
            url: `https://iuser.com.br/${storeSlug}/${productSlug}`,
            siteName: storeData.name,
            images: imageUrl ? [{ url: imageUrl }] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: titleStr,
            description: descStr,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function ProductLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
