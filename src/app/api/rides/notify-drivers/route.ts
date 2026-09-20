// app/api/rides/notify-drivers/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { notifyDriversOfRide } from '@/lib/notifyDrivers'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { rideRequestId } = await req.json().catch(() => ({}))
    if (!rideRequestId) return NextResponse.json({ error: 'rideRequestId é obrigatório' }, { status: 400 })

    const { data: ride } = await supabaseAdmin
        .from('ride_requests')
        .select('id, requester_id, vehicle_type, origin_address, destination_address, offered_price, status')
        .eq('id', rideRequestId)
        .maybeSingle()

    if (!ride || ride.requester_id !== user.id) return NextResponse.json({ error: 'Corrida não encontrada' }, { status: 404 })
    if (ride.status !== 'pending') return NextResponse.json({ success: true, skipped: true })

    const notified = await notifyDriversOfRide(ride)
    return NextResponse.json({ success: true, notified })
}
