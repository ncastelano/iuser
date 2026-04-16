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
    const profileSlug = Array.isArray(resolvedParams.profileSlug) ? resolvedParams.profileSlug[0] : resolvedParams.profileSlug

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

    let imageUrl = ''
    if (profileData.avatar_url) {
        if (profileData.avatar_url.startsWith('http')) {
            imageUrl = profileData.avatar_url
        } else {
            imageUrl = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url).data.publicUrl
        }
    }

    return {
        title: `${profileData.name} | Perfil no iUser`,
        description: `Confira o perfil de ${profileData.name} no iUser! Visite as lojas e produtos.`,
        openGraph: {
            title: `${profileData.name} | Perfil no iUser`,
            description: `Confira o perfil de ${profileData.name} no iUser! Visite as lojas e produtos.`,
            url: `https://iuser.com.br/${profileSlug}`,
            siteName: profileData.name || 'iUser',
            images: imageUrl ? [{ 
                url: imageUrl,
                width: 800,
                height: 600,
                alt: profileData.name || 'Perfil'
            }] : [],
            type: 'profile',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${profileData.name} | Perfil no iUser`,
            description: `Confira o perfil de ${profileData.name} no iUser! Visite as lojas e produtos.`,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
