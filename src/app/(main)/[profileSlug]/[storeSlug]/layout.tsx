// app/(main)/[profileSlug]/[storeSlug]/layout.tsx
import { ReactNode } from 'react'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase/client'

type Props = {
    params: Promise<{ storeSlug: string; profileSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { profileSlug, storeSlug } = await params

    // Buscar a loja diretamente pelo storeSlug de forma case-insensitive
    const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, description, logo_url')
        .ilike('storeSlug', storeSlug)
        .maybeSingle()

    if (!storeData) {
        return {}
    }

    const fallbackImage = 'https://iuser.com.br/logo.png'
    let imageUrl = fallbackImage

    // Priorizar logo da loja
    if (storeData.logo_url) {
        if (storeData.logo_url.startsWith('http')) {
            imageUrl = storeData.logo_url
        } else {
            const { data } = supabase.storage
                .from('store-logos')
                .getPublicUrl(storeData.logo_url)
            imageUrl = data.publicUrl
        }
    }

    const titleStr = storeData.name
    const descStr = storeData.description || `Confira os melhores itens na loja ${storeData.name} no iUser.`
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
        },
    }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}