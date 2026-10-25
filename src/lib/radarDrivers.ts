// src/lib/radarDrivers.ts
//
// Motoristas disponíveis agora, com o que o cliente precisa pra escolher (foto do veículo, nota, corridas, tarifa...): a fonte é a RPC
// `get_radar_drivers` (migration 20261120): só logado, posição APROXIMADA (grade de ~330 m), nunca placa/endereço/posição exata. Usada pelo
// filtro "Motoristas" do /radar e pelo mapa do /pedir-motorista (v3), com o mesmo card (components/radar/RadarDriverDetails).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DriverPricingRow } from '@/lib/driverPricing'
import { vehicleGlyphSvg } from '@/lib/vehicleMarkerIcon'
import { mountMapAvatarMarker } from '@/components/MapAvatarMarker'

export type RadarDriverKind = 'carro' | 'moto' | 'bicicleta'

export interface RadarDriverItem {
    id: string
    name: string
    profileSlug: string | null
    avatarUrl: string | null
    vehicleSlug: string
    kind: RadarDriverKind
    model: string
    color: string | null
    capacity: number | null
    babySeat: boolean
    services: string[]
    trunk: { bags: [number, number, number]; cases: [number, number, number] }
    rides: number
    rating: number | null
    ratingCount: number
    memberSince: string | null
    pricingRow: DriverPricingRow
    ageSeconds: number
    /** foto do veículo (marcador e cabeçalho do card) */
    photoUrl: string | null
    /** posição aproximada */
    lat: number
    lng: number
}

const KINDS: RadarDriverKind[] = ['carro', 'moto', 'bicicleta']

export function mapRadarDriverRows(client: SupabaseClient, rows: unknown): RadarDriverItem[] {
    if (!Array.isArray(rows)) return []
    const carPhoto = (p: string | null) => (p ? (p.startsWith('http') ? p : client.storage.from('driver-car-photos').getPublicUrl(p).data.publicUrl) : null)
    const avatar = (p: string | null) => (p ? (String(p).startsWith('http') ? p : client.storage.from('avatars').getPublicUrl(String(p).replace(/^avatars\//, '')).data.publicUrl) : null)
    const out: RadarDriverItem[] = []
    for (const d of rows as any[]) {
        const lat = Number(d?.lat)
        const lng = Number(d?.lng)
        if (!KINDS.includes(d?.vehicle_kind) || !d?.driver_id || !d?.vehicle_slug || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
        out.push({
            id: d.driver_id,
            name: d.name || (d.profile_slug ? `@${d.profile_slug}` : 'Motorista'),
            profileSlug: d.profile_slug || null,
            avatarUrl: avatar(d.avatar_url),
            vehicleSlug: d.vehicle_slug,
            kind: d.vehicle_kind,
            model: d.car_model || (d.vehicle_kind === 'moto' ? 'Moto' : d.vehicle_kind === 'bicicleta' ? 'Bicicleta' : 'Carro'),
            color: d.car_color || null,
            capacity: d.passenger_capacity ?? null,
            babySeat: !!d.has_baby_seat,
            services: Array.isArray(d.services) ? d.services : [],
            trunk: {
                bags: [d.trunk_bags_pequena || 0, d.trunk_bags_media || 0, d.trunk_bags_grande || 0],
                cases: [d.trunk_suitcases_pequena || 0, d.trunk_suitcases_media || 0, d.trunk_suitcases_grande || 0],
            },
            rides: Number(d.rides_completed) || 0,
            rating: d.rating_avg != null ? Number(d.rating_avg) : null,
            ratingCount: Number(d.rating_count) || 0,
            memberSince: d.member_since || null,
            pricingRow: {
                pricing_mode: d.pricing_mode || 'platform',
                base_distance_km: d.base_distance_km != null ? Number(d.base_distance_km) : null,
                base_fee: d.base_fee != null ? Number(d.base_fee) : null,
                price_per_km_after_base: d.price_per_km_after_base != null ? Number(d.price_per_km_after_base) : null,
            } as DriverPricingRow,
            ageSeconds: Math.max(0, Number(d.age_seconds) || 0),
            photoUrl: carPhoto(d.car_photo_url),
            lat,
            lng,
        })
    }
    return out
}

/** Busca os motoristas disponíveis perto de (lat, lng). Devolve `null` quando a consulta FALHA (sem login, rede, cota do Supabase):
 *  quem chama não deve confundir falha com "não há motoristas" (lista vazia). */
export async function fetchRadarDrivers(client: SupabaseClient, lat: number, lng: number, radiusKm = 30): Promise<RadarDriverItem[] | null> {
    try {
        const { data, error } = await client.rpc('get_radar_drivers', { p_lat: lat, p_lng: lng, p_radius_km: radiusKm })
        if (error) return null
        return mapRadarDriverRows(client, data)
    } catch {
        return null
    }
}

export function countDriversByKind(list: { kind: RadarDriverKind }[]): Record<RadarDriverKind, number> {
    const counts: Record<RadarDriverKind, number> = { carro: 0, moto: 0, bicicleta: 0 }
    for (const d of list) counts[d.kind]++
    return counts
}

/** Marcador de motorista no mapa (igual nos dois mapas): o avatar do perfil, redondo, com borda verde ("disponível agora"), o anel de borda
 *  que ele equipou e um selo do tipo de veículo. Devolve o elemento e como desmontar (chame ao remover o marcador). */
export function createDriverMarkerElement(d: Pick<RadarDriverItem, 'id' | 'photoUrl' | 'avatarUrl' | 'kind' | 'name'>, onClick: () => void): { el: HTMLElement; unmount: () => void } {
    const el = document.createElement('div')
    el.setAttribute('aria-label', `Motorista disponível: ${d.name}`)
    el.style.cursor = 'pointer'
    const host = document.createElement('div')
    host.style.cssText = 'transition:transform .25s cubic-bezier(.175,.885,.32,1.275);'
    host.onmouseenter = () => { host.style.transform = 'scale(1.12)' }
    host.onmouseleave = () => { host.style.transform = 'scale(1)' }
    el.appendChild(host)
    const unmount = mountMapAvatarMarker(host, {
        userId: d.id,
        imageUrl: d.avatarUrl || d.photoUrl,
        fallbackText: d.name,
        borderColor: '#22c55e',
        badgeSvg: vehicleGlyphSvg(d.kind, '#16a34a', 13),
    })
    el.onclick = (e) => { e.stopPropagation(); onClick() }
    return { el, unmount }
}
