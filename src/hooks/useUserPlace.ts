// Cidade, estado e país da pessoa a partir do local salvo. Guarda no aparelho por coordenada (arredondada)
// pra não consultar o Mapbox a cada visita.
'use client'

import { useEffect, useState } from 'react'
import { getPlaceFromCoords, type PlaceInfo } from '@/lib/geo'

export function useUserPlace(origin: { lat: number; lng: number } | null | undefined) {
    const [place, setPlace] = useState<PlaceInfo | null>(null)
    const [resolving, setResolving] = useState(false)

    useEffect(() => {
        if (!origin) { setPlace(null); setResolving(false); return }
        const key = `iuser_place_${origin.lat.toFixed(2)}_${origin.lng.toFixed(2)}`
        try {
            const cached = localStorage.getItem(key)
            if (cached) { setPlace(JSON.parse(cached)); setResolving(false); return }
        } catch { /* ok */ }
        let cancelled = false
        setResolving(true)
        getPlaceFromCoords(origin.lat, origin.lng).then((p) => {
            if (cancelled) return
            setPlace(p)
            if (p) { try { localStorage.setItem(key, JSON.stringify(p)) } catch { /* ok */ } }
        }).finally(() => { if (!cancelled) setResolving(false) })
        return () => { cancelled = true }
    }, [origin?.lat, origin?.lng])

    return { place, resolving }
}
