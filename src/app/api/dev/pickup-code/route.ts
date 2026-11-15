// GET /api/dev/pickup-code?driver=<nome> — só no ambiente LOCAL de desenvolvimento: o código de retirada ativo desse motorista (a loja o vê no painel e informa ao motorista).
// O Teatro precisa dele para o motorista digitar o que a loja diria, sem tirar a dona do que ela está fazendo. Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isLocalDevOnly } from '@/lib/devOnly'

export async function GET(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const name = new URL(req.url).searchParams.get('driver')
    if (!name) return NextResponse.json({ error: 'driver?' }, { status: 400 })
    const { data: p } = await supabaseAdmin.from('profiles').select('id').eq('name', name).limit(1).maybeSingle()
    if (!p) return NextResponse.json({ code: null })
    const { data: c } = await supabaseAdmin.from('delivery_pickup_codes').select('code').eq('driver_id', p.id).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ code: c?.code ?? null })
}
