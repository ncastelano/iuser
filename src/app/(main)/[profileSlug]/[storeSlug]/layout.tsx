//app/(main)/[profileSlug]/[storeSlug]/layout.tsx

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
    const { profileSlug, storeSlug } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    // Buscar loja vinculada ao perfil correto (de forma robusta)
    const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, description, logo_url, profiles!inner(profileSlug, avatar_url)')
        .ilike('storeSlug', storeSlug)
        .eq('profiles.profileSlug', profileSlug)
        .maybeSingle()

    if (!storeData) {
        return {}
    }

    const fallbackImage = 'https://iuser.com.br/logo.png'
    let imageUrl = fallbackImage

    // Access profile data safely
    const profile = Array.isArray(storeData.profiles) ? storeData.profiles[0] : storeData.profiles

    // Priorizar logo da loja, depois avatar do perfil
    if (storeData.logo_url) {
        if (storeData.logo_url.startsWith('http')) {
            imageUrl = storeData.logo_url
        } else {
            imageUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
        }
    } else if (profile?.avatar_url) {
        if (profile.avatar_url.startsWith('http')) {
            imageUrl = profile.avatar_url
        } else {
            imageUrl = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
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
            type: 'article', // Mudado para 'article' para coincidir com o layout do produto que funciona
        },
        twitter: {
            card: 'summary_large_image', // Isso garante imagem em cima, links embaixo
            title: titleStr,
            description: descStr,
            images: [imageUrl],
        }
    }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}