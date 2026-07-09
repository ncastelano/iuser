import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const baseUrl = 'https://www.iuser.com.br'

    const sitemaps: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1.0,
        },
    ]

    try {
        // 1. Buscar perfis
        const { data: profiles } = await supabase
            .from('profiles')
            .select('profileSlug, created_at')
            .not('profileSlug', 'is', null)

        if (profiles) {
            profiles.forEach((p) => {
                sitemaps.push({
                    url: `${baseUrl}/${p.profileSlug}`,
                    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
                    changeFrequency: 'weekly',
                    priority: 0.8,
                })
            })
        }

        // 2. Buscar lojas
        const { data: stores } = await supabase
            .from('stores')
            .select('storeSlug, created_at')
            .eq('is_active', true)

        if (stores) {
            stores.forEach((s) => {
                sitemaps.push({
                    url: `${baseUrl}/${s.storeSlug}`,
                    lastModified: s.created_at ? new Date(s.created_at) : new Date(),
                    changeFrequency: 'weekly',
                    priority: 0.9,
                })
            })
        }
    } catch (error) {
        console.error('Erro ao gerar sitemap:', error)
    }

    return sitemaps
}
