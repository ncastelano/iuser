// src/lib/driverPricing.ts

export interface DriverPricing {
    baseDistanceKm: number
    baseFee: number
    pricePerKmAfterBase: number
}

export function computeSuggestedPrice(distanceKm: number, pricing: DriverPricing): number {
    const extraKm = Math.max(0, distanceKm - pricing.baseDistanceKm)
    return pricing.baseFee + extraKm * pricing.pricePerKmAfterBase
}
