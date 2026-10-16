// app/api/rides/delivery-counter/route.ts
//
// Contraproposta do motorista numa entrega iUser: em vez de aceitar o frete da rodada, ele propõe o
// valor da "Minha tarifa" dele. O valor é calculado AQUI (tarifa do motorista × distância da corrida),
// nunca vem do app, e só vale se o cliente autorizar (respond_delivery_counter).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { computeRideTariffs } from '@/lib/rideTariffs'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { sendPushToUser } from '@/lib/serverPush'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { rideId } = await req.json().catch(() => ({}))
    if (typeof rideId !== 'string' || !rideId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const { data: ride } = await supabaseAdmin
        .from('ride_requests')
        .select('id, order_id, status, ride_type, vehicle_type, distance_km, delivery_location, store_id')
        .eq('id', rideId)
        .maybeSingle()
    if (!ride || !ride.order_id) return NextResponse.json({ error: 'Entrega não encontrada' }, { status: 404 })
    if (ride.status !== 'pending') return NextResponse.json({ error: 'Essa entrega não está mais disponível' }, { status: 409 })

    const { data: pricing } = await supabaseAdmin.from('driver_pricing').select('*').eq('driver_id', user.id).maybeSingle()
    if (!pricing) return NextResponse.json({ error: 'Defina a sua tarifa em Painel do motorista' }, { status: 409 })

    await loadPlatformTariffs(supabaseAdmin)
    const { customPrice } = computeRideTariffs(ride as Parameters<typeof computeRideTariffs>[0], pricing as Parameters<typeof computeRideTariffs>[1])
    if (customPrice == null) return NextResponse.json({ error: 'Defina a sua tarifa em Painel do motorista' }, { status: 409 })
    const amount = Math.round(customPrice * 100) / 100

    const { data: counterId, error } = await supabaseAdmin.rpc('create_delivery_counter', { p_ride: ride.id, p_driver: user.id, p_amount: amount })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })

    // Avisa o cliente: a decisão é dele.
    const { data: dispatch } = await supabaseAdmin.from('order_delivery_dispatches').select('customer_id, final_freight').eq('ride_request_id', ride.id).maybeSingle()
    if (dispatch?.customer_id) {
        const { data: driver } = await supabaseAdmin.from('profiles').select('name, profileSlug').eq('id', user.id).maybeSingle()
        const who = driver?.profileSlug ? `@${driver.profileSlug}` : driver?.name || 'Um motorista'
        sendPushToUser(dispatch.customer_id, {
            title: 'Um entregador quer fazer a sua entrega',
            body: `${who} propôs R$ ${amount.toFixed(2).replace('.', ',')} (hoje R$ ${Number(dispatch.final_freight).toFixed(2).replace('.', ',')}). Toque para decidir.`,
            url: '/carrinho?aba=pedidos',
            tag: `delivery-counter-${ride.id}`,
            urgent: true,
        }).catch(() => {})
    }
    return NextResponse.json({ success: true, counterId, amount })
}
