// app/api/orders/notify-drivers/route.ts
//
// ENTREGADOR PRIMEIRO, LOJA DEPOIS: quando o cliente faz um pedido de entrega iUser, o pedido fica RETIDO (a loja ainda não o vê) e a busca por motorista já
// começou no banco (create_store_order). Aqui o COMPRADOR avisa os motoristas do raio — o mesmo aviso que a loja mandava ao aceitar (dispatch-driver). Só quem fez
// o pedido, só pedido ainda retido e com a entrega em busca; o frete e o raio são os do banco (nada vem do app além do id do pedido).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { notifyDriversOfRide } from '@/lib/notifyDrivers'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { orderId } = await req.json().catch(() => ({})) as { orderId?: string }
    if (!orderId) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

    const { data: order } = await supabaseAdmin.from('orders').select('id, buyer_id, store_id, status, store_visible').eq('id', orderId).maybeSingle()
    if (!order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    if (order.store_visible || order.status !== 'pending') return NextResponse.json({ success: true, notified: 0, skipped: 'not_held' })

    const [{ data: dispatch }, { data: store }] = await Promise.all([
        supabaseAdmin.from('order_delivery_dispatches').select('id, ride_request_id, status, radius_km, flow_version').eq('order_id', order.id).maybeSingle(),
        supabaseAdmin.from('stores').select('store_lat, store_lng').eq('id', order.store_id).maybeSingle(),
    ])
    if (!dispatch?.ride_request_id || dispatch.status !== 'searching' || dispatch.flow_version === 2) return NextResponse.json({ success: true, notified: 0, skipped: 'no_search' })

    const { data: ride } = await supabaseAdmin
        .from('ride_requests')
        .select('id, requester_id, vehicle_type, origin_address, destination_address, offered_price')
        .eq('id', dispatch.ride_request_id)
        .single()
    if (!ride) return NextResponse.json({ error: 'Entrega sem corrida' }, { status: 500 })

    const notified = await notifyDriversOfRide({
        ...ride,
        radiusKm: Number(dispatch.radius_km),
        originLat: store?.store_lat ?? null,
        originLng: store?.store_lng ?? null,
    }).catch(() => 0)
    await supabaseAdmin.rpc('record_delivery_round_notified', { p_dispatch: dispatch.id, p_count: notified || 0 })
    return NextResponse.json({ success: true, notified })
}
