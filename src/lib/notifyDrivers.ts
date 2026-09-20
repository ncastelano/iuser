// lib/notifyDrivers.ts
// Server-only: avisa (push) todo motorista com o modo motorista ligado que
// atende esse tipo de veículo, quando um pedido de corrida novo entra.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

const MAX_DRIVERS = 200

const ACCEPTABLE: Record<string, string[]> = {
    carro: ['carro', 'van', 'van-grande'],
    moto: ['moto'],
    bicicleta: ['bicicleta'],
}

export async function notifyDriversOfRide(ride: {
    id: string
    requester_id: string
    vehicle_type: string
    origin_address: string
    destination_address: string
    offered_price?: number | null
}): Promise<number> {
    const { data: drivers } = await supabaseAdmin
        .from('driver_pricing')
        .select('driver_id')
        .eq('driver_mode_active', true)
        .neq('driver_id', ride.requester_id)
        .limit(MAX_DRIVERS)
    const ids = (drivers || []).map((d) => d.driver_id as string)
    if (ids.length === 0) return 0

    const [{ data: vehicles }, { data: charges }] = await Promise.all([
        supabaseAdmin.from('driver_vehicles').select('driver_id, vehicle_kind').in('driver_id', ids),
        supabaseAdmin.from('driver_postpaid_charges').select('driver_id, amount').in('driver_id', ids),
    ])

    const kindsByDriver = new Map<string, string[]>()
    for (const v of vehicles || []) {
        kindsByDriver.set(v.driver_id, [...(kindsByDriver.get(v.driver_id) || []), v.vehicle_kind])
    }
    const debtByDriver = new Map<string, number>()
    for (const c of charges || []) {
        debtByDriver.set(c.driver_id, (debtByDriver.get(c.driver_id) || 0) + Number(c.amount))
    }

    const eligible = ids.filter((id) => {
        const kinds = kindsByDriver.get(id) || ['carro']
        const canServe = kinds.some((k) => (ACCEPTABLE[k] || []).includes(ride.vehicle_type))
        return canServe && (debtByDriver.get(id) || 0) < 50
    })

    const short = (a: string) => a.split(',')[0]
    const priceText = ride.offered_price != null ? ` · Frete R$ ${Number(ride.offered_price).toFixed(2)}` : ''
    const results = await Promise.allSettled(
        eligible.map((id) =>
            sendPushToUser(id, {
                title: 'Nova corrida disponível!',
                body: `${short(ride.origin_address)} → ${short(ride.destination_address)}${priceText}`,
                url: '/aceitar-corridas',
                tag: `new-ride-${ride.id}`,
            })
        )
    )
    return results.filter((r) => r.status === 'fulfilled').length
}
