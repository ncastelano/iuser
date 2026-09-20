// app/api/store-orders/dispatch-driver/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { notifyDriversOfRide } from '@/lib/notifyDrivers'

const VEHICLES = ['carro', 'moto', 'bicicleta']

function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371
    const dLat = (b[1] - a[1]) * Math.PI / 180
    const dLng = (b[0] - a[0]) * Math.PI / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(h))
}

// Entrega iUser: a loja transforma um pedido em corrida de objeto, com o
// frete já definido, pra qualquer motorista da plataforma aceitar.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { orderId, vehicleType, freight } = await req.json().catch(() => ({}))
    if (!orderId || !VEHICLES.includes(vehicleType)) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, store_id, buyer_name, delivery_fee, delivery_address, delivery_lat, delivery_lng, status, order_items(product_name, quantity)')
        .eq('id', orderId)
        .maybeSingle()
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, owner_id, address, store_lat, store_lng, iuser_delivery_enabled')
        .eq('id', order.store_id)
        .maybeSingle()
    if (!store || store.owner_id !== user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    if (!store.iuser_delivery_enabled) {
        return NextResponse.json({ error: 'Ative a Entrega iUser nas configurações de entrega da loja.' }, { status: 409 })
    }
    if (!order.delivery_address) {
        return NextResponse.json({ error: 'Esse pedido não tem endereço de entrega.' }, { status: 409 })
    }
    if (!store.address || store.store_lat == null || store.store_lng == null) {
        return NextResponse.json({ error: 'Defina o endereço e a localização da loja pra chamar motorista.' }, { status: 409 })
    }

    const price = Number(freight ?? order.delivery_fee)
    if (!(price > 0)) return NextResponse.json({ error: 'Informe o valor do frete.' }, { status: 400 })

    const items = (order.order_items || []) as { product_name: string; quantity: number }[]
    const itemsText = items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')
    const description = `Pedido da loja ${store.name}${itemsText ? `: ${itemsText}` : ''}`.slice(0, 300)

    const hasDest = order.delivery_lat != null && order.delivery_lng != null
    const distanceKm = hasDest
        ? Math.round(haversineKm([store.store_lng, store.store_lat], [order.delivery_lng, order.delivery_lat]) * 1.3 * 10) / 10
        : null

    const { data: ride, error } = await supabaseAdmin
        .from('ride_requests')
        .insert({
            requester_id: user.id,
            ride_type: 'objeto',
            vehicle_type: vehicleType,
            origin_address: store.address,
            origin_lat: store.store_lat,
            origin_lng: store.store_lng,
            destination_address: order.delivery_address,
            destination_lat: order.delivery_lat,
            destination_lng: order.delivery_lng,
            distance_km: distanceKm,
            object_description: description,
            sender_name: store.name,
            recipient_name: order.buyer_name,
            offered_price: price,
            order_id: order.id,
            store_id: store.id,
        })
        .select('id, requester_id, vehicle_type, origin_address, destination_address, offered_price')
        .single()

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: 'Esse pedido já tem um motorista chamado.' }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    notifyDriversOfRide(ride).catch(() => {})
    return NextResponse.json({ success: true, rideId: ride.id })
}
