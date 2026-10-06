// lib/notifyDrivers.ts
// Server-only: avisa (push) todo motorista com o modo motorista ligado que
// atende esse tipo de veículo, quando um pedido de corrida novo entra.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'
import { computeRideTariffs } from '@/lib/rideTariffs'
import { fetchPricePerMinuteMap } from '@/lib/driverPricing'

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
        // Corrida "qualquer um": todo motorista é elegível, seja qual for o veículo dele.
        const canServe = ride.vehicle_type === 'qualquer' || kinds.some((k) => (ACCEPTABLE[k] || []).includes(ride.vehicle_type))
        return canServe && (debtByDriver.get(id) || 0) < 50
    })

    // Cada motorista tem a própria "Minha tarifa": busca a linha completa da
    // corrida (condições que somam extras) e o preço de cada elegível pra
    // mandar os valores já prontos na notificação.
    const [{ data: fullRide }, { data: pricingRows }] = await Promise.all([
        supabaseAdmin
            .from('ride_requests')
            .select('ride_type, vehicle_type, distance_km, duration_min, origin_needs_access, destination_needs_access, has_shopping, has_special_needs, special_needs_wheelchair, special_needs_visual_impairment, has_guide_dog, pet_has_carrier, delivery_location, wants_air_conditioning')
            .eq('id', ride.id)
            .maybeSingle(),
        supabaseAdmin
            .from('driver_pricing')
            .select('driver_id, pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado')
            .in('driver_id', eligible),
    ])
    const pricePerMinuteByDriver = await fetchPricePerMinuteMap(supabaseAdmin, eligible)
    const pricingByDriver = new Map((pricingRows || []).map((p) => [p.driver_id as string, { ...p, price_per_minute: pricePerMinuteByDriver.get(p.driver_id as string) ?? null }]))

    const short = (a: string) => a.split(',')[0]
    const priceText = ride.offered_price != null ? ` · Frete R$ ${Number(ride.offered_price).toFixed(2)}` : ''
    const results = await Promise.allSettled(
        eligible.map((id) => {
            const pricing = pricingByDriver.get(id)
            const tariffs = fullRide && pricing ? computeRideTariffs(fullRide as Parameters<typeof computeRideTariffs>[0], pricing as Parameters<typeof computeRideTariffs>[1]) : null
            return sendPushToUser(id, {
                title: 'Nova corrida disponível!',
                body: `${short(ride.origin_address)} → ${short(ride.destination_address)}${priceText}`,
                url: `/aceitar-corridas/mapa?ride=${ride.id}`,
                tag: `new-ride-${ride.id}`,
                urgent: true,
                rideAlert: tariffs
                    ? {
                        rideId: ride.id,
                        platformPrice: tariffs.platformPrice,
                        customPrice: tariffs.customPrice,
                        preferredPrice: tariffs.preferredPrice,
                        offeredPrice: ride.offered_price != null ? Number(ride.offered_price) : null,
                    }
                    : undefined,
            })
        })
    )
    return results.filter((r) => r.status === 'fulfilled').length
}
