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

    // Se já tem 3 ou mais segmentos, provavelmente já está no formato
    // /profileSlug/storeSlug/slug — não reescrever
    if (segments.length >= 3) return NextResponse.next()

    try {
        // Verifica se o PRIMEIRO segmento é um profileSlug válido
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('profileSlug')
            .eq('profileSlug', firstSegment)
            .maybeSingle()

        // Se o primeiro segmento é um profileSlug, a URL já está no formato correto — não reescrever
        if (profile) return NextResponse.next()

        // Procura se o primeiro segmento é um storeSlug (URL encurtada)
        const { data: store } = await supabaseAdmin
            .from('stores')
            .select('storeSlug, owner_id')
            .eq('storeSlug', firstSegment)
            .maybeSingle()

        if (store) {
            // Busca o profileSlug do dono
            const { data: ownerProfile } = await supabaseAdmin
                .from('profiles')
                .select('profileSlug')
                .eq('id', store.owner_id)
                .single()

            if (ownerProfile?.profileSlug) {
                // Reescreve preservando segmentos extras: /loja/slug -> /perfil/loja/slug
                const restPath = segments.slice(1).join('/')
                const newUrl = request.nextUrl.clone()
                newUrl.pathname = restPath
                    ? `/${ownerProfile.profileSlug}/${store.storeSlug}/${restPath}`
                    : `/${ownerProfile.profileSlug}/${store.storeSlug}`

                return NextResponse.rewrite(newUrl)
            }
        }
    } catch (error) {
        console.error('Proxy error:', error)
    }

    return NextResponse.next()
}

export default proxy