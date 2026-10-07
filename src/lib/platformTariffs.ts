// src/lib/platformTariffs.ts
//
// A Tarifa da plataforma mora no banco (tabela platform_tariffs, editada em
// Admin → Tarifas). Os valores de driverPricing.ts são só o padrão de
// fábrica: enquanto a tabela não carrega (ou não existe ainda), valem eles.
// Quando carrega, os valores são aplicados POR CIMA do próprio objeto
// PLATFORM_DEFAULT_PRICING_BY_VEHICLE — assim todo código que já lê esse
// objeto passa a usar a tarifa do admin sem mudar nada.
import {
    PLATFORM_DEFAULT_PRICING_BY_VEHICLE,
    type DriverConditionExtraFees,
    type DriverExtraFees,
} from '@/lib/driverPricing'
import type { VehicleKind } from '@/lib/rideVehicle'

export interface PlatformTariffRow {
    vehicle_kind: VehicleKind
    base_distance_km: number
    base_fee: number
    price_per_km: number
    extra_fee_pessoa: number
    extra_fee_animal: number
    extra_fee_objeto: number
    fee_condominio: number
    fee_compras: number
    fee_necessidade_especial: number
    fee_pet_sem_caixa: number
    fee_entrega_interna: number
    fee_ar_condicionado: number
}

export const PLATFORM_TARIFF_COLUMNS =
    'vehicle_kind, base_distance_km, base_fee, price_per_km, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, fee_condominio, fee_compras, fee_necessidade_especial, fee_pet_sem_caixa, fee_entrega_interna, fee_ar_condicionado'

export function applyPlatformTariffRows(rows: PlatformTariffRow[]) {
    for (const row of rows) {
        const shape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[row.vehicle_kind]
        if (!shape) continue
        const num = (v: unknown, fallback: number) => (v == null || Number.isNaN(Number(v)) ? fallback : Number(v))
        shape.baseDistanceKm = num(row.base_distance_km, shape.baseDistanceKm)
        shape.baseFee = num(row.base_fee, shape.baseFee)
        shape.pricePerKmAfterBase = num(row.price_per_km, shape.pricePerKmAfterBase)
        const extraFees: DriverExtraFees = {
            pessoa: num(row.extra_fee_pessoa, shape.extraFees.pessoa),
            animal: num(row.extra_fee_animal, shape.extraFees.animal),
            objeto: num(row.extra_fee_objeto, shape.extraFees.objeto),
        }
        const conditionExtraFees: DriverConditionExtraFees = {
            condominio: num(row.fee_condominio, shape.conditionExtraFees.condominio),
            compras: num(row.fee_compras, shape.conditionExtraFees.compras),
            necessidade_especial: num(row.fee_necessidade_especial, shape.conditionExtraFees.necessidade_especial),
            pet_sem_caixa: num(row.fee_pet_sem_caixa, shape.conditionExtraFees.pet_sem_caixa),
            entrega_interna: num(row.fee_entrega_interna, shape.conditionExtraFees.entrega_interna),
            ar_condicionado: num(row.fee_ar_condicionado, shape.conditionExtraFees.ar_condicionado),
        }
        shape.extraFees = extraFees
        shape.conditionExtraFees = conditionExtraFees
    }
}

const TTL_MS = 60_000
let loadedAt = 0
let inflight: Promise<void> | null = null

// Carrega (no máximo 1x por minuto) e aplica a tarifa do banco. Aceita o client do
// navegador ou o supabaseAdmin do servidor. Nunca lança: sem a tabela, ou com erro de
// rede, ficam os valores padrão.
export async function loadPlatformTariffs(client: { from: (table: string) => any }, force = false): Promise<void> {
    if (!force && Date.now() - loadedAt < TTL_MS) return
    if (inflight) return inflight
    inflight = (async () => {
        try {
            const { data, error } = await client.from('platform_tariffs').select(PLATFORM_TARIFF_COLUMNS)
            if (!error && data) {
                applyPlatformTariffRows(data as PlatformTariffRow[])
                loadedAt = Date.now()
            }
        } catch {
            // segue com os valores atuais
        } finally {
            inflight = null
        }
    })()
    return inflight
}
