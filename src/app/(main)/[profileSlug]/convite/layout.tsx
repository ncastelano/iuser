import { ReactNode } from 'react'
import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type Props = {
    params: Promise<{ profileSlug: string }>
}

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const resolvedParams = await params
    const profileSlug = Array.isArray(resolvedParams.profileSlug) ? resolvedParams.profileSlug[0] : resolvedParams.profileSlug

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('profileSlug', profileSlug)
        .maybeSingle()

    if (!profile) return { title: 'iUser - Convite' }

    let imageUrl = ''
    if (profile.avatar_url) {
        if (profile.avatar_url.startsWith('http')) {
            imageUrl = profile.avatar_url
        } else {
            imageUrl = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
        }
    }

    const titleStr = `Convite de ${profile.name} - iUser`
    const descStr = `Junte-se ao marketplace iUser e faça parte da rede de ${profile.name}.`

    return {
        title: titleStr,
        description: descStr,
        openGraph: {
            title: titleStr,
            description: descStr,
            images: imageUrl ? [{ url: imageUrl }] : [],
            type: 'profile'
        },
        twitter: {
            card: 'summary_large_image',
            title: titleStr,
            description: descStr,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default function ConviteLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
