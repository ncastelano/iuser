// src/lib/outdoorCrowns.ts — as COROAS dos 3 primeiros do Outdoor iUser (pessoas), para qualquer avatar do app.
// Só as 3 primeiras posições ganham coroa (ouro, prata, bronze) e ela vale em qualquer lugar onde o avatar aparecer
// (PlanAvatarRing). Não há mais anel de medalha: a borda que a pessoa escolheu continua sendo a dela.
// Os 3 primeiros vêm de get_outdoor('pessoas') (loadOutdoor), uma vez, guardados por 5 min para todos os avatares.
import { useEffect, useReducer } from 'react'
import { loadOutdoor, medalOf, type Medal } from '@/modules/outdoor'

export const CROWN_COLOR: Record<Medal, string> = {
    gold: '#facc15',
    silver: '#cbd5e1',
    bronze: '#d97706',
}

const TTL_MS = 5 * 60_000
let crowns = new Map<string, Medal>()
let loadedAt = 0
let inflight: Promise<void> | null = null
const subs = new Set<() => void>()

function ensureLoaded() {
    if (inflight || Date.now() - loadedAt < TTL_MS) return
    inflight = loadOutdoor('pessoas', 3)
        .then((items) => {
            const next = new Map<string, Medal>()
            for (const it of items || []) {
                const m = medalOf(it.rank)
                if (m) next.set(it.id, m)
            }
            crowns = next
            loadedAt = Date.now()
        })
        .catch(() => { /* sem resposta: sem coroa, sem erro */ })
        .finally(() => {
            inflight = null
            subs.forEach((f) => f())
        })
}

/** A coroa desta pessoa (ouro/prata/bronze) ou null. */
export function useOutdoorCrown(userId?: string | null): Medal | null {
    const [, force] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
        subs.add(force)
        ensureLoaded()
        return () => { subs.delete(force) }
    }, [])
    return userId ? crowns.get(userId) ?? null : null
}
