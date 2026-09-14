// src/lib/driverPricing.ts

export type PricingMode = 'platform' | 'custom'
export type RideRequestType = 'pessoa' | 'animal' | 'objeto'

export interface DriverExtraFees {
    pessoa: number
    animal: number
    objeto: number
}

export interface DriverPricing {
    baseDistanceKm: number
    baseFee: number
    pricePerKmAfterBase: number
    extraFees: DriverExtraFees
}

// Tarifa padrão da plataforma — usada por quem escolhe não definir a
// própria tarifa em /painel-motorista.
export const PLATFORM_DEFAULT_EXTRA_FEES: DriverExtraFees = {
    pessoa: 0,
    animal: 5,
    objeto: 3,
}

export const PLATFORM_DEFAULT_PRICING: DriverPricing = {
    baseDistanceKm: 5,
    baseFee: 7,
    pricePerKmAfterBase: 2,
    extraFees: PLATFORM_DEFAULT_EXTRA_FEES,
}

export interface DriverPricingRow {
    pricing_mode: PricingMode
    base_distance_km: number | null
    base_fee: number | null
    price_per_km_after_base: number | null
    extra_fee_pessoa?: number | null
    extra_fee_animal?: number | null
    extra_fee_objeto?: number | null
}

// Resolve a tarifa que vale de fato pra esse motorista, considerando o
// plano escolhido (plataforma ou própria).
export function getEffectivePricing(row: DriverPricingRow): DriverPricing {
    if (row.pricing_mode === 'platform') return PLATFORM_DEFAULT_PRICING
    return {
        baseDistanceKm: row.base_distance_km ?? PLATFORM_DEFAULT_PRICING.baseDistanceKm,
        baseFee: row.base_fee ?? PLATFORM_DEFAULT_PRICING.baseFee,
        pricePerKmAfterBase: row.price_per_km_after_base ?? PLATFORM_DEFAULT_PRICING.pricePerKmAfterBase,
        extraFees: {
            pessoa: row.extra_fee_pessoa ?? PLATFORM_DEFAULT_EXTRA_FEES.pessoa,
            animal: row.extra_fee_animal ?? PLATFORM_DEFAULT_EXTRA_FEES.animal,
            objeto: row.extra_fee_objeto ?? PLATFORM_DEFAULT_EXTRA_FEES.objeto,
        },
    }
}

// rideType é opcional pra permitir uma prévia genérica (sem corrida real
// associada, ex: painel-motorista) — nesse caso nenhum valor extra entra.
export function computeSuggestedPrice(distanceKm: number, pricing: DriverPricing, rideType?: RideRequestType): number {
    const extraKm = Math.max(0, distanceKm - pricing.baseDistanceKm)
    const extraFee = rideType ? pricing.extraFees[rideType] : 0
    return pricing.baseFee + extraKm * pricing.pricePerKmAfterBase + extraFee
}
