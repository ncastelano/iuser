import { MetadataRoute } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Quantas linhas o PostgREST devolve por consulta (o padrão é 1.000): o sitemap lê em páginas para não cortar nada
const PAGE = 1000
// Limite do próprio sitemap do Google (um arquivo tem até 50.000 endereços): acima disso seria preciso um índice de sitemaps
const MAX_URLS = 49000

/** Lê TODAS as linhas de uma consulta paginada (ordem estável por `id`). */
async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
        const { data } = await make(from, from + PAGE - 1)
        const rows = data || []
        out.push(...rows)
        if (rows.length < PAGE || out.length >= MAX_URLS) break
    }
    return out.slice(0, MAX_URLS)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://www.iuser.com.br'

    const sitemaps: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1.0,
        },
    ]

    // Sem essas envs (ex: build de preview sem a service role key) o sitemap
    // sai só com a home, em vez de derrubar a build inteira - /sitemap.xml é
    // gerado estaticamente, então um erro aqui quebra todo o `next build`.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Sitemap: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes, gerando sitemap parcial.')
        return sitemaps
    }
    const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    try {
        // 1. Perfis públicos (função do banco: conta bloqueada já sai de lá)
        const profiles = await allRows<{ id: string; profile_slug: string; created_at: string | null }>(
            (from, to) => supabase.rpc('seo_public_profiles').range(from, to) as unknown as PromiseLike<{ data: any[] | null }>,
        )
        const slugById = new Map<string, string>()
        profiles.forEach((p) => {
            slugById.set(p.id, p.profile_slug)
            sitemaps.push({
                url: `${baseUrl}/${p.profile_slug}`,
                lastModified: p.created_at ? new Date(p.created_at) : new Date(),
                changeFrequency: 'weekly',
                priority: 0.8,
            })
        })

        // 2. Lojas públicas e ativas (a página da loja vive em /{storeSlug})
        const stores = await allRows<{ id: string; storeSlug: string; created_at: string | null }>(
            (from, to) => supabase.from('stores').select('id, storeSlug, created_at')
                .eq('is_active', true)
                // loja privada não entra no Google (só quem é cliente vê)
                .or('is_private.is.null,is_private.eq.false')
                .order('id').range(from, to) as unknown as PromiseLike<{ data: any[] | null }>,
        )
        const storeSlugById = new Map<string, string>()
        stores.forEach((s) => {
            if (!s.storeSlug) return
            storeSlugById.set(s.id, s.storeSlug)
            sitemaps.push({
                url: `${baseUrl}/${s.storeSlug}`,
                lastModified: s.created_at ? new Date(s.created_at) : new Date(),
                changeFrequency: 'weekly',
                priority: 0.9,
            })
        })

        // 3. Produtos, serviços e publicações (rota /{loja ou perfil}/{item}). Fora: digitais (conteúdo pago), itens inativos
        // (inclui o que a moderação ocultou), lojas privadas/inativas e publicações de perfil bloqueado.
        const items = await allRows<{ id: string; slug: string; created_at: string | null; store_id: string | null; owner_id: string | null; listing_type: string | null }>(
            (from, to) => supabase.from('products').select('id, slug, created_at, store_id, owner_id, listing_type')
                .eq('is_active', true)
                .neq('type', 'digital')
                .order('id').range(from, to) as unknown as PromiseLike<{ data: any[] | null }>,
        )
        items.forEach((p) => {
            if (!p.slug) return
            let ownerSlug: string | undefined
            if (p.store_id) {
                ownerSlug = storeSlugById.get(p.store_id)   // só lojas públicas e ativas estão nesse mapa
            } else {
                ownerSlug = p.owner_id ? slugById.get(p.owner_id) : undefined   // só perfis públicos
                // serviço de perfil sem publicação: a página dele é de contratação, fica fora desta lista por enquanto
                if (p.listing_type !== 'publication') ownerSlug = undefined
            }
            if (!ownerSlug) return
            sitemaps.push({
                url: `${baseUrl}/${ownerSlug}/${p.slug}`,
                lastModified: p.created_at ? new Date(p.created_at) : new Date(),
                changeFrequency: 'weekly',
                priority: p.listing_type === 'publication' ? 0.6 : 0.7,
            })
        })
    } catch (error) {
        console.error('Erro ao gerar sitemap:', error)
    }

    return sitemaps
}
