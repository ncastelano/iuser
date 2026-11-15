// GET /api/dev/proof?driver=<nome> — só no ambiente LOCAL de desenvolvimento: o código de entrega da entrega que o motorista (pelo nome) tem na porta agora.
// O Teatro precisa dele para o motorista digitar o que o cliente diria; em produção o código só chega ao cliente. Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isLocalDevOnly } from '@/lib/devOnly'

export async function GET(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const name = new URL(req.url).searchParams.get('driver')
    if (!name) return NextResponse.json({ error: 'driver?' }, { status: 400 })
    const { data: p } = await supabaseAdmin.from('profiles').select('id').eq('name', name).limit(1).maybeSingle()
    if (!p) return NextResponse.json({ pin: null })
    const { data: rides } = await supabaseAdmin.from('ride_requests').select('id').eq('driver_id', p.id).eq('status', 'accepted').not('order_id', 'is', null).not('arrived_destination_at', 'is', null)
    const ids = (rides || []).map((r) => r.id as string)
    if (!ids.length) return NextResponse.json({ pin: null })
    const { data: d } = await supabaseAdmin.from('delivery_proofs').select('pin').in('ride_id', ids).is('method', null).limit(1).maybeSingle()
    return NextResponse.json({ pin: d?.pin ?? null })
}
