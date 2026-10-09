// Quando cada perfil esteve online, só para os que deixaram essa informação visível pra quem está olhando
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useLastSeen(ids: string[]) {
    const [map, setMap] = useState<Record<string, string>>({})
    const key = ids.join(',')

    useEffect(() => {
        if (ids.length === 0) { setMap({}); return }
        let cancelled = false
        supabase.rpc('get_last_seen_for', { p_ids: ids.slice(0, 200) }).then(({ data }) => {
            if (cancelled) return
            setMap(Object.fromEntries(((data as { profile_id: string; last_seen_at: string }[]) || []).map((r) => [r.profile_id, r.last_seen_at])))
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    return map
}
