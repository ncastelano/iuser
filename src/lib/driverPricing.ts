// src/lib/driverPricing.ts

export type PricingMode = 'platform' | 'custom'

export interface DriverPricing {
    baseDistanceKm: number
    baseFee: number
    pricePerKmAfterBase: number
}

// Tarifa padrão da plataforma — usada por quem escolhe não definir a
// própria tarifa em /painel-motorista.
export const PLATFORM_DEFAULT_PRICING: DriverPricing = {
    baseDistanceKm: 5,
    baseFee: 7,
    pricePerKmAfterBase: 2,
}

export interface DriverPricingRow {
    pricing_mode: PricingMode
    base_distance_km: number | null
    base_fee: number | null
    price_per_km_after_base: number | null
}

// Resolve a tarifa que vale de fato pra esse motorista, considerando o
// plano escolhido (plataforma ou própria).
export function getEffectivePricing(row: DriverPricingRow): DriverPricing {
    if (row.pricing_mode === 'platform') return PLATFORM_DEFAULT_PRICING
    return {
        baseDistanceKm: row.base_distance_km ?? PLATFORM_DEFAULT_PRICING.baseDistanceKm,
        baseFee: row.base_fee ?? PLATFORM_DEFAULT_PRICING.baseFee,
        pricePerKmAfterBase: row.price_per_km_after_base ?? PLATFORM_DEFAULT_PRICING.pricePerKmAfterBase,
    }
}

export function computeSuggestedPrice(distanceKm: number, pricing: DriverPricing): number {
    const extraKm = Math.max(0, distanceKm - pricing.baseDistanceKm)
    return pricing.baseFee + extraKm * pricing.pricePerKmAfterBase
}
