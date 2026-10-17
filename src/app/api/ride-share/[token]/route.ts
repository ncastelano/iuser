// app/api/ride-share/[id]/route.ts
//
// Endpoint público (sem login) pro link "compartilhar corrida" — permite que
// alguém sem conta no iUser (porteiro, familiar) acompanhe o essencial de uma
// corrida específica: status, endereços, e quem é o motorista.
//
// O segredo é um TOKEN aleatório de 160 bits (ride_requests.share_token) que só o solicitante e o motorista da corrida
// enxergam — NUNCA o id da corrida (o id circula entre motoristas). O link expira: vale com a corrida pendente/aceita e
// por 6 h depois de concluída/cancelada (máx. 30 dias). Resposta única (404) para token inexistente, errado ou expirado,
// com limite de requisições por IP, sem cache e sem indexação.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { kindForRideType } from '@/lib/rideVehicle'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }
const AFTER_CLOSE_MS = 6 * 60 * 60 * 1000
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const TOKEN_RE = /^[0-9a-f]{40}$/

const notFound = () => NextResponse.json({ error: 'Corrida não encontrada' }, { status: 404, headers: HEADERS })

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const ip = clientIp(req)
    // limite geral por IP (o app consulta a cada 15 s por espectador) e limite menor para tentativas que erram
    if (!rateLimit(`share:${ip}`, 60, 60_000)) {
        return NextResponse.json({ error: 'Muitas consultas. Tente de novo em instantes.' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '30' } })
    }
    if (!token || !TOKEN_RE.test(token)) {
        if (!rateLimit(`share-miss:${ip}`, 10, 60_000)) {
            return NextResponse.json({ error: 'Muitas consultas. Tente de novo em instantes.' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
        }
        return notFound()
    }

    const { data: ride, error } = await supabaseAdmin
        .from('ride_requests')
        .select('id, status, ride_type, order_id, requester_id, driver_id, origin_address, destination_address, origin_complement, destination_complement, vehicle_type, distance_km, duration_min, driver_en_route, driver_arrived_at, ride_started_at, created_at, scheduled_for, share_closed_at')
        .eq('share_token', token)
        .maybeSingle()

    const base = ride ? new Date(ride.scheduled_for || ride.created_at).getTime() : 0
    const closedAt = ride?.share_closed_at ? new Date(ride.share_closed_at).getTime() : null
    const expired = !ride
        || Date.now() - base > MAX_AGE_MS
        || (['completed', 'cancelled'].includes(ride.status) && closedAt !== null && Date.now() - closedAt > AFTER_CLOSE_MS)
    if (error || !ride || expired) {
        if (!rateLimit(`share-miss:${ip}`, 10, 60_000)) {
            return NextResponse.json({ error: 'Muitas consultas. Tente de novo em instantes.' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
        }
        return notFound()
    }

    // Entrega de loja: o endereço do cliente final não vai por link público (só a região); o resto segue igual.
    let destinationAddress: string | null = ride.destination_address
    let destinationComplement: string | null = ride.destination_complement
    if (ride.order_id) {
        const { data: area } = await supabaseAdmin.rpc('_address_area', { p_address: ride.destination_address })
        destinationAddress = (area as string | null) || 'Região do cliente'
        destinationComplement = null
    }

    const { data: requester } = await supabaseAdmin
        .from('profiles')
        .select('name, profileSlug')
        .eq('id', ride.requester_id)
        .maybeSingle()
    const requesterFirstName = (requester?.profileSlug ? `@${requester.profileSlug}` : requester?.name || 'Passageiro')

    let driver: {
        id: string
        name: string | null
        avatarUrl: string | null
        carModel: string | null
        carColor: string | null
        carPhotoUrl: string | null
    } | null = null

    if (ride.driver_id) {
        const [{ data: driverProfile }, { data: vehicleRows }] = await Promise.all([
            supabaseAdmin.from('profiles').select('name, profileSlug, avatar_url').eq('id', ride.driver_id).maybeSingle(),
            supabaseAdmin.from('driver_vehicles').select('vehicle_kind, car_model, car_color, car_photo_url').eq('driver_id', ride.driver_id),
        ])

        // Motorista pode ter vários veículos — mostra o que atende essa corrida.
        const rideKind = kindForRideType(ride.vehicle_type)
        const vehicle = (vehicleRows || []).find((v) => v.vehicle_kind === rideKind) || (vehicleRows || [])[0]

        driver = {
            id: ride.driver_id,
            name: (driverProfile?.profileSlug ? `@${driverProfile.profileSlug}` : driverProfile?.name || null),
            avatarUrl: driverProfile?.avatar_url
                ? (driverProfile.avatar_url.startsWith('http')
                    ? driverProfile.avatar_url
                    : supabaseAdmin.storage.from('avatars').getPublicUrl(driverProfile.avatar_url).data.publicUrl)
                : null,
            carModel: vehicle?.car_model || null,
            carColor: vehicle?.car_color || null,
            carPhotoUrl: vehicle?.car_photo_url
                ? supabaseAdmin.storage.from('driver-car-photos').getPublicUrl(vehicle.car_photo_url).data.publicUrl
                : null,
        }
    }

    return NextResponse.json({
        status: ride.status,
        rideType: ride.ride_type,
        requesterFirstName,
        originAddress: ride.origin_address,
        destinationAddress,
        originComplement: ride.origin_complement,
        destinationComplement,
        distanceKm: ride.distance_km,
        durationMin: ride.duration_min,
        driverEnRoute: ride.driver_en_route,
        driverArrivedAt: ride.driver_arrived_at,
        rideStartedAt: ride.ride_started_at,
        createdAt: ride.created_at,
        driver,
    }, { headers: HEADERS })
}
