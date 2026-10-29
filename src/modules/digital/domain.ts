// src/modules/digital/domain.ts — regras puras dos PRODUTOS DIGITAIS (vídeo-aula, curso, playlist, e-book, planilha...). Sem React nem banco: testado em scripts/test-digital.mjs.
export type DigitalKind = 'video' | 'audio' | 'document' | 'link'

export interface CurriculumItem {
    id: string
    module_title: string | null
    title: string
    kind: DigitalKind
    duration_seconds: number | null
    size_bytes: number | null
    position: number
    is_preview: boolean
    unlocked: boolean
}

export const KIND_LABEL: Record<DigitalKind, string> = { video: 'Vídeo', audio: 'Áudio', document: 'Arquivo', link: 'Link' }

/** Tamanho máximo de um arquivo enviado (o bucket aceita 500 MB; o servidor local pode ter um teto menor) */
export const DIGITAL_MAX_BYTES = 500 * 1024 * 1024

export function kindFromFile(mime: string | null | undefined, name = ''): DigitalKind {
    const m = (mime || '').toLowerCase()
    if (m.startsWith('video/')) return 'video'
    if (m.startsWith('audio/')) return 'audio'
    if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(name)) return 'video'
    if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(name)) return 'audio'
    return 'document'
}

/** Só https (o banco também confere): o link externo abre uma aula hospedada em outro lugar (YouTube não listado, Vimeo, Drive...) */
export function isSafeHttps(url: string): boolean {
    try { return new URL(url.trim()).protocol === 'https:' } catch { return false }
}

export function validateItem(input: { title: string; module?: string | null; url?: string | null; file?: { size: number } | null }): string | null {
    const t = input.title.trim()
    if (!t) return 'Dê um nome ao item.'
    if (t.length > 140) return 'O nome passa de 140 caracteres.'
    if ((input.module || '').trim().length > 100) return 'O nome do módulo passa de 100 caracteres.'
    if (input.file) return input.file.size > DIGITAL_MAX_BYTES ? 'O arquivo passa de 500 MB.' : null
    if (!input.url || !input.url.trim()) return 'Envie um arquivo ou informe um link.'
    return isSafeHttps(input.url) ? null : 'O link precisa começar com https://'
}

export function formatDuration(sec: number | null | undefined): string {
    if (!sec || sec <= 0) return ''
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
    return `${m}:${String(s).padStart(2, '0')}`
}

export function formatSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return ''
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export interface ModuleGroup<T extends { module_title: string | null }> { title: string | null; items: T[] }

/** Agrupa na ordem em que os módulos aparecem; itens sem módulo ficam juntos (no começo, se vierem primeiro) */
export function groupByModule<T extends { module_title: string | null }>(items: T[]): ModuleGroup<T>[] {
    const out: ModuleGroup<T>[] = []
    for (const it of items) {
        const title = it.module_title && it.module_title.trim() ? it.module_title.trim() : null
        let g = out.find((x) => x.title === title)
        if (!g) { g = { title, items: [] }; out.push(g) }
        g.items.push(it)
    }
    return out
}

export function curriculumStats(items: CurriculumItem[]) {
    const videos = items.filter((i) => i.kind === 'video').length
    const audios = items.filter((i) => i.kind === 'audio').length
    const docs = items.filter((i) => i.kind === 'document').length
    const links = items.filter((i) => i.kind === 'link').length
    const seconds = items.reduce((a, i) => a + (i.duration_seconds || 0), 0)
    return { total: items.length, videos, audios, docs, links, seconds, previews: items.filter((i) => i.is_preview).length, modules: groupByModule(items).filter((g) => g.title).length }
}

export interface ContentCounts { videos: number; audios: number; docs: number; links: number; seconds: number }

/** "12 aulas em vídeo · 3 arquivos · 2h 05min" — o que o produto entrega, numa linha (a partir das contagens) */
export function summaryFromCounts(c: ContentCounts): string {
    if (c.videos + c.audios + c.docs + c.links === 0) return 'Conteúdo em preparação'
    const parts: string[] = []
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    if (c.videos) parts.push(plural(c.videos, 'aula em vídeo', 'aulas em vídeo'))
    if (c.audios) parts.push(plural(c.audios, 'áudio', 'áudios'))
    if (c.docs) parts.push(plural(c.docs, 'arquivo', 'arquivos'))
    if (c.links) parts.push(plural(c.links, 'link', 'links'))
    const d = formatDuration(c.seconds)
    if (d) parts.push(d)
    return parts.join(' · ')
}

export function curriculumSummary(items: CurriculumItem[]): string {
    const s = curriculumStats(items)
    return summaryFromCounts({ videos: s.videos, audios: s.audios, docs: s.docs, links: s.links, seconds: s.seconds })
}

export type DigitalProductKind = 'curso' | 'aula' | 'playlist' | 'ebook' | 'arquivo'
export const PRODUCT_KIND_LABEL: Record<DigitalProductKind, string> = { curso: 'Curso', aula: 'Aula única', playlist: 'Playlist', ebook: 'E-book', arquivo: 'Arquivo' }
/** Filtros da vitrine (/digitais): chave → rótulo e quais tipos entram */
export const SHOWCASE_FILTERS: { id: string; label: string; kinds: DigitalProductKind[] | null }[] = [
    { id: 'todos', label: 'Todos', kinds: null },
    { id: 'cursos', label: 'Cursos', kinds: ['curso'] },
    { id: 'aulas', label: 'Aulas únicas', kinds: ['aula'] },
    { id: 'playlists', label: 'Playlists', kinds: ['playlist'] },
    { id: 'arquivos', label: 'E-books e arquivos', kinds: ['ebook', 'arquivo'] },
]

/** Que "cara" o produto digital tem na vitrine, pelo que ele entrega (e pelo nome, para playlist e e-book) */
export function productKindOf(p: { name: string } & Pick<ContentCounts, 'videos' | 'audios' | 'docs' | 'links'>): DigitalProductKind {
    const media = p.videos + p.audios
    if (media === 0) return p.docs > 0 && /^e-?book/i.test(p.name.trim()) ? 'ebook' : p.docs > 0 ? (p.docs === 1 ? 'ebook' : 'arquivo') : 'arquivo'
    if (media > 1 && /^playlist/i.test(p.name.trim())) return 'playlist'
    return media === 1 ? 'aula' : 'curso'
}

/** O carrinho da loja só tem produto digital? Então não há entrega nem retirada: o acesso abre quando a loja confirma o pagamento */
export function isDigitalCart(items: { product?: { type?: string | null } | null }[]): boolean {
    return items.length > 0 && items.every((i) => i.product?.type === 'digital')
}

/** Caminho no bucket privado: <uid>/<produto>/<instante>-<nome limpo> (a política só deixa gravar na pasta da própria pessoa) */
export function storagePathFor(uid: string, productId: string, fileName: string, now = Date.now()): string {
    const clean = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'arquivo'
    return `${uid}/${productId}/${now}-${clean}`
}
