// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function proxy(request: NextRequest) {
    const url = request.nextUrl.clone()
    const pathname = url.pathname

    // Ignorar rotas internas, API, etc.
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname === '/' ||
        pathname.includes('.')
    ) {
        return NextResponse.next()
    }

    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return NextResponse.next()

    const firstSegment = segments[0]

    // ============================================================
    // APENAS VALIDAR SE O PRIMEIRO SEGMENTO É UM PERFIL OU LOJA
    // NÃO REESCREVER NADA!
    // ============================================================
    try {
        // Verifica se é um profileSlug
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('profileSlug')
            .eq('profileSlug', firstSegment)
            .maybeSingle()

        if (profile) {
            // É um perfil - deixa passar
            console.log(`[Proxy] ${firstSegment} é um perfil ✅`)
            return NextResponse.next()
        }

        // Verifica se é um storeSlug
        const { data: store } = await supabaseAdmin
            .from('stores')
            .select('storeSlug')
            .eq('storeSlug', firstSegment)
            .maybeSingle()

        if (store) {
            // É uma loja - deixa passar
            console.log(`[Proxy] ${firstSegment} é uma loja ✅`)
            return NextResponse.next()
        }

        // Se não for perfil nem loja, redireciona para 404
        console.log(`[Proxy] ${firstSegment} não encontrado ❌`)
        const notFoundUrl = request.nextUrl.clone()
        notFoundUrl.pathname = '/404'
        return NextResponse.rewrite(notFoundUrl)

    } catch (error) {
        console.error('Proxy error:', error)
    }

    return NextResponse.next()
}

export default proxy