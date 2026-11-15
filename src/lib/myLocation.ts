// src/lib/myLocation.ts — o LOCAL da pessoa (de onde se mede "perto"): logada = o endereço salvo no perfil (my_profile, colunas privadas);
// visitante = o local definido neste aparelho (localStorage). Quem muda o local avisa (`iuser-location-changed`) e quem mede distância relê.
'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { saveOwnProfile } from '@/lib/saveOwnProfile'

export const DEVICE_LOCATION_KEY = 'iuser_device_location'
export const LOCATION_CHANGED_EVENT = 'iuser-location-changed'

export interface MyLocation { lat: number; lng: number; address: string; addressNumber: string; addressComplement: string }

export async function loadMyLocation(client: SupabaseClient, userId: string | null): Promise<MyLocation | null> {
    if (!userId) {
        try {
            const p = JSON.parse(localStorage.getItem(DEVICE_LOCATION_KEY) || 'null')
            return p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
                ? { lat: p.lat, lng: p.lng, address: p.address || 'Local definido', addressNumber: p.addressNumber || '', addressComplement: p.addressComplement || '' }
                : null
        } catch { return null }
    }
    const { data } = await client.from('my_profile').select('address, address_number, address_complement, store_lat, store_lng').eq('id', userId).maybeSingle()
    const r = data as { address: string | null; address_number: string | null; address_complement: string | null; store_lat: number | null; store_lng: number | null } | null
    if (r?.store_lat == null || r?.store_lng == null) return null
    return { lat: Number(r.store_lat), lng: Number(r.store_lng), address: r.address || 'Local salvo', addressNumber: r.address_number || '', addressComplement: r.address_complement || '' }
}

/** Grava o local (perfil ou aparelho) e avisa a página. Devolve a mensagem de erro, ou null. */
export async function saveMyLocation(client: SupabaseClient, userId: string | null, loc: MyLocation): Promise<string | null> {
    if (!userId) {
        try { localStorage.setItem(DEVICE_LOCATION_KEY, JSON.stringify(loc)) } catch { /* sem storage: vale só até recarregar */ }
    } else {
        const { error } = await saveOwnProfile(client, userId, {
            address: loc.address, address_number: loc.addressNumber || null, address_complement: loc.addressComplement || null,
            store_lat: loc.lat, store_lng: loc.lng,
        })
        if (error) return error.message
    }
    window.dispatchEvent(new Event(LOCATION_CHANGED_EVENT))
    return null
}

export async function clearMyLocation(client: SupabaseClient, userId: string | null): Promise<string | null> {
    if (!userId) {
        try { localStorage.removeItem(DEVICE_LOCATION_KEY) } catch { /* ok */ }
    } else {
        const { error } = await client.from('profiles').update({ address: null, address_number: null, address_complement: null, store_lat: null, store_lng: null }).eq('id', userId)
        if (error) return error.message
    }
    window.dispatchEvent(new Event(LOCATION_CHANGED_EVENT))
    return null
}

/** "Rua das Orquídeas, Lagoa" — o começo do endereço, sem número, CEP nem país (para o chip da home) */
export function shortPlace(address: string): string {
    const parts = address.split(',')
        .map((p) => p.trim().replace(/\s+(n[º°o.]?\s*)?\d+[a-z]?$/i, ''))   // "Rua das Orquídeas 5644" → "Rua das Orquídeas" (sem o número da casa)
        .filter((p) => p && !/^\d+[a-z]?$/i.test(p) && !/^\d{5}-?\d{3}$/.test(p) && !/^brasil$/i.test(p))
    return parts.slice(0, 2).join(', ') || address
}
