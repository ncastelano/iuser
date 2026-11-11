// src/modules/player/domain.ts
//
// MINI-PLAYER da barra da 3.0: mostra sempre a ÚLTIMA coisa que a pessoa estava vendo ou ouvindo — música, aula em vídeo ou flash.
// Regras puras (sem React nem rede). Só a MÚSICA toca de verdade fora da tela dela (o áudio mora na casca); aula e flash ficam "à espera":
// tocar leva de volta à página, que retoma de onde parou. Testes: scripts/test-player.mjs.

export type PlayerKind = 'musica' | 'aula' | 'flash'

export interface PlayerItem {
    kind: PlayerKind
    /** música/aula: id do item do conteúdo digital; flash: id do flash */
    id: string
    title: string
    /** "Banda do Forno · Música" */
    sub: string
    cover: string | null
    /** a página para onde "abrir" e "continuar" levam */
    href: string
}

export interface QueueTrack { itemId: string; title: string }

/** O que se guarda no aparelho para a próxima abertura do app (sempre PAUSADO: tocar exige um toque da pessoa) */
export interface SavedPlayer { item: PlayerItem; queue: QueueTrack[]; qIndex: number; pos: number; dur: number }

export const KIND_LABEL: Record<PlayerKind, string> = { musica: 'Música', aula: 'Aula', flash: 'Flash' }

/** 0..1 */
export function progressOf(pos: number, dur: number): number {
    if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0 || pos <= 0) return 0
    return Math.min(1, pos / dur)
}

/** "3:05" / "1:02:03" */
export function clock(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00'
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** Próxima faixa da fila (null no fim) e a anterior (null no começo) */
export const nextIndex = (i: number, len: number): number | null => (i >= 0 && i + 1 < len ? i + 1 : null)
export const prevIndex = (i: number): number | null => (i > 0 ? i - 1 : null)

/** Voltar: passados 3 s da faixa, "anterior" volta ao começo dela; senão vai para a faixa de trás */
export function backTarget(i: number, pos: number): { restart: boolean; index: number | null } {
    if (pos > 3 || prevIndex(i) === null) return { restart: true, index: null }
    return { restart: false, index: prevIndex(i) }
}

/** O subtítulo da faixa: o que é + "pausado" para aula e flash que ficaram à espera (a música pausada é só música pausada) */
export function subtitleOf(item: PlayerItem, playing: boolean): string {
    if (item.kind === 'musica' || playing) return item.sub
    return `${item.sub} · continuar`
}

/** A faixa de cima some onde ela seria repetição: o flash no próprio feed do Flash; a aula e a música nas salas (que nem têm barra) */
export function miniHidden(item: PlayerItem | null, shellPath: string): boolean {
    if (!item) return true
    const p = (shellPath || '').split('?')[0]
    if (item.kind === 'flash' && (p === '/flash' || p.startsWith('/flash/'))) return true
    if (item.kind !== 'flash' && p.startsWith('/minhas-compras-digitais/')) return true
    return false
}

/** Só endereços do próprio app (nunca um link de fora guardado no aparelho) */
export const isInternalHref = (h: unknown): h is string => typeof h === 'string' && h.startsWith('/') && !h.startsWith('//')

export function serializeSaved(s: SavedPlayer): string {
    return JSON.stringify({ ...s, pos: Math.max(0, Math.floor(s.pos || 0)), dur: Math.max(0, Math.floor(s.dur || 0)) })
}

/** Lê o que foi guardado; qualquer coisa fora do formato vira null (nunca quebra a abertura do app) */
export function parseSaved(raw: string | null | undefined): SavedPlayer | null {
    if (!raw) return null
    try {
        const j = JSON.parse(raw)
        const it = j?.item
        if (!it || !['musica', 'aula', 'flash'].includes(it.kind)) return null
        if (typeof it.id !== 'string' || !it.id || typeof it.title !== 'string' || !isInternalHref(it.href)) return null
        const queue: QueueTrack[] = Array.isArray(j.queue) ? j.queue.filter((q: any) => q && typeof q.itemId === 'string' && typeof q.title === 'string').slice(0, 200) : []
        const qIndex = Number.isInteger(j.qIndex) && j.qIndex >= 0 && j.qIndex < Math.max(queue.length, 1) ? j.qIndex : 0
        const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
        return {
            item: { kind: it.kind, id: it.id, title: it.title, sub: typeof it.sub === 'string' ? it.sub : '', cover: typeof it.cover === 'string' ? it.cover : null, href: it.href },
            queue, qIndex, pos: num(j.pos), dur: num(j.dur),
        }
    } catch { return null }
}
