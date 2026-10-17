// src/lib/deliveryDistance.ts
//
// Server-only: distância de ROTA (Mapbox Directions) e conferência do endereço (Mapbox Geocoding) para a estimativa do frete.
// Usa o MESMO serviço Mapbox e o MESMO token que o app já usa (cobrado por uso, listado em service_expenses): nenhum serviço
// novo. Se o Mapbox falhar, a estimativa cai na linha reta (marcada no snapshot como 'straight_line'), nunca inventa valor.
import { supabaseAdmin } from '@/lib/supabase/admin'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const TIMEOUT_MS = 5000

function track(metric: 'directions' | 'geocoding') {
    // Telemetria de uso (aproximada, fire-and-forget): mesma tabela que o navegador alimenta.
    Promise.resolve(supabaseAdmin.rpc('track_service_usage', { p_service: 'mapbox', p_metric: metric })).catch(() => {})
}

async function getJson(url: string): Promise<any | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

/** Distância de rota de carro (metros) entre dois pontos, ou null se o serviço não respondeu. */
export async function fetchRouteDistanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<number | null> {
    if (!TOKEN) return null
    track('directions')
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${TOKEN}`
    const json = await getJson(url)
    const meters = json?.routes?.[0]?.distance
    return typeof meters === 'number' && Number.isFinite(meters) && meters >= 0 ? Math.round(meters) : null
}

/** Ponto do endereço informado (geocodificação do servidor), perto da loja; null se não achar. */
export async function geocodeAddressNear(address: string, near: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
    if (!TOKEN) return null
    track('geocoding')
    const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
        `?country=BR&limit=1&proximity=${near.lng},${near.lat}&access_token=${TOKEN}`
    const json = await getJson(url)
    const c = json?.features?.[0]?.center
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null
    return { lat: c[1], lng: c[0] }
}
