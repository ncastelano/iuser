// GET /api/dev/ride-points?driver=<nome> — só no ambiente LOCAL de desenvolvimento: onde ficam a partida, as paradas e o destino da corrida de PASSAGEIRO que esse motorista tem aceita agora
// (e em que etapa está). O Teatro usa para pôr o "GPS de teste" do motorista no ponto certo. Em qualquer outro ambiente: 404.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isLocalDevOnly } from '@/lib/devOnly'

export async function GET(req: Request) {
    if (!isLocalDevOnly()) return new NextResponse(null, { status: 404 })
    const name = new URL(req.url).searchParams.get('driver')
    if (!name) return NextResponse.json({ error: 'driver?' }, { status: 400 })
    const { data: p } = await supabaseAdmin.from('profiles').select('id').eq('name', name).limit(1).maybeSingle()
    if (!p) return NextResponse.json({ ride: null })
    const { data: r } = await supabaseAdmin.from('ride_requests')
        .select('id, origin_lat, origin_lng, destination_lat, destination_lng, stop1_lat, stop1_lng, stop1_reached_at, stop2_lat, stop2_lng, stop2_reached_at, driver_en_route, driver_arrived_at, ride_started_at')
        .eq('driver_id', p.id).eq('status', 'accepted').is('order_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ ride: r ?? null })
}
