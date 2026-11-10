// Busca as corridas abertas para o cartão do Canal do Motorista (só logado: ride_offers não é público) e as transforma em tiles.
import { supabase } from '@/lib/supabase/client'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeSuggestedPrice, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, type RideRequestType } from '@/lib/driverPricing'
import { kindForRideType, ridesAcceptableForVehicleKind, type VehicleKind, type VehicleType } from '@/lib/rideVehicle'
import { platformFloor } from '@/modules/negotiation/domain'
import { sortTiles, tileOf, type ChannelTile, type OfferRow } from './domain'

export async function loadChannelTiles(opts: { minPerMinute: number; myKinds: VehicleKind[]; limit?: number }): Promise<{ tiles: ChannelTile[]; total: number } | null> {
    await loadPlatformTariffs(supabase).catch(() => {})
    let q = supabase.from('ride_offers')
        .select('id, ride_type, vehicle_type, origin_address, destination_address, distance_km, duration_min, offered_price, passenger_offer, order_id, created_at', { count: 'exact' })
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(opts.limit ?? 30)
    // como no Canal da home e em /aceitar-corridas: quem tem veículo vê só as corridas que ele pode fazer (e as de "qualquer")
    if (opts.myKinds.length) {
        const types = [...new Set(opts.myKinds.flatMap((k) => ridesAcceptableForVehicleKind(k)))]
        q = q.in('vehicle_type', [...types, 'qualquer'])
    }
    const { data, error, count } = await q
    if (error) return null
    const fareOf = (km: number, vehicle: string, rideType: string | null) => {
        const pricing = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[kindForRideType((vehicle || 'carro') as VehicleType)]
        return computeSuggestedPrice(km, pricing, (rideType as RideRequestType) || undefined)
    }
    const tiles = sortTiles(((data || []) as OfferRow[]).map((r) => tileOf(r, fareOf, (m) => platformFloor(m, opts.minPerMinute))))
    return { tiles, total: count ?? tiles.length }
}
