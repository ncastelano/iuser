// src/lib/rideVehicle.ts

export type VehicleType = 'carro' | 'van' | 'van-grande' | 'moto' | 'bicicleta'

// O que o motorista cadastra em painel-motorista (o veículo que ele tem).
// Carro cobre também van/van-grande — são classes de capacidade do mesmo
// veículo, não tipos diferentes de cadastro.
export type VehicleKind = 'carro' | 'moto' | 'bicicleta'

export function getVehicleTypeForPassengers(count: number): VehicleType {
    if (count <= 4) return 'carro'
    if (count <= 8) return 'van'
    return 'van-grande'
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
    carro: 'Carro de passeio',
    van: 'Van / Kombi',
    'van-grande': 'Van grande / Micro-ônibus',
    moto: 'Moto',
    bicicleta: 'Bicicleta',
}

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
    carro: 'Carro',
    moto: 'Moto',
    bicicleta: 'Bicicleta',
}

// Quais tipos de corrida (vehicle_type de ride_requests) um motorista com
// esse veículo cadastrado pode ver/aceitar em /aceitar-corridas.
export function ridesAcceptableForVehicleKind(kind: VehicleKind): VehicleType[] {
    if (kind === 'carro') return ['carro', 'van', 'van-grande']
    if (kind === 'moto') return ['moto']
    return ['bicicleta']
}

// Tipo de veículo cadastrado que atende um tipo de corrida (van e van-grande
// são classes de capacidade do veículo "carro").
export function kindForRideType(type: VehicleType): VehicleKind {
    if (type === 'moto' || type === 'bicicleta') return type
    return 'carro'
}
