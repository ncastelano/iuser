// app/api/store-orders/dispatch-driver/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { notifyDriversOfRide } from '@/lib/notifyDrivers'

// Entrega iUser: a oferta já nasce no banco quando a loja aceita o pedido (gatilho em orders).
// Aqui a loja só garante que ela existe (pedido aceito antes da regra) e os motoristas do
// raio são avisados. O frete NÃO vem da loja nem do app: é o que o cliente autorizou, gravado
// pelo banco (order_delivery_rounds), e é o mesmo valor que o motorista vê e aceita.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { orderId } = await req.json().catch(() => ({}))
    if (!orderId) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

    const { data: order } = await supabaseAdmin.from('orders').select('id, store_id, status').eq('id', orderId).maybeSingle()
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, owner_id, iuser_delivery_enabled, address, store_lat, store_lng')
        .eq('id', order.store_id)
        .maybeSingle()
    if (!store || store.owner_id !== user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    if (!store.iuser_delivery_enabled) {
        return NextResponse.json({ error: 'Ative o Entregador do iUser nas configurações de entrega da loja.' }, { status: 409 })
    }
    if (!['preparing', 'ready'].includes(order.status)) {
        return NextResponse.json({ error: 'Aceite o pedido antes de chamar o motorista.' }, { status: 409 })
    }
    if (!store.address || store.store_lat == null || store.store_lng == null) {
        return NextResponse.json({ error: 'Defina o endereço e a localização da loja pra chamar motorista.' }, { status: 409 })
    }

    const { data: dispatchId, error: startError } = await supabaseAdmin.rpc('_start_order_delivery_dispatch', { p_order: order.id })
    if (startError) return NextResponse.json({ error: startError.message }, { status: 500 })
    if (!dispatchId) return NextResponse.json({ error: 'Esse pedido não tem entrega para chamar motorista.' }, { status: 409 })

    const { data: dispatch } = await supabaseAdmin
        .from('order_delivery_dispatches')
        .select('id, ride_request_id, status, radius_km')
        .eq('id', dispatchId)
        .single()
    if (!dispatch?.ride_request_id) return NextResponse.json({ error: 'Entrega sem corrida' }, { status: 500 })

    if (dispatch.status === 'searching') {
        const { data: ride } = await supabaseAdmin
            .from('ride_requests')
            .select('id, requester_id, vehicle_type, origin_address, destination_address, offered_price')
            .eq('id', dispatch.ride_request_id)
            .single()
        if (ride) {
            await notifyDriversOfRide({
                ...ride,
                radiusKm: Number(dispatch.radius_km),
                originLat: store.store_lat,
                originLng: store.store_lng,
            }).catch(() => {})
        }
    }
    return NextResponse.json({ success: true, dispatchId: dispatch.id, rideId: dispatch.ride_request_id })
}
