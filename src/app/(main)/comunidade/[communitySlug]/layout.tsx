import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { pageMetadata } from '@/lib/pageMetadata'

type Props = { params: Promise<{ communitySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { communitySlug } = await params
    const path = `/comunidade/${communitySlug}`
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (url && key) {
            const { data } = await createClient(url, key).from('communities').select('name, city, description').eq('slug', communitySlug).maybeSingle()
            if (data) {
                const about = (data.description || '').replace(/\s+/g, ' ').trim()
                return pageMetadata({
                    title: `${data.name}${data.city ? ` · ${data.city}` : ''}`,
                    description: about || `Entre na comunidade ${data.name} no iUser e converse com as pessoas da sua cidade.`,
                    path,
                    kind: 'comunidade',
                })
            }
        }
    } catch {
        // cai no padrão
    }
    return pageMetadata({ title: 'Comunidade', description: 'Entre nessa comunidade no iUser e converse com as pessoas da sua cidade.', path, kind: 'comunidade' })
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
