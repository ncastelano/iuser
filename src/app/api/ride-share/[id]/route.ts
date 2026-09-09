// app/api/ride-share/[id]/route.ts
//
// Endpoint público (sem login) pro link "compartilhar corrida" — permite que
// alguém sem conta no iUser (porteiro, familiar) acompanhe o essencial de uma
// corrida específica: status, endereços, e quem é o motorista. Só quem tem o
// link (o UUID da corrida, imprevisível) consegue ver — mesmo modelo usado
// por apps de transporte pra "compartilhar viagem".
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!id) {
        return NextResponse.json({ error: 'ID da corrida é obrigatório' }, { status: 400 })
    }

    const { data: ride, error } = await supabaseAdmin
        .from('ride_requests')
        .select('id, status, ride_type, requester_id, driver_id, origin_address, destination_address, origin_complement, destination_complement, distance_km, duration_min, driver_en_route, driver_arrived_at, created_at')
        .eq('id', id)
        .maybeSingle()

    if (error || !ride) {
        return NextResponse.json({ error: 'Corrida não encontrada' }, { status: 404 })
    }

    const { data: requester } = await supabaseAdmin
        .from('profiles')
        .select('name, profileSlug')
        .eq('id', ride.requester_id)
        .maybeSingle()
    const requesterFirstName = (requester?.name || requester?.profileSlug || 'Passageiro').split(' ')[0]

    let driver: {
        name: string | null
        avatarUrl: string | null
        carModel: string | null
        carColor: string | null
        carPhotoUrl: string | null
    } | null = null

    if (ride.driver_id) {
        const [{ data: driverProfile }, { data: vehicle }] = await Promise.all([
            supabaseAdmin.from('profiles').select('name, profileSlug, avatar_url').eq('id', ride.driver_id).maybeSingle(),
            supabaseAdmin.from('driver_vehicles').select('car_model, car_color, car_photo_url').eq('driver_id', ride.driver_id).maybeSingle(),
        ])

        driver = {
            name: driverProfile?.name || (driverProfile?.profileSlug ? `@${driverProfile.profileSlug}` : null),
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
        destinationAddress: ride.destination_address,
        originComplement: ride.origin_complement,
        destinationComplement: ride.destination_complement,
        distanceKm: ride.distance_km,
        durationMin: ride.duration_min,
        driverEnRoute: ride.driver_en_route,
        driverArrivedAt: ride.driver_arrived_at,
        createdAt: ride.created_at,
        driver,
    })
}
