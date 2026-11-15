// src/modules/store-levels/load.ts — lê a escada de níveis (tabela pública `store_levels`) uma vez e guarda por alguns minutos.
import { supabase } from '@/lib/supabase/client'
import { DEFAULT_STORE_LEVELS, levelsFromRows, type StoreLevel } from './domain'

const TTL_MS = 10 * 60_000
let cache: { at: number; levels: StoreLevel[] } | null = null
let inflight: Promise<StoreLevel[]> | null = null

/** Sempre devolve uma escada (a de fábrica se a leitura falhar): a moldura nunca depende de a consulta dar certo. */
export function cachedStoreLevels(): StoreLevel[] { return cache?.levels ?? DEFAULT_STORE_LEVELS }

export async function loadStoreLevels(): Promise<StoreLevel[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.levels
    if (inflight) return inflight
    inflight = (async () => {
        const { data, error } = await supabase.from('store_levels').select('level, name, min_points, colors, animated, description').order('level')
        const levels = error ? DEFAULT_STORE_LEVELS : levelsFromRows(data)
        if (!error) cache = { at: Date.now(), levels }
        return levels
    })().finally(() => { inflight = null })
    return inflight
}
