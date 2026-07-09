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

        // 2. Buscar lojas com o profileSlug do dono (duas queries para evitar dependência de FK naming)
        const { data: stores } = await supabase
            .from('stores')
            .select('storeSlug, created_at, owner_id')
            .eq('is_active', true)

        if (stores && stores.length > 0) {
            // Coletar os owner_ids únicos
            const ownerIds = [...new Set(stores.map((s) => s.owner_id).filter(Boolean))]

            // Buscar os profileSlugs dos donos
            const { data: storeOwners } = await supabase
                .from('profiles')
                .select('id, profileSlug')
                .in('id', ownerIds)

            // Criar mapa owner_id → profileSlug
            const profileSlugMap: Record<string, string> = Object.fromEntries(
                (storeOwners || [])
                    .filter((p) => p.profileSlug)
                    .map((p) => [p.id, p.profileSlug])
            )

            stores.forEach((s) => {
                const profileSlug = profileSlugMap[s.owner_id]

                // Só inclui no sitemap se tiver o profileSlug correto
                if (!profileSlug) return

                sitemaps.push({
                    url: `${baseUrl}/${profileSlug}/${s.storeSlug}`,
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
