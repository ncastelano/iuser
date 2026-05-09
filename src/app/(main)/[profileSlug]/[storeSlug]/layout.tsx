import { ReactNode } from 'react'
import { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ storeSlug: string; profileSlug: string }>
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const resolvedParams = await params
    const storeSlug = Array.isArray(resolvedParams.storeSlug) ? resolvedParams.storeSlug[0] : resolvedParams.storeSlug
    const profileSlug = Array.isArray(resolvedParams.profileSlug) ? resolvedParams.profileSlug[0] : resolvedParams.profileSlug

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    // Join with profiles to ensure we get the store for the specific profileSlug
    const { data: storeData } = await supabase
        .from('stores')
        .select('name, description, logo_url, profiles!inner(profileSlug)')
        .ilike('storeSlug', storeSlug)
        .ilike('profiles.profileSlug', profileSlug)
        .maybeSingle()

    if (!storeData) {
        return {}
    }

    const fallbackImage = 'https://iuser.com.br/logo.png'
    let imageUrl = fallbackImage

    if (storeData.logo_url) {
        if (storeData.logo_url.startsWith('http')) {
            imageUrl = storeData.logo_url
        } else {
            imageUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
        }
    }

    const title = storeData.name
    const description = storeData.description || 'Confira os melhores itens nesta loja no iuser.'
    const url = `https://iuser.com.br/${profileSlug}/${storeSlug}`

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url,
            siteName: 'iuser.com.br',
            images: [{ 
                url: imageUrl,
                width: 400,
                height: 400,
                alt: title 
            }],
            type: 'website',
        },
        twitter: {
            card: 'summary',
            title,
            description,
            images: [imageUrl],
        }
    }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
