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

    // Se a URL já tem dois segmentos (ex: /perfil/loja), deixa passar
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length >= 2) return NextResponse.next()

    // Agora temos apenas um segmento: /nomedaloja
    const slug = segments[0]
    if (!slug) return NextResponse.next()

    try {
        // Procura a loja pelo storeSlug
        const { data: store } = await supabaseAdmin
            .from('stores')
            .select('storeSlug, owner_id')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (!store) return NextResponse.next()

        // Procura o profileSlug do dono
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('profileSlug')
            .eq('id', store.owner_id)
            .single()

        if (profile?.profileSlug) {
            // Reescreve internamente a URL para /profileSlug/storeSlug
            const newUrl = request.nextUrl.clone()
            newUrl.pathname = `/${profile.profileSlug}/${store.storeSlug}`
            return NextResponse.rewrite(newUrl)
        }
    } catch (error) {
        console.error('Middleware error:', error)
    }

    return NextResponse.next()
}