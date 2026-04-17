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
        if (storeData.logo_url.startsWith('http')) {
            imageUrl = storeData.logo_url
        } else {
            imageUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
        }
    }

    return {
        title: storeData.name,
        description: storeData.description || 'Confira os melhores itens nesta loja no iuser.',
        openGraph: {
            title: storeData.name,
            description: storeData.description || 'Confira os melhores itens nesta loja no iuser.',
            url: `https://iuser.com.br/${profileSlug}/${storeSlug}`,
            siteName: 'iuser.com.br',
            images: imageUrl ? [{ 
                url: imageUrl,
                width: 400,
                height: 400,
                alt: storeData.name 
            }] : [],
            type: 'website',
        },
        twitter: {
            card: 'summary',
            title: storeData.name,
            description: storeData.description || 'Confira os melhores itens nesta loja no iuser.',
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
