// app/s/[code]/route.ts
//
// Redirecionador do encurtador (ver src/lib/shortLink.ts). Rota pura, sem
// UI — só resolve o código e manda um 307 pra URL de verdade.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iuser.com.br'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code } = await params

    const { data } = await supabaseAdmin
        .from('short_links')
        .select('target_url, click_count')
        .eq('code', code)
        .maybeSingle()

    if (!data) {
        return NextResponse.redirect(APP_URL)
    }

    // Precisa esperar (mesmo que o resultado não importe) — numa function
    // serverless, uma promise disparada e não aguardada pode ser cortada
    // assim que a resposta é enviada.
    await supabaseAdmin
        .from('short_links')
        .update({ click_count: (data.click_count || 0) + 1 })
        .eq('code', code)

    return NextResponse.redirect(data.target_url)
}
