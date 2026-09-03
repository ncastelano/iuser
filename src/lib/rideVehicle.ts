// src/lib/rideVehicle.ts

export type VehicleType = 'carro' | 'van' | 'van-grande'

export function getVehicleTypeForPassengers(count: number): VehicleType {
    if (count <= 4) return 'carro'
    if (count <= 8) return 'van'
    return 'van-grande'
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
    carro: 'Carro de passeio',
    van: 'Van / Kombi',
    'van-grande': 'Van grande / Micro-ônibus',
}
