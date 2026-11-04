// src/hooks/useMyOrigin.ts — ONDE a pessoa está, para mostrar distâncias: o endereço salvo no perfil (logada) ou o local definido neste aparelho (visitante, `iuser_device_location`).
// undefined = ainda carregando; null = sem local definido (as telas então não mostram distância, nunca inventam).
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const DEVICE_LOCATION_KEY = 'iuser_device_location'
export type Origin = { lat: number; lng: number }

export function useMyOrigin(userId: string | null | undefined): Origin | null | undefined {
    const [origin, setOrigin] = useState<Origin | null | undefined>(undefined)
    useEffect(() => {
        let cancelled = false
        const done = (o: Origin | null) => { if (!cancelled) setOrigin(o) }
        const fromDevice = () => {
            try {
                const p = JSON.parse(localStorage.getItem(DEVICE_LOCATION_KEY) || 'null')
                done(p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null)
            } catch { done(null) }
        }
        if (!userId) { fromDevice(); return () => { cancelled = true } }
        supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
            const r = data as { store_lat: number | null; store_lng: number | null } | null
            if (r?.store_lat != null && r?.store_lng != null) done({ lat: Number(r.store_lat), lng: Number(r.store_lng) })
            else fromDevice()   // perfil sem local: vale o que a pessoa definiu neste aparelho, se houver
        })
        return () => { cancelled = true }
    }, [userId])
    return origin
}
