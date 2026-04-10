import { ReactNode } from 'react'
import { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ storeSlug: string }>
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const resolvedParams = await params
    const storeSlug = Array.isArray(resolvedParams.storeSlug) ? resolvedParams.storeSlug[0] : resolvedParams.storeSlug

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: storeData } = await supabase
        .from('stores')
        .select('name, description, logo_url')
        .ilike('storeSlug', storeSlug)
        .maybeSingle()

    if (!storeData) {
        return {}
    }

    let imageUrl = ''
    if (storeData.logo_url) {
        imageUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
    }

    return {
        title: `${storeData.name} | iuser`,
        description: storeData.description || `Confira a loja ${storeData.name} no iuser!`,
        openGraph: {
            title: `${storeData.name} | iuser`,
            description: storeData.description || `Confira a loja ${storeData.name} no iuser!`,
            url: `https://iuser.com.br/${storeSlug}`,
            siteName: storeData.name,
            images: imageUrl ? [{ url: imageUrl }] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: `${storeData.name} | iuser`,
            description: storeData.description || `Confira a loja ${storeData.name} no iuser!`,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
