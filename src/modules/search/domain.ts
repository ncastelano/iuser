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

// ===== RESULTADOS DA BUSCA (search_all) =====
export type ResultKind = 'loja' | 'pessoa' | 'produto' | 'servico' | 'publicacao' | 'digital' | 'imovel' | 'pedido' | 'flash' | 'comunidade'
/** a ordem em que as seções aparecem em "Tudo" */
export const RESULT_ORDER: ResultKind[] = ['loja', 'produto', 'servico', 'pessoa', 'publicacao', 'digital', 'imovel', 'pedido', 'flash', 'comunidade']
export const RESULT_INFO: Record<ResultKind, { label: string; plural: string; color: string }> = {
    loja:       { label: 'Loja',       plural: 'Lojas',               color: '#f97316' },
    produto:    { label: 'Produto',    plural: 'Produtos',            color: '#ef4444' },
    servico:    { label: 'Serviço',    plural: 'Serviços',            color: '#0d9488' },
    pessoa:     { label: 'Pessoa',     plural: 'Pessoas',             color: '#8b5cf6' },
    publicacao: { label: 'Publicação', plural: 'Publicações',         color: '#db2777' },
    digital:    { label: 'Digital',    plural: 'Cursos e digitais',   color: '#7c3aed' },
    imovel:     { label: 'Imóvel',     plural: 'Imóveis para alugar', color: '#2563eb' },
    pedido:     { label: 'Pedido',     plural: 'Quem procura serviço', color: '#ea580c' },
    flash:      { label: 'Flash',      plural: 'Flashes',             color: '#eab308' },
    comunidade: { label: 'Comunidade', plural: 'Comunidades',         color: '#16a34a' },
}

export interface SearchHit {
    kind: ResultKind
    id: string
    title: string
    subtitle: string
    image: string | null
    bucket: string
    href: string
    extra: string | null
    /** quantos resultados desse tipo existem no total (a lista mostra só alguns) */
    total: number
}

const KINDS = new Set<string>(RESULT_ORDER)
/** A linha de search_all → resultado. Sem tipo conhecido, título ou endereço interno é descartada (o destino só pode ser do próprio app). */
export function hitFromRow(r: Record<string, any> | null | undefined): SearchHit | null {
    if (!r || !KINDS.has(r.kind) || !r.id || !String(r.title || '').trim()) return null
    const href = String(r.href || '')
    if (!href.startsWith('/') || href.startsWith('//')) return null
    return {
        kind: r.kind as ResultKind, id: String(r.id), title: String(r.title).trim(), subtitle: String(r.subtitle || '').trim(),
        image: r.image ? String(r.image) : null, bucket: String(r.bucket || ''), href, extra: r.extra ? String(r.extra) : null,
        total: Math.max(1, Math.round(Number(r.total) || 1)),
    }
}

export interface HitGroup { kind: ResultKind; hits: SearchHit[]; total: number }
/** Agrupa por tipo, na ordem de RESULT_ORDER; tipo sem resultado não entra */
export function groupHits(hits: SearchHit[]): HitGroup[] {
    const map = new Map<ResultKind, SearchHit[]>()
    for (const h of hits) map.set(h.kind, [...(map.get(h.kind) || []), h])
    return RESULT_ORDER.filter((k) => map.has(k)).map((k) => { const list = map.get(k)!; return { kind: k, hits: list, total: Math.max(list.length, list[0].total) } })
}

/** soma de todos os resultados (para "N resultados") */
export function totalOf(groups: HitGroup[]): number {
    return groups.reduce((n, g) => n + g.total, 0)
}
