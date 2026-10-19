// Proxy de imagens: GET /img/<bucket>/<arquivo> -> Storage público do Supabase, entregue com Cache-Control que faz a CDN da
// Vercel guardar a cópia (s-maxage). Só a primeira visualização de cada arquivo vai ao Supabase; as outras saem da Vercel e não
// contam no Cached Egress do plano gratuito. (O rewrite externo não serve: o Storage só aceita max-age, e a Vercel só guarda em
// cache com s-maxage.) Nomes de arquivo levam timestamp (não se sobrescreve o mesmo caminho), então cache longo é seguro.
//
// SEGURANÇA: este endereço fica NO DOMÍNIO DO SITE, então só passa imagem de verdade. Nunca HTML, SVG ou outro tipo que o navegador
// execute (um arquivo malicioso num bucket público viraria XSS no domínio do iUser). Bucket só da lista; tipo só da lista.
export const runtime = 'edge'

const BUCKETS = new Set([
    'avatars', 'backgrounds', 'community-photos', 'driver-car-photos', 'driver-selfie-photos', 'mural-images', 'posts',
    'product-images', 'ride-object-photos', 'service-request-photos', 'store-links', 'store-logos',
])
const IMAGE_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
}
const ALLOWED_TYPES = new Set(Object.values(IMAGE_TYPES))
const OK_CACHE = 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800'
const MISS_CACHE = 'public, max-age=60, s-maxage=60'

function reply(status: number, headers: Record<string, string> = {}, body: BodyInit | null = null) {
    return new Response(body, {
        status,
        headers: { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", ...headers },
    })
}

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
    const { path } = await ctx.params
    const segments = (path || []).filter(Boolean)
    if (segments.length < 2 || !BUCKETS.has(segments[0]) || segments.some((s) => s === '..' || s === '.')) return reply(404, { 'Cache-Control': MISS_CACHE })

    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
    if (!base) return reply(500)
    let upstream: Response
    try {
        upstream = await fetch(`${base}/storage/v1/object/public/${segments.map(encodeURIComponent).join('/')}`)
    } catch {
        return reply(502, { 'Cache-Control': 'no-store' })
    }
    if (!upstream.ok) return reply(upstream.status === 404 || upstream.status === 400 ? 404 : 502, { 'Cache-Control': upstream.status >= 500 ? 'no-store' : MISS_CACHE })

    const ext = (segments[segments.length - 1].split('.').pop() || '').toLowerCase()
    let type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(type)) type = type === 'application/octet-stream' || type === '' ? IMAGE_TYPES[ext] || '' : ''
    if (!type) return reply(415, { 'Cache-Control': MISS_CACHE })

    return reply(200, { 'Content-Type': type, 'Cache-Control': OK_CACHE }, upstream.body)
}
