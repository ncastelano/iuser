// Busca as corridas abertas para o cartão do Canal do Motorista (só logado: ride_offers não é público) e faz, para cada uma, a MESMA conta do
// card de /aceitar-corridas (lib/rideQuote, como inicio/sections/AcceptARider): rota do mapa (partida → chegada), deslocamento do motorista
// até a partida (GPS → posição ao vivo → local salvo), Tarifa iUser e Minha tarifa pelo veículo da corrida, piso do ganho mínimo por hora e
// mínimo da plataforma. Assim o valor, o tempo, a distância e o R$/h do cartão batem com a página da corrida.
import { supabase } from '@/lib/supabase/client'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeConditionExtras, computePickupFee, computeSuggestedPrice, getCustomPricing, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, type DriverPricing, type RideConditionFlags } from '@/lib/driverPricing'
import { kindForRideType, rideAcceptsAnyVehicle, ridesAcceptableForVehicleKind, type VehicleKind, type VehicleType } from '@/lib/rideVehicle'
import { fetchRoute, haversineKm } from '@/lib/mapboxRoute'
import { getCurrentPosition } from '@/lib/nativeGeolocation'
import { isGeoPermissionGranted } from '@/components/AceitarCorridas/LocationAskDialog'
import { rideQuote } from '@/lib/rideQuote'
import { loadEarningGoal } from '@/modules/negotiation'
import { sortTiles, tileOf, type ChannelTile, type OfferRow } from './domain'

type Pos = [number, number]
type Leg = { km: number; min: number }

/** rotas já pedidas ao Mapbox (o cartão recarrega a cada 30 s): a da corrida não muda; a de ir buscar vale enquanto o motorista andou menos de 300 m */
const tripCache = new Map<string, Leg | null>()
const pickupCache = new Map<string, { from: Pos; leg: Leg | null }>()

async function leg(from: Pos, to: Pos): Promise<Leg | null> {
    try { const r = await fetchRoute(from, to); return { km: r.distanceKm, min: r.durationMin } } catch { return null }
}

/** GPS só se a pessoa já deu a permissão (o cartão não pergunta nada; quem pergunta é /aceitar-corridas) */
async function quietGps(): Promise<Pos | null> {
    if (!(await isGeoPermissionGranted())) return null
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), 6000)
        getCurrentPosition((p) => { clearTimeout(t); resolve([p.coords.longitude, p.coords.latitude]) }, () => { clearTimeout(t); resolve(null) }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 })
    })
}

type Row = OfferRow & {
    origin_lat: number | null; origin_lng: number | null; destination_lat: number | null; destination_lng: number | null
    applicant_count: number | null
    origin_needs_access: boolean | null; destination_needs_access: boolean | null; has_shopping: boolean | null; has_special_needs: boolean | null
    special_needs_wheelchair: boolean | null; special_needs_visual_impairment: boolean | null; has_guide_dog: boolean | null; pet_has_carrier: boolean | null
    delivery_location: string | null; wants_air_conditioning: boolean | null
}

export async function loadChannelTiles(opts: { userId: string; minPerMinute: number; myKinds: VehicleKind[]; limit?: number }): Promise<{ tiles: ChannelTile[]; total: number } | null> {
    await loadPlatformTariffs(supabase).catch(() => {})
    const [pricingRes, meRes, appsRes, goal, gps] = await Promise.all([
        supabase.from('driver_pricing')
            .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, price_per_minute, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, driver_mode_active, live_lat, live_lng')
            .eq('driver_id', opts.userId).maybeSingle(),
        supabase.from('my_profile').select('store_lat, store_lng').eq('id', opts.userId).maybeSingle(),
        supabase.from('ride_applications').select('ride_request_id').eq('applicant_id', opts.userId).eq('status', 'pending'),
        loadEarningGoal(opts.userId).catch(() => null),
        quietGps(),
    ])
    const pricing = pricingRes.data
    // a posição de quem dirige, na ordem de /aceitar-corridas: GPS → última posição ao vivo (modo motorista) → local salvo
    const live: Pos | null = pricing?.driver_mode_active && pricing.live_lat != null && pricing.live_lng != null ? [Number(pricing.live_lng), Number(pricing.live_lat)] : null
    const saved: Pos | null = meRes.data?.store_lat != null && meRes.data?.store_lng != null ? [Number(meRes.data.store_lng), Number(meRes.data.store_lat)] : null
    const pos = gps ?? live ?? saved
    const applied = new Set((appsRes.data || []).map((a) => a.ride_request_id))
    const minHourly = goal?.minHourly ?? null

    const { data, error } = await supabase.from('ride_offers')
        .select('id, ride_type, vehicle_type, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, offered_price, passenger_offer, order_id, created_at, applicant_count, origin_needs_access, destination_needs_access, has_shopping, has_special_needs, special_needs_wheelchair, special_needs_visual_impairment, has_guide_dog, pet_has_carrier, delivery_location, wants_air_conditioning')
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(120)
    if (error) return null
    // mesmas corridas de /aceitar-corridas: do veículo da pessoa (sem veículo, todas), sem as que ela já se candidatou e sem as lotadas
    const acceptable = new Set<string>(opts.myKinds.length ? opts.myKinds.flatMap((k) => ridesAcceptableForVehicleKind(k)) : ['carro', 'van', 'van-grande', 'moto', 'bicicleta', 'qualquer'])
    const rows = ((data || []) as Row[]).filter((r) => !applied.has(r.id) && (r.applicant_count ?? 0) < 5 && (rideAcceptsAnyVehicle(r.vehicle_type as VehicleType) || acceptable.has(r.vehicle_type || '')))
    const top = rows.slice(0, opts.limit ?? 12)

    // rotas (corrida e ir buscar), em paralelo e guardadas
    await Promise.all(top.map(async (r) => {
        const origin: Pos | null = r.origin_lat != null && r.origin_lng != null ? [Number(r.origin_lng), Number(r.origin_lat)] : null
        const dest: Pos | null = r.destination_lat != null && r.destination_lng != null ? [Number(r.destination_lng), Number(r.destination_lat)] : null
        if (origin && dest && !tripCache.has(r.id)) tripCache.set(r.id, await leg(origin, dest))
        if (origin && pos) {
            const c = pickupCache.get(r.id)
            if (!c || haversineKm(c.from, pos) >= 0.3) pickupCache.set(r.id, { from: pos, leg: await leg(pos, origin) })
        }
    }))

    const tiles = top.map((r) => {
        const rideKind = kindForRideType((r.vehicle_type || 'carro') as VehicleType)
        const rideType = (r.ride_type || 'pessoa') as 'pessoa' | 'animal' | 'objeto'
        const platformShape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[rideKind]
        const customShape = pricing ? getCustomPricing(pricing as never, rideKind) : null
        const flags: RideConditionFlags = {
            origin_needs_access: r.origin_needs_access, destination_needs_access: r.destination_needs_access, is_grocery_shopping: r.has_shopping,
            has_special_needs: r.has_special_needs, special_needs_wheelchair: r.special_needs_wheelchair, special_needs_visual_impairment: r.special_needs_visual_impairment,
            has_guide_dog: r.has_guide_dog, pet_has_carrier: r.pet_has_carrier, delivery_location: r.delivery_location, wants_air_conditioning: r.wants_air_conditioning,
        } as RideConditionFlags
        const trip = tripCache.get(r.id) ?? null
        const pickup = pos ? pickupCache.get(r.id)?.leg ?? null : null
        const offered = r.offered_price != null ? Number(r.offered_price) : null
        const q = rideQuote<DriverPricing>({
            offeredPrice: offered, distanceKm: r.distance_km, routeKm: trip?.km ?? null,
            platformShape, customShape, useCustom: pricing?.pricing_mode === 'custom',
            pickupKm: pickup?.km ?? null, pickupMin: pickup?.min ?? null,
            tripMin: trip?.min ?? r.duration_min ?? (r.distance_km != null ? (r.distance_km / 40) * 60 : null),
            minHourly: offered != null ? null : minHourly,
            minPerMinute: opts.minPerMinute,
            tripFare: (shape, km) => km != null
                ? computeSuggestedPrice(km, shape, rideType, flags)
                : shape.baseFee + shape.extraFees[rideType] + computeConditionExtras(flags, shape.conditionExtraFees),
            pickupFee: (shape, km) => computePickupFee(shape, km),
        })
        const fromPassenger = offered == null && r.passenger_offer != null
        return tileOf(r, {
            price: fromPassenger ? Number(r.passenger_offer) : q.shown,
            platform: q.platform, fromPassenger,
            approx: !fromPassenger && q.shownKind === 'platform' && !pickup,
            tripKm: q.tripKm, tripMin: trip?.min ?? r.duration_min, totalMin: q.minutes,
        })
    })
    return { tiles: sortTiles(tiles), total: rows.length }
}
