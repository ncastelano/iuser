// src/lib/rideTariffs.ts
//
// "Tarifa iUser" e "Minha tarifa" de uma corrida pro motorista — mesma conta
// que o card em /aceitar-corridas faz, aqui isolada pra o toast de "Nova
// corrida disponível!" (que só recebe a linha crua do Realtime) mostrar os
// mesmos valores sem carregar a página inteira.
import {
    computeSuggestedPrice,
    computeConditionExtras,
    getCustomPricing,
    PLATFORM_DEFAULT_PRICING_BY_VEHICLE,
    type DriverPricing,
    type DriverPricingRow,
    type RideConditionFlags,
    type RideRequestType,
} from '@/lib/driverPricing'
import { kindForRideType, type VehicleType } from '@/lib/rideVehicle'

export interface RideTariffSource {
    ride_type?: RideRequestType | null
    vehicle_type?: VehicleType | null
    distance_km?: number | null
    origin_needs_access?: boolean | null
    destination_needs_access?: boolean | null
    has_shopping?: boolean | null
    has_special_needs?: boolean | null
    special_needs_wheelchair?: boolean | null
    special_needs_visual_impairment?: boolean | null
    has_guide_dog?: boolean | null
    pet_has_carrier?: boolean | null
    delivery_location?: 'portaria' | 'area_interna' | 'apartamento' | null
    wants_air_conditioning?: boolean | null
}

export function computeRideTariffs(ride: RideTariffSource, pricing: DriverPricingRow): { platformPrice: number; customPrice: number | null } {
    const rideKind = kindForRideType(ride.vehicle_type || 'carro')
    const rideType: RideRequestType = ride.ride_type || 'pessoa'
    const flags: RideConditionFlags = {
        origin_needs_access: !!ride.origin_needs_access,
        destination_needs_access: !!ride.destination_needs_access,
        is_grocery_shopping: !!ride.has_shopping,
        has_special_needs: !!ride.has_special_needs,
        special_needs_wheelchair: !!ride.special_needs_wheelchair,
        special_needs_visual_impairment: !!ride.special_needs_visual_impairment,
        has_guide_dog: !!ride.has_guide_dog,
        pet_has_carrier: ride.pet_has_carrier ?? null,
        delivery_location: ride.delivery_location ?? null,
        wants_air_conditioning: !!ride.wants_air_conditioning,
    }
    const priceWith = (shape: DriverPricing) => ride.distance_km != null
        ? computeSuggestedPrice(ride.distance_km, shape, rideType, flags)
        : shape.baseFee + shape.extraFees[rideType] + computeConditionExtras(flags, shape.conditionExtraFees)

    const customShape = getCustomPricing(pricing, rideKind)
    return {
        platformPrice: priceWith(PLATFORM_DEFAULT_PRICING_BY_VEHICLE[rideKind]),
        customPrice: customShape ? priceWith(customShape) : null,
    }
}
