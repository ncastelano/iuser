// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { VERSION_COOKIE } from '@/versions/registry'
import { canonicalFromInternal, internalPathFor, versionOfInternalPath } from '@/versions/resolve'
import { resolveRequestVersion } from '@/versions/access'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ===== ROTAS QUE DEVEM SER IGNORADAS PELO PROXY =====
const IGNORED_ROUTES = [
    '/',
    '/carrinho',
    '/conversas',
    '/produtos',
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
    '/solicitar-servico',
    '/procurar-servico',
    '/aceitar-corridas',
    '/painel-motorista',
    '/painel-prestador',
    '/minhas-corridas',
    '/planos',
    '/planos/pos-pago',
    '/planos/pre-pago',
    '/meus-servicos',
    '/administrador',
    '/aceitar-corridas/mapa',
    '/pedir-motorista/escolher-local',
    '/modelodehomepage',
    '/modeloinicial',
    '/modoprestador',
    '/painel-perfil',
]

// ===== PREFIXOS IGNORADOS =====
const IGNORED_PREFIXES = [
    '/_next',
    '/api',
    '/s/', // encurtador de links (iuser.com.br/s/<code>) — não é slug de perfil/loja
    '/entregador/', // link do entregador (iuser.com.br/entregador/<token>) — não é slug de perfil/loja
    '/acompanhar-corrida/', // link de acompanhar corrida (iuser.com.br/acompanhar-corrida/<id>) — não é slug de perfil/loja
    '/compromissos/', // agenda de um perfil/loja (iuser.com.br/compromissos/<slug>) — o 1º segmento não é slug de perfil/loja
    '/compromisso/', // link de um agendamento compartilhado (iuser.com.br/compromisso/<id>)
    '/painel-loja/', // painel de uma loja (iuser.com.br/painel-loja/<storeSlug>) — o 1º segmento não é slug de perfil/loja
    '/veiculo/', // página de um veículo (rota interna; o endereço público é iuser.com.br/<vehicleSlug>)
    '/v3/', // implementações internas da interface 3.0 (iuser.com.br/carrinho é servido por /v3/carrinho) — não é slug
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

// ===== VERSÃO DA INTERFACE (2.0 / 3.0) =====
/**
 * Resolve a versão e, quando preciso, reescreve (ou devolve ao endereço canônico). Retorna null quando não há nada a
 * fazer. Centralizado aqui: nenhuma página decide versão por conta própria.
 */
async function resolveUiVersion(request: NextRequest, pathname: string): Promise<NextResponse | null> {
    const internalVersion = versionOfInternalPath(pathname)
    const isShared = internalPathFor('v3', pathname) !== null
    if (!internalVersion && !isShared) return null

    // A 3.0 só é servida a quem o admin liberou (ou ao admin): sem permissão, a versão é sempre a 2.0
    const version = await resolveRequestVersion(request.cookies.getAll(), request.cookies.get(VERSION_COOKIE)?.value)

    // Endereço interno digitado direto (/v3/carrinho): só abre se for mesmo a versão da pessoa; senão, volta ao canônico
    if (internalVersion) {
        if (version === internalVersion) return NextResponse.next()
        const back = request.nextUrl.clone()
        back.pathname = canonicalFromInternal(pathname) || '/'
        return NextResponse.redirect(back)
    }

    const target = internalPathFor(version, pathname)
    if (!target) return null
    const rewritten = request.nextUrl.clone()
    rewritten.pathname = target
    return NextResponse.rewrite(rewritten)
}

// ===== CACHE EM MEMÓRIA =====
const cache = new Map<string, { type: 'profile' | 'store' | 'category' | 'product' | 'vehicle'; slug: string; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 60 segundos

function getFromCache(slug: string) {
    const cached = cache.get(slug)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached
    }
    return null
}

function setCache(slug: string, type: 'profile' | 'store' | 'category' | 'product' | 'vehicle') {
    cache.set(slug, { type, slug, timestamp: Date.now() })
}

export async function proxy(request: NextRequest) {
    const url = request.nextUrl.clone()
    const pathname = url.pathname

    console.log(`[Proxy] Processando: ${pathname}`)

    // --- 0. Versão da interface (2.0 / 3.0): mesma URL, implementação escolhida pela pessoa ---
    const versioned = await resolveUiVersion(request, pathname)
    if (versioned) return versioned

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

        // Veículo: o endereço público é /<vehicleSlug>, servido internamente por /veiculo/<vehicleSlug>
        const rewriteToVehicle = () => {
            const vehicleUrl = request.nextUrl.clone()
            vehicleUrl.pathname = `/veiculo/${slug}`
            return NextResponse.rewrite(vehicleUrl)
        }

        let cached = getFromCache(slug)
        if (cached) {
            console.log(`[Proxy] ${slug} é um ${cached.type} (cache) ✅`)
            return cached.type === 'vehicle' ? rewriteToVehicle() : NextResponse.next()
        }

        // Verifica perfil, loja e veículo em paralelo (slugs sao globalmente unicos).
        const [profileResult, storeResult, vehicleResult] = await Promise.all([
            supabaseAdmin.from('profiles').select('profileSlug').eq('profileSlug', slug).maybeSingle(),
            supabaseAdmin.from('stores').select('storeSlug').eq('storeSlug', slug).maybeSingle(),
            supabaseAdmin.from('driver_vehicles').select('vehicle_slug').ilike('vehicle_slug', slug).maybeSingle(),
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

        if (vehicleResult.data) {
            setCache(slug, 'vehicle')
            console.log(`[Proxy] ${slug} é um veículo ✅`)
            return rewriteToVehicle()
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