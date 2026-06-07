// app/(main)/[profileSlug]/layout.tsx
import { ReactNode } from 'react'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase/client'

type Props = {
    params: Promise<{ profileSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { profileSlug } = await params

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
            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(profileData.avatar_url)
            imageUrl = data.publicUrl
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
            images: [
                {
                    url: imageUrl,
                    width: 400,
                    height: 400,
                    alt: profileData.name || 'Perfil',
                },
            ],
            type: 'profile',
        },
        twitter: {
            card: 'summary',
            title,
            description,
            images: [imageUrl],
        },
    }
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}