// src/hooks/useProfilesById.ts
//
// Nome, @ e foto ATUAIS de uma lista de perfis (id → pessoa), buscados de uma vez e com cache pela sessão.
// Agendamentos guardam só uma cópia da foto (customer_avatar_url) do dia em que foram criados, que fica velha
// ou até é de outra pessoa; a agenda usa este hook pra sempre mostrar a foto de hoje de quem está no card.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'

export interface PersonInfo {
    id: string
    name: string | null
    profileSlug: string | null
    avatarUrl: string | null
}

const cache = new Map<string, PersonInfo | null>()
const inflight = new Set<string>()

export function useProfilesById(ids: (string | null | undefined)[]): Map<string, PersonInfo> {
    const key = useMemo(() => Array.from(new Set(ids.filter((i): i is string => !!i))).sort().join(','), [ids])
    const [version, bump] = useState(0)

    useEffect(() => {
        const missing = key ? key.split(',').filter((id) => !cache.has(id) && !inflight.has(id)) : []
        if (missing.length === 0) return
        missing.forEach((id) => inflight.add(id))
        let cancelled = false
        supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url')
            .in('id', missing)
            .then(({ data, error }) => {
                missing.forEach((id) => inflight.delete(id))
                if (error) return // sem cache: tenta de novo na próxima montagem
                const found = new Map((data || []).map((p) => [p.id as string, p]))
                missing.forEach((id) => {
                    const p = found.get(id)
                    cache.set(id, p ? { id, name: p.name ?? null, profileSlug: p.profileSlug ?? null, avatarUrl: getAvatarUrl(supabase, p.avatar_url) || null } : null)
                })
                if (!cancelled) bump((n) => n + 1)
            })
        return () => { cancelled = true }
    }, [key])

    return useMemo(() => {
        const m = new Map<string, PersonInfo>()
        key.split(',').forEach((id) => {
            const p = id ? cache.get(id) : null
            if (p) m.set(id, p)
        })
        return m
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version])
}
