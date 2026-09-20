// src/lib/driverPricing.ts

import type { VehicleKind } from './rideVehicle'

export type PricingMode = 'platform' | 'custom'
export type RideRequestType = 'pessoa' | 'animal' | 'objeto'

export interface DriverExtraFees {
    pessoa: number
    animal: number
    objeto: number
}

export interface DriverConditionExtraFees {
    condominio: number
    compras: number
    necessidade_especial: number
    pet_sem_caixa: number
    entrega_interna: number
    ar_condicionado: number
}

export interface DriverPricing {
    baseDistanceKm: number
    baseFee: number
    pricePerKmAfterBase: number
    extraFees: DriverExtraFees
    conditionExtraFees: DriverConditionExtraFees
}

// Flags da corrida que podem gerar cobrança extra por condição — um
// subconjunto de campos de ride_requests, todos opcionais pra aceitar
// tanto uma linha real do banco quanto um preview local (painel do
// motorista, formulário de pedido antes de salvar).
export interface RideConditionFlags {
    origin_needs_access?: boolean | null
    destination_needs_access?: boolean | null
    is_grocery_shopping?: boolean | null
    has_special_needs?: boolean | null
    special_needs_wheelchair?: boolean | null
    special_needs_visual_impairment?: boolean | null
    has_guide_dog?: boolean | null
    pet_has_carrier?: boolean | null
    delivery_location?: 'portaria' | 'area_interna' | 'apartamento' | null
    wants_air_conditioning?: boolean | null
}

// Tarifa padrão da plataforma — usada por quem escolhe não definir a
// própria tarifa em /painel-motorista, e pra estimativa mostrada ao
// passageiro em /pedir-motorista (antes de qualquer motorista se
// candidatar, não há tarifa própria pra usar ainda).
export const PLATFORM_DEFAULT_EXTRA_FEES: DriverExtraFees = {
    pessoa: 0,
    animal: 5,
    objeto: 3,
}

export const PLATFORM_DEFAULT_CONDITION_EXTRA_FEES: DriverConditionExtraFees = {
    condominio: 1,
    compras: 1,
    necessidade_especial: 1,
    pet_sem_caixa: 1,
    entrega_interna: 1,
    ar_condicionado: 1,
}

// Tarifa padrão por tipo de veículo — moto e bicicleta têm a mesma tarifa,
// mais barata que a de carro (base menor, km rodado mais barato), mesma estrutura de
// extras (pessoa/animal/objeto e condições) em todas.
export const PLATFORM_DEFAULT_PRICING_BY_VEHICLE: Record<VehicleKind, DriverPricing> = {
    carro: {
        baseDistanceKm: 5,
        baseFee: 7,
        pricePerKmAfterBase: 2,
        extraFees: PLATFORM_DEFAULT_EXTRA_FEES,
        conditionExtraFees: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES,
    },
    moto: {
        baseDistanceKm: 5,
        baseFee: 5,
        pricePerKmAfterBase: 1.5,
        extraFees: PLATFORM_DEFAULT_EXTRA_FEES,
        conditionExtraFees: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES,
    },
    bicicleta: {
        baseDistanceKm: 5,
        baseFee: 5,
        pricePerKmAfterBase: 1.5,
        extraFees: PLATFORM_DEFAULT_EXTRA_FEES,
        conditionExtraFees: PLATFORM_DEFAULT_CONDITION_EXTRA_FEES,
    },
}

// Alias pra compatibilidade com código existente que ainda não passa o
// tipo de veículo — sempre a tarifa de carro.
export const PLATFORM_DEFAULT_PRICING: DriverPricing = PLATFORM_DEFAULT_PRICING_BY_VEHICLE.carro

export interface DriverPricingRow {
    pricing_mode: PricingMode
    base_distance_km: number | null
    base_fee: number | null
    price_per_km_after_base: number | null
    extra_fee_pessoa?: number | null
    extra_fee_animal?: number | null
    extra_fee_objeto?: number | null
    extra_fee_condominio?: number | null
    extra_fee_compras?: number | null
    extra_fee_necessidade_especial?: number | null
    extra_fee_pet_sem_caixa?: number | null
    extra_fee_entrega_interna?: number | null
    extra_fee_ar_condicionado?: number | null
}

// Resolve a tarifa que vale de fato pra esse motorista, considerando o
// plano escolhido (plataforma ou própria) e o veículo cadastrado (só
// importa no modo plataforma — tarifa própria é uma só, independente do
// veículo, já que driver_pricing é uma linha por motorista).
export function getEffectivePricing(row: DriverPricingRow, vehicleKind: VehicleKind = 'carro'): DriverPricing {
    const platformDefault = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[vehicleKind]
    if (row.pricing_mode === 'platform') return platformDefault
    return {
        baseDistanceKm: row.base_distance_km ?? platformDefault.baseDistanceKm,
        baseFee: row.base_fee ?? platformDefault.baseFee,
        pricePerKmAfterBase: row.price_per_km_after_base ?? platformDefault.pricePerKmAfterBase,
        extraFees: {
            pessoa: row.extra_fee_pessoa ?? PLATFORM_DEFAULT_EXTRA_FEES.pessoa,
            animal: row.extra_fee_animal ?? PLATFORM_DEFAULT_EXTRA_FEES.animal,
            objeto: row.extra_fee_objeto ?? PLATFORM_DEFAULT_EXTRA_FEES.objeto,
        },
        conditionExtraFees: {
            condominio: row.extra_fee_condominio ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.condominio,
            compras: row.extra_fee_compras ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.compras,
            necessidade_especial: row.extra_fee_necessidade_especial ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.necessidade_especial,
            pet_sem_caixa: row.extra_fee_pet_sem_caixa ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.pet_sem_caixa,
            entrega_interna: row.extra_fee_entrega_interna ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.entrega_interna,
            ar_condicionado: row.extra_fee_ar_condicionado ?? PLATFORM_DEFAULT_CONDITION_EXTRA_FEES.ar_condicionado,
        },
    }
}

// Soma as cobranças extras que valem pra essa corrida específica, conforme
// as condições marcadas no pedido. Condomínio pode contar em dobro (origem
// e destino precisando de acesso, cada um soma o valor uma vez).
export function computeConditionExtras(ride: RideConditionFlags, fees: DriverConditionExtraFees): number {
    let total = 0
    if (ride.origin_needs_access) total += fees.condominio
    // Pra corrida de objeto, destination_needs_access é derivado de
    // delivery_location (entrega fora da portaria) - já é cobrado como
    // "entrega_interna" abaixo, não conta condomínio de novo pro mesmo caso.
    if (ride.destination_needs_access && !ride.delivery_location) total += fees.condominio
    if (ride.is_grocery_shopping) total += fees.compras
    if (ride.has_special_needs || ride.special_needs_wheelchair || ride.special_needs_visual_impairment || ride.has_guide_dog) {
        total += fees.necessidade_especial
    }
    if (ride.pet_has_carrier === false) total += fees.pet_sem_caixa
    if (ride.delivery_location && ride.delivery_location !== 'portaria') total += fees.entrega_interna
    if (ride.wants_air_conditioning) total += fees.ar_condicionado
    return total
}

// rideType e ride são opcionais pra permitir uma prévia genérica (sem
// corrida real associada, ex: painel-motorista) — nesse caso nenhum valor
// extra entra.
export function computeSuggestedPrice(
    distanceKm: number,
    pricing: DriverPricing,
    rideType?: RideRequestType,
    ride?: RideConditionFlags
): number {
    const extraKm = Math.max(0, distanceKm - pricing.baseDistanceKm)
    const rideTypeExtra = rideType ? pricing.extraFees[rideType] : 0
    const conditionExtra = ride ? computeConditionExtras(ride, pricing.conditionExtraFees) : 0
    return pricing.baseFee + extraKm * pricing.pricePerKmAfterBase + rideTypeExtra + conditionExtra
}

// "Minha tarifa": os valores próprios que o motorista deixou salvos, mesmo
// quando o modo padrão dele é a tarifa iUser. Null se ele nunca salvou.
export function getCustomPricing(row: DriverPricingRow, vehicleKind: VehicleKind = 'carro'): DriverPricing | null {
    if (row.base_fee == null) return null
    return getEffectivePricing({ ...row, pricing_mode: 'custom' }, vehicleKind)
}
