// src/modules/flash/domain.ts — regras puras do Flash (o feed de pessoas): validação do que se posta, tipo de mídia, tempo, cores e tamanho do texto.
// Sem React nem rede; testado em scripts/test-flash.mjs (npm run test:flash).

export const FLASH_MAX_CHARS = 500
export const FLASH_COMMENT_MAX_CHARS = 300
export const FLASH_MAX_BYTES = 15 * 1024 * 1024

export type FlashKind = 'flash' | 'publication'
export type FlashMode = 'all' | 'following'
export interface FlashItem {
    kind: FlashKind
    id: string
    createdAt: string
    authorId: string
    authorName: string
    authorSlug: string
    authorAvatar: string | null
    /** só publicação: o título dela */
    title: string | null
    content: string
    /** caminho no Storage (flash-media para flash, product-images para publicação) ou link completo */
    mediaUrl: string | null
    mediaType: 'image' | 'video' | null
    likeCount: number
    commentCount: number
    shareCount: number
    liked: boolean
    following: boolean
    /** só publicação: o slug dela (a página é /<autor>/<slug>) */
    link: string | null
}

/** A linha que o banco devolve em get_flash_feed → o item do app */
export function rowToItem(r: Record<string, any>): FlashItem {
    return {
        kind: r.kind === 'publication' ? 'publication' : 'flash',
        id: String(r.id), createdAt: String(r.created_at), authorId: String(r.author_id),
        authorName: r.author_name || 'Pessoa', authorSlug: r.author_slug || '', authorAvatar: r.author_avatar || null,
        title: r.title || null, content: r.content || '', mediaUrl: r.media_url || null,
        mediaType: r.media_type === 'video' ? 'video' : r.media_type === 'image' ? 'image' : null,
        likeCount: Number(r.like_count) || 0, commentCount: Number(r.comment_count) || 0, shareCount: Number(r.share_count) || 0,
        liked: !!r.liked, following: !!r.following, link: r.link || null,
    }
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export function mediaKindOf(mime: string): 'image' | 'video' | null {
    if (IMAGE_TYPES.includes(mime)) return 'image'
    if (VIDEO_TYPES.includes(mime)) return 'video'
    return null
}

/** null = pode postar; senão, o motivo (em português) */
export function validateFlash(input: { content: string; file?: { type: string; size: number } | null }): string | null {
    const text = (input.content || '').trim()
    if (!text && !input.file) return 'Escreva algo ou escolha uma foto ou vídeo.'
    if (text.length > FLASH_MAX_CHARS) return `O texto passa de ${FLASH_MAX_CHARS} caracteres.`
    if (input.file) {
        if (!mediaKindOf(input.file.type)) return 'Use uma foto (JPG, PNG, WebP, GIF) ou um vídeo (MP4, WebM, MOV).'
        if (input.file.size > FLASH_MAX_BYTES) return 'O arquivo passa de 15 MB.'
    }
    return null
}

export function validateComment(text: string): string | null {
    const t = (text || '').trim()
    if (!t) return 'Escreva um comentário.'
    if (t.length > FLASH_COMMENT_MAX_CHARS) return `O comentário passa de ${FLASH_COMMENT_MAX_CHARS} caracteres.`
    return null
}

/** Nome do arquivo no bucket: <uid>/<ms>-<aleatório>.<ext> (só caracteres que o banco aceita) */
export function mediaPath(userId: string, mime: string, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)): string {
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } as Record<string, string>)[mime] || 'bin'
    return `${userId}/${now}-${rand.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'x'}.${ext}`
}

/** "agora", "há 5 min", "há 3 h", "há 2 d" ou a data */
export function timeAgo(iso: string, now = Date.now()): string {
    const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
    if (s < 45) return 'agora'
    if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
    if (s < 86400) return `há ${Math.round(s / 3600)} h`
    if (s < 86400 * 7) return `há ${Math.round(s / 86400)} d`
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** 1.2 mil, 3,4 mi: contagens curtas nos botões */
export function shortCount(n: number): string {
    if (n < 1000) return String(n)
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',').replace(',0', '')} mil`
    return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} mi`
}

const GRADIENTS: [string, string][] = [
    ['#f97316', '#be123c'], ['#7c3aed', '#1e3a8a'], ['#0ea5e9', '#1d4ed8'], ['#16a34a', '#064e3b'], ['#db2777', '#7c2d12'], ['#eab308', '#9a3412'], ['#14b8a6', '#1e293b'], ['#6366f1', '#831843'],
]
/** O mesmo flash sempre ganha a mesma cor de fundo (flash só de texto) */
export function flashGradient(id: string): [string, string] {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return GRADIENTS[h % GRADIENTS.length]
}

/** Tamanho da letra (px) do flash só de texto: curto = grande, longo = menor */
export function fitFontSize(text: string): number {
    const n = (text || '').length
    if (n <= 40) return 34
    if (n <= 90) return 28
    if (n <= 180) return 22
    if (n <= 320) return 18
    return 16
}
