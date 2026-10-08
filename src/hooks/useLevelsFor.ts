// src/hooks/useLevelsFor.ts
//
// Selo/borda de graduação de várias pessoas de uma vez (RPC get_levels_for, só aparência — nenhum percentual),
// com cache pela sessão. Usado onde a graduação aparece junto da pessoa: membros da rede, perfil, ganhos...
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { LevelVisual } from '@/lib/graduation'

const cache = new Map<string, LevelVisual | null>()
const inflight = new Set<string>()

export function useLevelsFor(ids: (string | null | undefined)[]): Map<string, LevelVisual> {
    const key = useMemo(() => Array.from(new Set(ids.filter((i): i is string => !!i))).sort().join(','), [ids])
    const [version, bump] = useState(0)

    useEffect(() => {
        const missing = key ? key.split(',').filter((id) => !cache.has(id) && !inflight.has(id)) : []
        if (missing.length === 0) return
        missing.forEach((id) => inflight.add(id))
        let cancelled = false
        supabase.rpc('get_levels_for', { p_ids: missing.slice(0, 200) }).then(({ data, error }) => {
            missing.forEach((id) => inflight.delete(id))
            if (error) return // sem a migration/rede: sem selo, sem erro
            const byId = new Map<string, any>((data || []).map((r: any) => [r.user_id, r]))
            missing.forEach((id) => {
                const r = byId.get(id)
                cache.set(id, r ? {
                    name: r.level_name, border_style: r.border_style, border_color: r.border_color, border_colors: r.border_colors || [],
                    background_style: r.background_style, badge_style: r.badge_style, icon: r.icon,
                } : null)
            })
            if (!cancelled) bump((n) => n + 1)
        })
        return () => { cancelled = true }
    }, [key])

    return useMemo(() => {
        const m = new Map<string, LevelVisual>()
        key.split(',').forEach((id) => { const v = id ? cache.get(id) : null; if (v) m.set(id, v) })
        return m
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version])
}
