// Quando cada perfil esteve online, só para os que deixaram essa informação visível pra quem está olhando
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { PresenceInfo } from '@/lib/lastSeen'

export function useLastSeen(ids: string[]) {
    const [map, setMap] = useState<Record<string, PresenceInfo>>({})
    const key = ids.join(',')

    useEffect(() => {
        if (ids.length === 0) { setMap({}); return }
        let cancelled = false
        supabase.rpc('get_last_seen_for', { p_ids: ids.slice(0, 200) }).then(({ data }) => {
            if (cancelled) return
            setMap(Object.fromEntries(((data as { profile_id: string; last_seen_at: string | null; online: boolean; appears_offline: boolean }[]) || []).map((r) => [r.profile_id, { at: r.last_seen_at, online: r.online, offline: r.appears_offline }])))
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    return map
}
