// src/modules/search/load.ts — fala com o banco (tendências, registro de busca) e guarda o histórico neste aparelho.
import { supabase } from '@/lib/supabase/client'
import { addRecent, isRecordable, parseRecent, removeRecent, trendFromRow, type Trend, type TrendScope } from './domain'

const RECENT_KEY = 'iuser_recent_searches'
const TTL_MS = 60_000
const cache = new Map<TrendScope, { at: number; items: Trend[] }>()

/** O que está em alta (null = não deu para carregar; a tela só esconde a lista) */
export async function loadTrends(scope: TrendScope, limit = 8): Promise<Trend[] | null> {
    const hit = cache.get(scope)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.items
    const { data, error } = await supabase.rpc('get_search_trends', { p_scope: scope, p_limit: limit })
    if (error || !Array.isArray(data)) return null
    const items = data.map(trendFromRow).filter((t): t is Trend => !!t)
    cache.set(scope, { at: Date.now(), items })
    return items
}

export function getRecent(): string[] {
    try { return parseRecent(localStorage.getItem(RECENT_KEY)) } catch { return [] }
}
function setRecent(list: string[]) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* sem armazenamento: o histórico só não fica */ }
}

/** Uma busca valeu (Enter, toque numa sugestão ou parou de digitar): vai para o histórico do aparelho e, logada, para o banco */
export function recordSearch(term: string, loggedIn: boolean): string[] {
    if (!isRecordable(term)) return getRecent()
    const next = addRecent(getRecent(), term)
    setRecent(next)
    if (loggedIn) void supabase.rpc('log_search', { p_term: term }).then(() => undefined, () => undefined)   // nunca atrapalha a busca
    return next
}

export function forgetSearch(term: string): string[] {
    const next = removeRecent(getRecent(), term)
    setRecent(next)
    return next
}

/** "Limpar": apaga o histórico do aparelho e, logada, as buscas dela no banco */
export function clearSearches(loggedIn: boolean): string[] {
    setRecent([])
    cache.clear()
    if (loggedIn) void supabase.rpc('clear_my_searches').then(() => undefined, () => undefined)
    return []
}
