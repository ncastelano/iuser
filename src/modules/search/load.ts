// src/modules/search/load.ts — fala com o banco (tendências, registro de busca) e guarda o histórico neste aparelho.
import { supabase } from '@/lib/supabase/client'
import { addRecent, hitFromRow, isRecordable, parseRecent, removeRecent, trendFromRow, type SearchHit, type ResultKind, type Trend, type TrendScope } from './domain'
import { proxyImageUrl } from '@/lib/imageProxy'

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

/** Procura em tudo (lojas, pessoas, produtos, serviços, publicações, digitais, imóveis, pedidos, flashes, comunidades). null = falhou. */
export async function searchEverything(term: string, perKind = 6, kind?: ResultKind): Promise<SearchHit[] | null> {
    const { data, error } = await supabase.rpc('search_all', { p_term: term, p_limit: perKind, p_kind: kind ?? null })
    if (error || !Array.isArray(data)) return null
    return data.map(hitFromRow).filter((h): h is SearchHit => !!h)
}

/** Link público da imagem de um resultado (a coluna guarda o caminho no bucket do tipo, ou já um link) */
export function hitImageUrl(hit: SearchHit): string | null {
    if (!hit.image) return null
    if (hit.image.startsWith('http')) return proxyImageUrl(hit.image)
    if (!hit.bucket) return null
    return supabase.storage.from(hit.bucket).getPublicUrl(hit.image).data.publicUrl
}
