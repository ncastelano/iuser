import { ReactNode } from 'react'
import { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ profileSlug: string }>
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const resolvedParams = await params
    const profileSlug = resolvedParams.profileSlug

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: profileData } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .ilike('profileSlug', profileSlug)
        .maybeSingle()

    if (!profileData) {
        return {}
    }

    const fallbackImage = 'https://iuser.com.br/logo.png'
    let imageUrl = fallbackImage

    if (profileData.avatar_url) {
        if (profileData.avatar_url.startsWith('http')) {
            imageUrl = profileData.avatar_url
        } else {
            imageUrl = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url).data.publicUrl
        }
    }

    const title = `${profileData.name} | Perfil no iUser`
    const description = `Confira o perfil de ${profileData.name} no iUser! Visite as lojas e produtos.`
    const url = `https://iuser.com.br/${profileSlug}`

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url,
            siteName: profileData.name || 'iUser',
            images: [{ 
                url: imageUrl,
                width: 400,
                height: 400,
                alt: profileData.name || 'Perfil'
            }],
            type: 'profile',
        },
        twitter: {
            card: 'summary',
            title,
            description,
            images: [imageUrl],
        }
    }
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
