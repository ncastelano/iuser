// Regras puras das ações de mensagem nas conversas (apagar, responder, reagir, editar, visto, busca).
// O banco é quem decide de verdade (chat_delete_message, chat_edit_message, chat_react); aqui só se mostra o que cabe.
// Testes: npm run test:message-actions

/** Editar: até 15 minutos depois de enviar (igual ao banco). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000
/** Apagar para todos: até 48 horas depois de enviar (igual ao banco). */
export const DELETE_ALL_WINDOW_MS = 48 * 60 * 60 * 1000
/** Os únicos emojis de reação (igual ao CHECK de message_reactions). */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export type Tick = 'none' | 'sent' | 'read'

export interface ActionRow {
    id: string
    sender_id: string
    kind?: string | null
    content: string
    created_at: string
    deleted_at?: string | null
    edited_at?: string | null
    reply_to_id?: string | null
    ref_product_id?: string | null
    ref_request_id?: string | null
    ref_store_id?: string | null
    ref_profile_id?: string | null
}

export interface ReactionRow { message_id: string; profile_id: string; emoji: string }
export interface ReactionChip { emoji: string; count: number; mine: boolean }

const isRef = (m: ActionRow) => !!(m.ref_product_id || m.ref_request_id || m.ref_store_id || m.ref_profile_id)

/** Só texto puro, de quem enviou, dentro de 15 minutos e sem cartão/mensagem apagada. */
export function canEdit(m: ActionRow, me: string, nowMs: number): boolean {
    if (m.sender_id !== me || m.deleted_at) return false
    if (m.kind && m.kind !== 'text') return false
    if (isRef(m)) return false
    return nowMs - Date.parse(m.created_at) <= EDIT_WINDOW_MS
}

/** Apagar para todos: só quem enviou, ainda não apagada, dentro de 48 horas. */
export function canDeleteForAll(m: ActionRow, me: string, nowMs: number): boolean {
    if (m.sender_id !== me || m.deleted_at) return false
    return nowMs - Date.parse(m.created_at) <= DELETE_ALL_WINDOW_MS
}

const KIND_LABEL: Record<string, string> = { photo: 'Foto', video: 'Vídeo', audio: 'Áudio', location: 'Localização ao vivo' }

/** Como a mensagem aparece dentro de uma resposta (a citação). */
export function quotePreview(m: Pick<ActionRow, 'kind' | 'content' | 'deleted_at'>): string {
    if (m.deleted_at) return 'Mensagem apagada'
    if (m.kind && KIND_LABEL[m.kind]) return KIND_LABEL[m.kind]
    const t = m.content.trim()
    return t.length > 90 ? `${t.slice(0, 89)}…` : t
}

/** Visto: ✓ enviada; ✓✓ azul quando a outra pessoa leu a conversa depois dessa mensagem. */
export function tickOf(m: ActionRow, me: string, otherReadAt: string | null): Tick {
    if (m.sender_id !== me || m.deleted_at) return 'none'
    if (otherReadAt && Date.parse(otherReadAt) >= Date.parse(m.created_at)) return 'read'
    return 'sent'
}

/** Reações de UMA mensagem: uma linha por emoji, com quantas vezes e se foi eu. Mais usadas primeiro. */
export function reactionChips(rows: ReactionRow[], me: string): ReactionChip[] {
    const byEmoji = new Map<string, ReactionChip>()
    for (const r of rows) {
        const c = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
        c.count += 1
        if (r.profile_id === me) c.mine = true
        byEmoji.set(r.emoji, c)
    }
    return [...byEmoji.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
}

/** Busca dentro da conversa: só mensagens de texto que contêm o termo (sem acento e sem maiúscula). Vazio = nada. */
export function matchesSearch(m: ActionRow, q: string): boolean {
    const term = normalize(q)
    if (!term || m.deleted_at) return false
    return normalize(m.content).includes(term)
}

export function normalize(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
