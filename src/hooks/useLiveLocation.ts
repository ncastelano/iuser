// Posição em tempo real de um perfil (aproximada) — só vem quando a pessoa ligou "Localização em tempo real" e mostra a localização no perfil
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useLiveLocation(profileId: string | null | undefined) {
    const [live, setLive] = useState<{ lat: number; lng: number; updated_at: string } | null>(null)
    useEffect(() => {
        if (!profileId) { setLive(null); return }
        let cancelled = false
        supabase.rpc('get_live_location_for', { p_ids: [profileId] }).then(({ data }) => {
            if (cancelled) return
            const row = (data as { lat: number; lng: number; updated_at: string }[] | null)?.[0]
            setLive(row || null)
        })
        return () => { cancelled = true }
    }, [profileId])
    return live
}
