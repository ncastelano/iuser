// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ===== ROTAS QUE DEVEM SER IGNORADAS PELO PROXY =====
const IGNORED_ROUTES = [
    '/',
    '/sacola',
    '/criar-loja',
    '/criar-loja-com-cadastro',
    '/login',
    '/registro',
    '/cadastrar',
    '/recuperar-senha',
    '/404',
    '/500',
    '/lojas-em-destaque',
    '/compromissos',
    '/compromissos/agendar',
    '/calculadora-de-corrida',
    '/convite',
    '/paginadaloja',
    '/pedidos',
    '/radar',
    '/social',
    '/comunidade',
    '/pedir-motorista',
    '/pedir-servico',
    '/procurar-servico',
]

// ===== PREFIXOS IGNORADOS =====
const IGNORED_PREFIXES = [
    '/_next',
    '/api',
]

// ===== EXTENSÕES IGNORADAS =====
const IGNORED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
    '.css', '.js', '.json', '.ico', '.txt',
]

// ===== CATEGORIAS VÁLIDAS =====
const CATEGORIAS_VALIDAS = [
    'alimentacao',
    'saude',
    'moda',
    'casa',
    'eletronicos',
    'servicos',
    'pets',
    'transporte',
    'social',
]

// ===== ROTAS DE LOJA QUE NÃO PRECISAM DE VALIDAÇÃO =====
const STORE_ROUTES = [
    '/criar-produto',
    '/editar-produto',
    '/editar-loja',
    '/produtos',
    '/pedidos',
    '/configuracoes',
    '/funcionarios',
    '/agendamentos',
    '/publicacoes',
    '/dashboard',
    '/compromissos',
    '/compromissos/agendar', // <-- ROTA ADICIONADA
]

// ===== ROTAS DE PERFIL =====
const PROFILE_ROUTES = [
    '/editar-perfil',
    '/configuracoes',
    '/pedidos',
    '/avaliacoes',
]

// ===== ROTAS PÚBLICAS ESPECIAIS (NÃO SÃO PERFIS/LOJAS) =====
const PUBLIC_ROUTES = [
    '/publicacoes',  // Rota de listagem de publicações
]

// ===== PREFIXOS DE ROTAS PÚBLICAS =====
const PUBLIC_ROUTE_PREFIXES = [
    '/publicacoes/',  // Todas as rotas que começam com /publicacoes/
    '/comunidade/',  // Todas as rotas que começam com /comunidade/
]

// ===== CACHE EM MEMÓRIA =====
const cache = new Map<string, { type: 'profile' | 'store' | 'category' | 'product'; slug: string; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 60 segundos

function getFromCache(slug: string) {
    const cached = cache.get(slug)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached
    }
    return null
}

function setCache(slug: string, type: 'profile' | 'store' | 'category' | 'product') {
    cache.set(slug, { type, slug, timestamp: Date.now() })
}

export async function proxy(request: NextRequest) {
    const url = request.nextUrl.clone()
    const pathname = url.pathname

    console.log(`[Proxy] Processando: ${pathname}`)

    // --- 1. Verificar se é uma rota ignorada exata ---
    if (IGNORED_ROUTES.includes(pathname)) {
        console.log(`[Proxy] Rota ignorada: ${pathname}`)
        return NextResponse.next()
    }

    // --- 2. Verificar se começa com prefixos ignorados ---
    if (IGNORED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        console.log(`[Proxy] Prefixo ignorado: ${pathname}`)
        return NextResponse.next()
    }

    // --- 3. Verificar se termina com extensões de arquivo ---
    if (IGNORED_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
        console.log(`[Proxy] Extensão ignorada: ${pathname}`)
        return NextResponse.next()
    }

    // --- 4. Remover trailing slash se existir ---
    const cleanPath = pathname.replace(/\/$/, '')
    const segments = cleanPath.split('/').filter(Boolean)

    if (segments.length === 0) {
        return NextResponse.next()
    }

    // --- 5. VERIFICAR ROTAS PÚBLICAS PRIMEIRO ---
    // Isso evita que /publicacoes/seja-interpretado como perfil/loja

    // Rota exata pública
    if (PUBLIC_ROUTES.includes(pathname)) {
        console.log(`[Proxy] Rota pública: ${pathname} ✅`)
        return NextResponse.next()
    }

    // Prefixo de rota pública
    if (PUBLIC_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        console.log(`[Proxy] Rota pública com prefixo: ${pathname} ✅`)
        return NextResponse.next()
    }

    // --- 6. ROTA ESPECIAL: /lojas/[categoria] ---
    if (segments[0] === 'lojas') {
        if (segments.length >= 2) {
            const categoriaSlug = segments[1]

            if (CATEGORIAS_VALIDAS.includes(categoriaSlug)) {
                console.log(`[Proxy] Categoria válida: ${categoriaSlug} ✅`)
                setCache(categoriaSlug, 'category')
                return NextResponse.next()
            }

            console.log(`[Proxy] Categoria não encontrada: ${categoriaSlug} ❌`)
            const notFoundUrl = request.nextUrl.clone()
            notFoundUrl.pathname = '/404'
            return NextResponse.rewrite(notFoundUrl)
        }

        console.log(`[Proxy] Rota /lojas permitida`)
        return NextResponse.next()
    }

    // --- 7. ROTA COM 2+ SEGMENTOS: /{ownerSlug}/{productSlug} ---
    if (segments.length >= 2) {
        const firstSegment = segments[0]
        const secondSegment = segments[1]
        const restPath = segments.length > 2 ? `/${segments.slice(2).join('/')}` : ''

        // Slugs sao globalmente unicos (profile/loja/produto nunca colidem), entao
        // qualquer tipo ja em cache resolve a rota sem tocar no banco de novo.
        const cached = getFromCache(firstSegment)
        let isProfile = cached?.type === 'profile'
        let isStore = cached?.type === 'store'

        if (!cached) {
            // Roda as duas checagens em paralelo em vez de uma depois da outra.
            const [profileResult, storeResult] = await Promise.all([
                supabaseAdmin.from('profiles').select('profileSlug').eq('profileSlug', firstSegment).maybeSingle(),
                supabaseAdmin.from('stores').select('storeSlug').eq('storeSlug', firstSegment).maybeSingle(),
            ])

            if (profileResult.error) {
                console.error(`[Proxy] Erro ao verificar perfil ${firstSegment}:`, profileResult.error)
            }
            if (storeResult.error) {
                console.error(`[Proxy] Erro ao verificar loja ${firstSegment}:`, storeResult.error)
            }

            if (profileResult.data) {
                setCache(firstSegment, 'profile')
                isProfile = true
            } else if (storeResult.data) {
                setCache(firstSegment, 'store')
                isStore = true
            }
        }

        if (isProfile) {
            console.log(`[Proxy] Perfil ${firstSegment} encontrado, permitindo rota: ${pathname} ✅`)
            return NextResponse.next()
        }

        if (isStore) {
            const fullPath = `/${segments.slice(1).join('/')}`
            // Verifica se é uma rota de loja
            if (fullPath === '' || STORE_ROUTES.some(route => fullPath === route || fullPath.startsWith(route + '/'))) {
                console.log(`[Proxy] Rota de loja direta válida: ${firstSegment}${fullPath} ✅`)
                return NextResponse.next()
            }

            // Se é uma loja, permite a rota (pode ser um produto da loja)
            console.log(`[Proxy] Loja ${firstSegment} encontrada, permitindo rota: ${pathname} ✅`)
            return NextResponse.next()
        }

        // --- VERIFICA SE É UMA ROTA DE PUBLICAÇÃO ---
        // Se o primeiro segmento é "publicacoes", permite
        if (firstSegment === 'publicacoes') {
            console.log(`[Proxy] Rota de publicação: ${pathname} ✅`)
            return NextResponse.next()
        }
    }

    // --- 8. ROTA COM 1 SEGMENTO: /{slug} ---
    if (segments.length === 1) {
        const slug = segments[0]

        let cached = getFromCache(slug)
        if (cached) {
            console.log(`[Proxy] ${slug} é um ${cached.type} (cache) ✅`)
            return NextResponse.next()
        }

        // Verifica perfil e loja em paralelo (slugs sao globalmente unicos).
        const [profileResult, storeResult] = await Promise.all([
            supabaseAdmin.from('profiles').select('profileSlug').eq('profileSlug', slug).maybeSingle(),
            supabaseAdmin.from('stores').select('storeSlug').eq('storeSlug', slug).maybeSingle(),
        ])

        if (profileResult.error) {
            console.error(`[Proxy] Erro ao verificar perfil ${slug}:`, profileResult.error)
        }
        if (storeResult.error) {
            console.error(`[Proxy] Erro ao verificar loja ${slug}:`, storeResult.error)
        }

        if (profileResult.data) {
            setCache(slug, 'profile')
            console.log(`[Proxy] ${slug} é um perfil ✅`)
            return NextResponse.next()
        }

        if (storeResult.data) {
            setCache(slug, 'store')
            console.log(`[Proxy] ${slug} é uma loja ✅`)
            return NextResponse.next()
        }

        // Verifica se é uma categoria
        if (CATEGORIAS_VALIDAS.includes(slug)) {
            console.log(`[Proxy] ${slug} é uma categoria ✅`)
            return NextResponse.next()
        }

        // Verifica se é "publicacoes"
        if (slug === 'publicacoes') {
            console.log(`[Proxy] ${slug} é rota de publicações ✅`)
            return NextResponse.next()
        }

        console.log(`[Proxy] ${slug} não encontrado ❌`)
    }

    // --- 9. Modo desenvolvimento ---
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Proxy] Modo desenvolvimento: permitindo ${pathname}`)
        return NextResponse.next()
    }

    // --- 10. Se não encontrou, redireciona para 404 ---
    console.log(`[Proxy] Redirecionando para 404: ${pathname}`)
    const notFoundUrl = request.nextUrl.clone()
    notFoundUrl.pathname = '/404'
    return NextResponse.rewrite(notFoundUrl)
}

export default proxy