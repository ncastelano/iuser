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

    // Buscar produto
    const { data: productData } = await supabase
        .from('products')
        .select('name, description, image_url')
        .eq('store_id', storeData.id)
        .eq('slug', productSlug)
        .maybeSingle()

    if (!productData) {
        return {}
    }

    let imageUrl = ''
    if (productData.image_url) {
        imageUrl = supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
    }

    return {
        title: `${productData.name} - ${storeData.name} | iuser`,
        description: productData.description || `Confira ${productData.name} na loja ${storeData.name} no iuser!`,
        openGraph: {
            title: `${productData.name} - ${storeData.name} | iuser`,
            description: productData.description || `Confira ${productData.name} na loja ${storeData.name} no iuser!`,
            url: `https://iuser.com.br/${storeSlug}/${productSlug}`,
            siteName: 'iuser',
            images: imageUrl ? [
                {
                    url: imageUrl,
                    width: 800,
                    height: 600,
                }
            ] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: `${productData.name} - ${storeData.name} | iuser`,
            description: productData.description || `Confira ${productData.name} na loja ${storeData.name} no iuser!`,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function ProductLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
