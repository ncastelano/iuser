// app/api/delivery/estimate/route.ts
//
// ESTIMATIVA OFICIAL do frete da entrega iUser (Etapa 2.3). O app só diz "esta loja, este destino"; o servidor busca
// tarifa, regras e coordenadas da loja no banco, mede a distância de rota e o BANCO calcula o valor (est-v1). Nada de
// frete, distância, tarifa, mínimo, teto ou arredondamento vindo do app é lido. Não cria pedido nem corrida: só grava a
// estimativa (histórico) e devolve o que a tela precisa.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { fetchRouteDistanceMeters, geocodeAddressNear } from '@/lib/deliveryDistance'
import { destinationMatchesAddress, haversineKm, parseEstimateRequest, toDeliveryEstimate } from '@/modules/delivery-estimate'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para ver a entrega' }, { status: 401 })
    if (!rateLimit(`estimate:u:${user.id}`, 10, 60_000) || !rateLimit(`estimate:ip:${clientIp(req)}`, 30, 60_000)) {
        return NextResponse.json({ error: 'Muitas consultas. Tente novamente em instantes.' }, { status: 429 })
    }

    const parsed = parseEstimateRequest(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { storeId, lat, lng, address } = parsed.value

    const { data: origin } = await supabaseAdmin.rpc('get_estimate_store_origin', { p_store: storeId })
    if (!origin || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
        return NextResponse.json({ error: 'Esta loja não faz entrega iUser' }, { status: 409 })
    }
    const store = { lat: origin.lat as number, lng: origin.lng as number }
    const dest = { lat, lng }

    // 1) o ponto marcado precisa bater com o endereço (geocodificado pelo servidor); sem resposta do serviço, segue "não verificado"
    const geocoded = await geocodeAddressNear(address, store)
    let destinationCheck: 'verified' | 'unverified' = 'unverified'
    if (geocoded) {
        if (!destinationMatchesAddress(geocoded, dest)) {
            return NextResponse.json({ error: 'O endereço não confere com o local marcado no mapa.' }, { status: 422 })
        }
        destinationCheck = 'verified'
    }

    // 2) distância de rota medida pelo servidor; se o Mapbox não responder, linha reta (marcada no snapshot)
    const routeMeters = await fetchRouteDistanceMeters(store, dest)
    const straightMeters = Math.round(haversineKm(store.lat, store.lng, lat, lng) * 1000)
    const distanceMeters = routeMeters ?? straightMeters
    const source = routeMeters != null ? 'route' : 'straight_line'

    const { data, error } = await supabaseAdmin.rpc('record_delivery_estimate', {
        p_customer: user.id,
        p_store: storeId,
        p_lat: lat,
        p_lng: lng,
        p_distance_m: distanceMeters,
        p_distance_source: source,
        p_destination_check: destinationCheck,
        p_address: address,
    })
    if (error || !data) {
        const msg = error?.message || 'Não foi possível calcular a entrega'
        const status = error?.code === '22023' ? 422 : error?.code === '54000' ? 429 : 500
        return NextResponse.json({ error: status === 500 ? 'Não foi possível calcular a entrega agora' : msg }, { status })
    }
    return NextResponse.json(toDeliveryEstimate(data as Record<string, unknown>))
}
