// Os últimos perfis visitados a partir do Social (guardados só neste aparelho). Aparecem ao tocar na busca, sem texto.
'use client'

import { useCallback, useEffect, useState } from 'react'

export interface RecentProfile { id: string; name: string; profileSlug: string; avatar_url: string | null }

const KEY = 'social_recent_profiles'
const MAX = 5

const read = (): RecentProfile[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
        return Array.isArray(parsed) ? parsed.slice(0, MAX) : []
    } catch { return [] }
}
const write = (list: RecentProfile[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* sem armazenamento: só não lembra */ } }

export function useRecentProfiles() {
    const [recent, setRecent] = useState<RecentProfile[]>([])
    useEffect(() => { setRecent(read()) }, [])

    const reload = useCallback(() => setRecent(read()), [])
    const save = useCallback((p: RecentProfile) => {
        const next = [{ id: p.id, name: p.name, profileSlug: p.profileSlug, avatar_url: p.avatar_url }, ...read().filter((r) => r.id !== p.id)].slice(0, MAX)
        write(next); setRecent(next)
    }, [])
    const remove = useCallback((id: string) => { const next = read().filter((r) => r.id !== id); write(next); setRecent(next) }, [])
    const clear = useCallback(() => { try { localStorage.removeItem(KEY) } catch { /* nada */ } setRecent([]) }, [])

    return { recent, reload, save, remove, clear }
}
