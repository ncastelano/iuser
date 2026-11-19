// src/modules/forum/domain.ts — regras PURAS do Fórum do iUser (migration 20261130000087; testadas em scripts/test-forum.mjs).
// Novidades (o que entrou, melhorou e saiu em cada versão) + Ideias de quem usa, com voto para cima/para baixo e a situação dada pelo iUser.

export type IdeaStatus = 'open' | 'review' | 'planned' | 'doing' | 'done' | 'declined'
export type IdeaSort = 'top' | 'new' | 'trending'
export type Category = 'geral' | 'compras' | 'lojas' | 'motoristas' | 'servicos' | 'social' | 'digital' | 'pagamentos' | 'outro'

export const STATUS_INFO: Record<IdeaStatus, { label: string; color: string }> = {
    open: { label: 'Aberta para votos', color: '#64748b' },
    review: { label: 'Em análise', color: '#0ea5e9' },
    planned: { label: 'Planejada', color: '#8b5cf6' },
    doing: { label: 'Fazendo', color: '#eab308' },
    done: { label: 'Já entrou', color: '#16a34a' },
    declined: { label: 'Não vai entrar', color: '#ef4444' },
}

export const CATEGORIES: { id: Category; label: string }[] = [
    { id: 'geral', label: 'Geral' }, { id: 'compras', label: 'Compras' }, { id: 'lojas', label: 'Lojas' },
    { id: 'motoristas', label: 'Motoristas e entregas' }, { id: 'servicos', label: 'Serviços' }, { id: 'social', label: 'Social' },
    { id: 'digital', label: 'Digital' }, { id: 'pagamentos', label: 'Pagamentos' }, { id: 'outro', label: 'Outro' },
]

export interface Idea {
    id: string; title: string; body: string | null; category: Category; status: IdeaStatus; statusNote: string | null
    up: number; down: number; comments: number; createdAt: string; releaseId: string | null
    author: { name: string; slug: string | null; avatar: string | null }
    mine: -1 | 0 | 1; isAuthor: boolean
}

export const score = (i: Pick<Idea, 'up' | 'down'>) => i.up - i.down

/** "Em alta": saldo de votos que pesa menos com o tempo (ideia nova com votos sobe). */
export function trending(i: Pick<Idea, 'up' | 'down' | 'createdAt'>, now = Date.now()): number {
    const hours = Math.max(0, (now - new Date(i.createdAt).getTime()) / 3_600_000)
    return score(i) / Math.pow(hours + 2, 1.3)
}

export function sortIdeas<T extends Pick<Idea, 'up' | 'down' | 'createdAt'>>(list: T[], sort: IdeaSort, now = Date.now()): T[] {
    const byNew = (a: T, b: T) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    const copy = [...list]
    if (sort === 'new') return copy.sort(byNew)
    if (sort === 'trending') return copy.sort((a, b) => trending(b, now) - trending(a, now) || byNew(a, b))
    return copy.sort((a, b) => score(b) - score(a) || byNew(a, b))
}

/** O que o toque na setinha faz: tocar de novo na mesma tira o voto. */
export function nextVote(current: -1 | 0 | 1, pressed: -1 | 1): -1 | 0 | 1 {
    return current === pressed ? 0 : pressed
}

/** Mostra o voto já na tela antes do banco responder (e volta se der erro). */
export function applyVote<T extends Pick<Idea, 'up' | 'down' | 'mine'>>(i: T, next: -1 | 0 | 1): T {
    let { up, down } = i
    if (i.mine === 1) up--
    if (i.mine === -1) down--
    if (next === 1) up++
    if (next === -1) down++
    return { ...i, up: Math.max(0, up), down: Math.max(0, down), mine: next }
}

export function validateIdea(title: string, body: string): string | null {
    const t = title.trim()
    if (t.length < 5) return 'Escreva a ideia em pelo menos 5 letras.'
    if (t.length > 100) return 'O título vai até 100 letras.'
    if (body.trim().length > 1000) return 'A explicação vai até 1.000 letras.'
    return null
}

export const ago = (iso: string, now = Date.now()): string => {
    const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
    if (m < 1) return 'agora'
    if (m < 60) return `há ${m} min`
    const h = Math.round(m / 60)
    if (h < 24) return `há ${h} h`
    const d = Math.round(h / 24)
    if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
    return new Date(iso).toLocaleDateString('pt-BR')
}
