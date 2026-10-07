// src/lib/planRing.ts
//
// Quem ganha a moldura colorida (verde, amarelo e azul) no avatar: usuários no plano Pré-pago (inclui o brinde) e toda a
// hierarquia do administrador pra baixo. O resultado vem do RPC get_plan_ring_users, em lote
// (vários avatares na mesma tela viram UMA chamada) e com cache por sessão do navegador.
'use client'

import { supabase } from '@/lib/supabase/client'

const cache = new Map<string, boolean>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function flush() {
    timer = null
    const ids = Array.from(pending).slice(0, 200)
    ids.forEach((id) => pending.delete(id))
    if (ids.length === 0) return
    try {
        const { data, error } = await supabase.rpc('get_plan_ring_users', { p_ids: ids })
        if (error) throw error
        const ring = new Set<string>((data as string[]) || [])
        ids.forEach((id) => cache.set(id, ring.has(id)))
    } catch {
        // Função ainda não existe no banco (migration não rodou) ou falha de rede: sem moldura, sem erro.
        ids.forEach((id) => cache.set(id, false))
    }
    listeners.forEach((l) => l())
    if (pending.size > 0) schedule()
}

function schedule() {
    if (!timer) timer = setTimeout(flush, 40)
}

/** Pede (em lote) se esse usuário tem a moldura. Devolve o valor se já souber. */
export function requestPlanRing(userId: string | null | undefined): boolean | undefined {
    if (!userId || !UUID_RE.test(userId)) return false
    const known = cache.get(userId)
    if (known !== undefined) return known
    pending.add(userId)
    schedule()
    return undefined
}

export function subscribePlanRing(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** Depois de assinar/resgatar um plano, esquece o cache pra moldura aparecer na hora. */
export function resetPlanRingCache() {
    cache.clear()
    listeners.forEach((l) => l())
}
