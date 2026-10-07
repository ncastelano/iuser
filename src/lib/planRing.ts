// src/lib/planRing.ts
//
// Borda do avatar (a que a pessoa está usando): vem do RPC get_avatar_borders_for, em lote (vários
// avatares na mesma tela viram UMA chamada) e com cache pela sessão do navegador. O valor é a lista de
// cores da borda, ou null se a pessoa não usa nenhuma.
'use client'

import { supabase } from '@/lib/supabase/client'

const cache = new Map<string, string[] | null>()
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
        const { data, error } = await supabase.rpc('get_avatar_borders_for', { p_ids: ids })
        if (error) throw error
        const byId = new Map<string, string[]>((data as { profile_id: string; colors: string[] }[] || []).map((r) => [r.profile_id, r.colors]))
        ids.forEach((id) => cache.set(id, byId.get(id) || null))
    } catch {
        // Função ainda não existe no banco (migration não rodou) ou falha de rede: sem borda, sem erro.
        ids.forEach((id) => cache.set(id, null))
    }
    listeners.forEach((l) => l())
    if (pending.size > 0) schedule()
}

function schedule() {
    if (!timer) timer = setTimeout(flush, 40)
}

/** Pede (em lote) a borda desse usuário. Devolve o valor se já souber (null = sem borda). */
export function requestAvatarBorder(userId: string | null | undefined): string[] | null | undefined {
    if (!userId || !UUID_RE.test(userId)) return null
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

/** Depois de trocar de borda (ou ela ser concedida), esquece o cache pra mudança aparecer na hora. */
export function resetPlanRingCache(userId?: string) {
    if (userId) cache.delete(userId)
    else cache.clear()
    listeners.forEach((l) => l())
}

/** Cores → gradiente cônico que fecha voltando à primeira cor. */
export function borderGradient(colors: string[]): string {
    const n = colors.length
    const stops = [...colors, colors[0]].map((c, i) => `${c} ${Math.round((i / n) * 360)}deg`)
    return `conic-gradient(from 0deg, ${stops.join(', ')})`
}
