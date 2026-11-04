// src/modules/digital/domain.ts — regras puras dos PRODUTOS DIGITAIS (vídeo-aula, curso, playlist, e-book, planilha...). Sem React nem banco: testado em scripts/test-digital.mjs.
export type DigitalKind = 'video' | 'audio' | 'document' | 'link' | 'app'

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

export const KIND_LABEL: Record<DigitalKind, string> = { video: 'Vídeo', audio: 'Áudio', document: 'Arquivo', link: 'Link', app: 'Programa' }

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
    const apps = items.filter((i) => i.kind === 'app').length
    const videos = items.filter((i) => i.kind === 'video').length
    const audios = items.filter((i) => i.kind === 'audio').length
    const docs = items.filter((i) => i.kind === 'document').length
    const links = items.filter((i) => i.kind === 'link').length
    const seconds = items.reduce((a, i) => a + (i.duration_seconds || 0), 0)
    return { total: items.length, videos, audios, docs, links, apps, seconds, previews: items.filter((i) => i.is_preview).length, modules: groupByModule(items).filter((g) => g.title).length }
}

export interface ContentCounts { videos: number; audios: number; docs: number; links: number; seconds: number; apps?: number }

/** "12 aulas em vídeo · 3 arquivos · 2h 05min" — o que o produto entrega, numa linha (a partir das contagens) */
export function summaryFromCounts(c: ContentCounts): string {
    const apps = c.apps || 0
    if (c.videos + c.audios + c.docs + c.links + apps === 0) return 'Conteúdo em preparação'
    const parts: string[] = []
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    if (c.videos) parts.push(plural(c.videos, 'aula em vídeo', 'aulas em vídeo'))
    // só áudio (música): faixas
    if (c.audios) parts.push(c.videos === 0 && c.docs === 0 ? plural(c.audios, 'faixa', 'faixas') : plural(c.audios, 'áudio', 'áudios'))
    if (c.docs) parts.push(plural(c.docs, 'arquivo', 'arquivos'))
    if (c.links) parts.push(plural(c.links, 'link', 'links'))
    if (apps) parts.push(plural(apps, 'arquivo para baixar', 'arquivos para baixar'))
    const d = formatDuration(c.seconds)
    if (d) parts.push(d)
    return parts.join(' · ')
}

export function curriculumSummary(items: CurriculumItem[]): string {
    const s = curriculumStats(items)
    return summaryFromCounts({ videos: s.videos, audios: s.audios, docs: s.docs, links: s.links, apps: s.apps, seconds: s.seconds })
}

export type DigitalProductKind = 'curso' | 'aula' | 'playlist' | 'ebook' | 'arquivo' | 'musica' | 'album' | 'programa'
export const PRODUCT_KIND_LABEL: Record<DigitalProductKind, string> = { curso: 'Curso', aula: 'Aula única', playlist: 'Playlist', ebook: 'E-book', arquivo: 'Arquivo', musica: 'Música', album: 'Álbum', programa: 'Programa' }
/** Filtros da vitrine (/digitais): chave → rótulo e quais tipos entram */
export const SHOWCASE_FILTERS: { id: string; label: string; kinds: DigitalProductKind[] | null }[] = [
    { id: 'todos', label: 'Todos', kinds: null },
    { id: 'cursos', label: 'Cursos', kinds: ['curso'] },
    { id: 'aulas', label: 'Aulas únicas', kinds: ['aula'] },
    { id: 'playlists', label: 'Playlists', kinds: ['playlist'] },
    { id: 'musicas', label: 'Músicas', kinds: ['musica', 'album'] },
    { id: 'programas', label: 'Programas', kinds: ['programa'] },
    { id: 'arquivos', label: 'E-books e arquivos', kinds: ['ebook', 'arquivo'] },
]

/** Que "cara" o produto digital tem na vitrine, pelo que ele entrega (e pelo nome, para playlist e e-book) */
export function productKindOf(p: { name: string } & Pick<ContentCounts, 'videos' | 'audios' | 'docs' | 'links'> & { apps?: number }): DigitalProductKind {
    const media = p.videos + p.audios
    // tem programa para baixar (e nada de vídeo/áudio): é um programa
    if ((p.apps || 0) > 0 && media === 0) return 'programa'
    if (media === 0) return p.docs > 0 && /^e-?book/i.test(p.name.trim()) ? 'ebook' : p.docs > 0 ? (p.docs === 1 ? 'ebook' : 'arquivo') : 'arquivo'
    if (media > 1 && /^playlist/i.test(p.name.trim())) return 'playlist'
    // só áudio, e não é podcast/aula/curso de áudio pelo nome: é música (1 faixa) ou álbum (2 ou mais)
    if (p.videos === 0 && p.audios > 0 && !/^(podcast|curso|aula|audiobook|audio-?livro)/i.test(p.name.trim())) return p.audios === 1 ? 'musica' : 'album'
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

// ------------------------------------------------------------------ prévia em vídeo na vitrine
/** A vitrine só toca os primeiros 15 s da prévia; o vídeo curto marcado como prévia tem no máximo 30 s */
export const PREVIEW_PLAY_SECONDS = 15
export const TEASER_MAX_SECONDS = 30
/** Um cartão por vez ganha vida: a cada 3 s o destaque passa para o próximo */
export const SPOTLIGHT_MS = 3000
/** Segurar o dedo (celular) por tanto tempo abre a prévia */
export const HOLD_MS = 350

/** Quantos segundos da prévia tocam: o vídeo inteiro se for curto, no máximo 15 s */
export function previewPlaySeconds(durationSeconds: number | null | undefined): number {
    const d = durationSeconds && durationSeconds > 0 ? durationSeconds : PREVIEW_PLAY_SECONDS
    return Math.min(PREVIEW_PLAY_SECONDS, d)
}

/** Próximo cartão do destaque (volta ao primeiro no fim; se o atual saiu da lista, começa de novo) */
export function nextSpotlightId(ids: string[], current: string | null): string | null {
    if (ids.length === 0) return null
    const i = current ? ids.indexOf(current) : -1
    return ids[(i + 1) % ids.length]
}

/** A prévia curta precisa ser um vídeo (vitrine) ou um áudio (música) de 1 a 30 s (o banco confere de novo) */
export function validateTeaser(input: { isVideo: boolean; isAudio?: boolean; durationSeconds: number | null }): string | null {
    if (!input.isVideo && !input.isAudio) return 'A prévia precisa ser um vídeo ou um áudio.'
    if (!input.durationSeconds || input.durationSeconds < 1) return `Não deu para ler a duração do ${input.isAudio ? 'áudio. Use um MP3' : 'vídeo. Use um MP4'}.`
    if (input.durationSeconds > TEASER_MAX_SECONDS) return `A prévia passa de ${TEASER_MAX_SECONDS} segundos. Use um trecho curto.`
    return null
}

/** Movimento automático só se a pessoa não pediu menos movimento nem economia de dados */
export function autoPreviewAllowed(env: { reducedMotion: boolean; saveData: boolean }): boolean {
    return !env.reducedMotion && !env.saveData
}

// ------------------------------------------------------------------ música
/** Produto de música: só tem áudio (1 faixa = música, 2 ou mais = álbum) */
export const isMusicKind = (k: DigitalProductKind) => k === 'musica' || k === 'album'

/** O produto é grátis? (preço 0: a pessoa pega direto, sem pedido) */
export const isFreeProduct = (price: number | null | undefined) => !price || Number(price) <= 0

/** Texto do botão de pegar o que é grátis, conforme o tipo */
export function freeCtaLabel(kind: DigitalProductKind): string {
    return isMusicKind(kind) ? 'Adicionar à minha biblioteca' : kind === 'programa' ? 'Liberar download grátis' : 'Pegar grátis'
}

// ------------------------------------------------------------------ programas e aplicativos para baixar
export type AppPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web' | 'other'
export const APP_PLATFORMS: { code: AppPlatform; label: string }[] = [
    { code: 'windows', label: 'Windows' },
    { code: 'macos', label: 'macOS' },
    { code: 'linux', label: 'Linux' },
    { code: 'android', label: 'Android' },
    { code: 'ios', label: 'iPhone / iPad' },
    { code: 'web', label: 'Web / multiplataforma' },
    { code: 'other', label: 'Outro' },
]
export const APP_PLATFORM_LABEL: Record<AppPlatform, string> = Object.fromEntries(APP_PLATFORMS.map((p) => [p.code, p.label])) as Record<AppPlatform, string>

/** Extensões aceitas como programa (o banco confere a mesma lista) */
export const PROGRAM_EXTENSIONS = ['exe', 'msi', 'dmg', 'pkg', 'apk', 'aab', 'ipa', 'appimage', 'deb', 'rpm', 'zip', '7z', 'rar', 'tar.gz', 'tgz', 'jar', 'msix', 'appx'] as const
const PROGRAM_RE = new RegExp(`\\.(${PROGRAM_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|')})$`, 'i')
/** Atributo `accept` do seletor de arquivo */
export const PROGRAM_ACCEPT = PROGRAM_EXTENSIONS.map((e) => `.${e}`).join(',')
export const isProgramFile = (name: string) => PROGRAM_RE.test(name.trim())
/** Instaláveis "de verdade" (um .zip pode ser só um material comum): o seletor de arquivo comum manda estes para o bloco de programas */
export const isInstallerFile = (name: string) => /\.(exe|msi|dmg|pkg|apk|aab|ipa|appimage|deb|rpm|msix|appx)$/i.test(name.trim())

/** Palpite da plataforma pelo nome do arquivo (a pessoa pode trocar) */
export function detectPlatform(name: string): AppPlatform | null {
    const n = name.trim().toLowerCase()
    if (/\.(exe|msi|msix|appx)$/.test(n)) return 'windows'
    if (/\.(dmg|pkg)$/.test(n)) return 'macos'
    if (/\.(apk|aab)$/.test(n)) return 'android'
    if (/\.ipa$/.test(n)) return 'ios'
    if (/\.(appimage|deb|rpm)$/.test(n)) return 'linux'
    if (/\.jar$/.test(n)) return 'other'
    return null
}

/** Tamanho máximo até o SHA-256 ser calculado no navegador (a conta lê o arquivo inteiro na memória) */
export const SHA256_MAX_BYTES = 100 * 1024 * 1024
export const APP_NOTES_MAX = 500
export const APP_VERSION_MAX = 30

export function validateAppInput(input: { fileName: string; size: number; platform: AppPlatform | ''; version: string; notes?: string }): string | null {
    if (!isProgramFile(input.fileName)) return `Esse tipo de arquivo não é aceito como programa. Use: ${PROGRAM_EXTENSIONS.map((e) => '.' + e).join(' ')}.`
    if (input.size > DIGITAL_MAX_BYTES) return 'O arquivo passa de 500 MB.'
    if (!input.platform) return 'Escolha a plataforma.'
    const v = input.version.trim()
    if (!v) return 'Informe a versão (ex.: 1.0.2).'
    if (v.length > APP_VERSION_MAX) return `A versão passa de ${APP_VERSION_MAX} caracteres.`
    if ((input.notes || '').length > APP_NOTES_MAX) return `As notas passam de ${APP_NOTES_MAX} caracteres.`
    return null
}

export interface AppVersion { item_id: string; title: string; platform: AppPlatform; version: string; release_notes: string | null; sha256: string | null; size_bytes: number | null; download_count: number; created_at: string; unlocked: boolean }

/** Agrupa por plataforma (na ordem de APP_PLATFORMS); dentro de cada uma, a mais NOVA primeiro — e só a primeira leva o selo "Última versão" */
export function groupAppsByPlatform(apps: AppVersion[]): { platform: AppPlatform; versions: (AppVersion & { latest: boolean })[] }[] {
    const out: { platform: AppPlatform; versions: (AppVersion & { latest: boolean })[] }[] = []
    for (const pl of APP_PLATFORMS) {
        const list = apps.filter((a) => a.platform === pl.code).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        if (list.length) out.push({ platform: pl.code, versions: list.map((a, i) => ({ ...a, latest: i === 0 })) })
    }
    return out
}

/** "12,3 mil downloads" */
export function downloadsLabel(n: number): string {
    if (n <= 0) return 'Nenhum download ainda'
    if (n === 1) return '1 download'
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil downloads`
    return `${n} downloads`
}

/** Para mostrar o hash sem ocupar a tela: "a3f9c2…8e1b" */
export const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h)

export const APP_WARNING = 'O iUser ainda não verifica vírus nos programas. Baixe só de quem você confia e, se quiser, confira o código SHA-256 do arquivo.'
