// src/modules/search/domain.ts — regras puras da busca da home: o que vale guardar, histórico recente e títulos das listas.
// Sem React nem rede; testado em scripts/test-search.mjs (npm run test:search). O banco repete a validação (_search_norm).

export type TrendScope = 'global' | 'city' | 'state' | 'following'
export const TREND_SCOPES: TrendScope[] = ['global', 'city', 'state', 'following']

export interface Trend { term: string; people: number; place: string | null }

export const MAX_RECENT = 10

/** minúsculas, espaços colapsados; o acento fica (é só para mostrar e buscar de novo) */
export function cleanTerm(raw: string | null | undefined): string {
    return (raw || '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/** Vale guardar como "busca"? Não vale: curta demais, e-mail, link, @perfil, telefone/CPF (5+ dígitos) ou sem nenhuma letra */
export function isRecordable(raw: string | null | undefined): boolean {
    const t = cleanTerm(raw)
    if (t.length < 2) return false
    if (/[@/\\]/.test(t) || /https?:|www\.|\.com/i.test(t)) return false
    if (t.replace(/\D/g, '').length >= 5) return false
    return /[a-zà-ú]/i.test(t)
}

/** Põe a busca no começo do histórico (sem repetir, sem acento/maiúscula diferente) e corta no máximo */
export function addRecent(list: string[], raw: string): string[] {
    const t = cleanTerm(raw)
    if (!isRecordable(t)) return list
    const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return [t, ...list.filter((x) => key(x) !== key(t))].slice(0, MAX_RECENT)
}

export function removeRecent(list: string[], term: string): string[] {
    return list.filter((x) => x !== term)
}

/** Lê o histórico guardado (texto JSON) sem confiar nele: só textos válidos, no máximo MAX_RECENT */
export function parseRecent(stored: string | null): string[] {
    if (!stored) return []
    try {
        const v = JSON.parse(stored)
        if (!Array.isArray(v)) return []
        return v.filter((x): x is string => typeof x === 'string' && isRecordable(x)).slice(0, MAX_RECENT)
    } catch { return [] }
}

/** A linha de get_search_trends → tendência */
export function trendFromRow(r: Record<string, any> | null | undefined): Trend | null {
    if (!r || typeof r.term !== 'string' || !r.term.trim()) return null
    return { term: r.term, people: Math.max(0, Math.round(Number(r.people) || 0)), place: r.place ? String(r.place) : null }
}

export interface SectionInfo { title: string; subtitle: string }
/** Título de cada lista de "em alta". `place` vem do banco ("Porto Velho", "Rondônia") */
export function trendSection(scope: TrendScope, place: string | null): SectionInfo {
    switch (scope) {
        case 'global': return { title: 'Mais buscadas no iUser', subtitle: 'O que todo mundo está procurando' }
        case 'city': return { title: `Em alta em ${place || 'sua cidade'}`, subtitle: 'O que sua cidade está procurando' }
        case 'state': return { title: `Em alta em ${place || 'seu estado'}`, subtitle: 'O que o estado todo está procurando' }
        case 'following': return { title: 'Em alta entre quem você segue', subtitle: 'Buscas de pelo menos 3 pessoas que você segue' }
    }
}

/** "34 pessoas" / "1 pessoa" */
export function peopleLabel(n: number): string {
    return n === 1 ? '1 pessoa' : `${n.toLocaleString('pt-BR')} pessoas`
}
