// src/lib/vehicleName.ts — como o veículo aparece no app: "Marca Modelo" e, quando houver, a placa ("Toyota Etios · ABC1D23").
// Uma conta só para todas as telas. Aceita a linha do banco (car_brand/car_model/car_plate) e os campos de tela (brand/model/plate).
export interface VehicleNameParts {
    car_brand?: string | null; car_model?: string | null; car_plate?: string | null
    brand?: string | null; model?: string | null; plate?: string | null
}

const pick = (v: VehicleNameParts) => ({
    brand: (v.car_brand ?? v.brand ?? '').trim(),
    model: (v.car_model ?? v.model ?? '').trim(),
    plate: (v.car_plate ?? v.plate ?? '').trim().toUpperCase(),
})

/** "Marca Modelo" (sem placa). Sem marca, só o modelo; sem nenhum, o fallback. */
export function vehicleName(v: VehicleNameParts, fallback = 'Veículo'): string {
    const { brand, model } = pick(v)
    return [brand, model].filter(Boolean).join(' ') || fallback
}

/** "Marca Modelo · PLACA" (a placa em maiúsculas, quando houver). */
export function vehicleFullName(v: VehicleNameParts, fallback = 'Veículo'): string {
    const { plate } = pick(v)
    return [vehicleName(v, ''), plate].filter(Boolean).join(' · ') || fallback
}
