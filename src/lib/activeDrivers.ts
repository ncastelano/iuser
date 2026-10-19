// Motoristas ativos no mapa do /pedir-motorista (interface 3.0). A fonte é a RPC `get_active_drivers_map` (migration 20261108): só tipo de
// veículo + posição APROXIMADA (grade de ~330 m) + idade da posição, nunca identidade. Aqui só validamos e contamos.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VehicleKind } from '@/lib/rideVehicle'

export interface ActiveDriver {
    kind: VehicleKind
    lat: number
    lng: number
    ageSeconds: number
}

export const ACTIVE_DRIVER_KINDS: VehicleKind[] = ['carro', 'moto', 'bicicleta']

export function parseActiveDrivers(rows: unknown): ActiveDriver[] {
    if (!Array.isArray(rows)) return []
    const out: ActiveDriver[] = []
    for (const r of rows as Array<Record<string, unknown>>) {
        const kind = r?.kind
        const lat = Number(r?.lat)
        const lng = Number(r?.lng)
        if (!ACTIVE_DRIVER_KINDS.includes(kind as VehicleKind) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue
        out.push({ kind: kind as VehicleKind, lat, lng, ageSeconds: Math.max(0, Number(r?.age_seconds) || 0) })
    }
    return out
}

export function countByKind(list: ActiveDriver[]): Record<VehicleKind, number> {
    const counts: Record<VehicleKind, number> = { carro: 0, moto: 0, bicicleta: 0 }
    for (const d of list) counts[d.kind]++
    return counts
}

/** Busca os motoristas ativos perto de (lat, lng). Qualquer falha (sem login, rede, cota do Supabase) devolve lista vazia: o mapa só fica sem eles. */
export async function fetchActiveDrivers(client: SupabaseClient, lat: number, lng: number, radiusKm = 30): Promise<ActiveDriver[]> {
    try {
        const { data, error } = await client.rpc('get_active_drivers_map', { p_lat: lat, p_lng: lng, p_radius_km: radiusKm })
        if (error) return []
        return parseActiveDrivers(data)
    } catch {
        return []
    }
}
