// src/lib/r2Types.ts — o que é puro nos tipos de arquivo do R2 (sem chaves, sem node:crypto): serve ao servidor (src/lib/r2.ts, rotas /api/uploads/r2/*) e ao navegador (src/lib/r2Upload.ts).
// O nome do arquivo no R2 é sempre escolhido pelo SERVIDOR: <id da pessoa>/<uuid>.<extensão>. A extensão vem do tipo declarado (MIME_EXT) ou, só para programa e pacote (que o navegador
// costuma mandar sem tipo ou como application/octet-stream), de uma lista fechada de extensões (HEAVY_PROGRAM_EXTS) — nada digitado entra no caminho além dessa lista.

export const MIME_EXT: Record<string, string> = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'weba',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'application/pdf': 'pdf', 'application/zip': 'zip',
}

/** Extensões de programa e pacote aceitas no digital pesado (a mesma lista do bloco "Programa ou aplicativo", modules/digital PROGRAM_EXTENSIONS: um teste confere) */
export const HEAVY_PROGRAM_EXTS = ['exe', 'msi', 'dmg', 'pkg', 'apk', 'aab', 'ipa', 'appimage', 'deb', 'rpm', 'zip', '7z', 'rar', 'tar.gz', 'tgz', 'jar', 'msix', 'appx'] as const
/** Documentos do produto digital que o navegador manda com tipo comprido ou sem tipo (e-book, planilha, texto): também vão como octet-stream, com a extensão da lista */
export const HEAVY_DOCUMENT_EXTS = ['epub', 'mobi', 'docx', 'xlsx', 'pptx', 'csv', 'txt', 'odt', 'ods', 'odp'] as const
export const HEAVY_EXTS: readonly string[] = [...HEAVY_PROGRAM_EXTS, ...HEAVY_DOCUMENT_EXTS]
export const BINARY_MIME = 'application/octet-stream'

/** "Setup.v2.EXE" → "exe"; "pacote.tar.gz" → "tar.gz"; sem extensão da lista (programas e documentos) → null */
export function programExtension(fileName: string): string | null {
    const n = String(fileName || '').toLowerCase().trim()
    if (n.endsWith('.tar.gz')) return 'tar.gz'
    const m = n.match(/\.([a-z0-9]{2,10})$/)
    return m && HEAVY_EXTS.includes(m[1]) ? m[1] : null
}

/** NAVEGADOR: o tipo e a extensão que o envio pesado vai declarar para este arquivo (null = formato fora da lista: o arquivo segue pelo armazenamento comum, se couber) */
export function heavyUploadInfo(mime: string, fileName: string): { mime: string; ext: string } | null {
    const m = String(mime || '').toLowerCase().trim()
    if (MIME_EXT[m]) return { mime: m, ext: MIME_EXT[m] }
    const ext = programExtension(fileName)
    return ext ? { mime: BINARY_MIME, ext } : null
}

/** SERVIDOR: a extensão do caminho a partir do que veio no pedido. Tipo conhecido vale por si; octet-stream só com extensão da lista (programas e documentos). Qualquer outra coisa = null. */
export function resolveUploadExtension(mime: string, ext: unknown): string | null {
    const m = String(mime || '').toLowerCase().trim()
    if (MIME_EXT[m]) return MIME_EXT[m]
    if (m === BINARY_MIME && typeof ext === 'string' && HEAVY_EXTS.includes(ext.toLowerCase())) return ext.toLowerCase()
    return null
}

/** Erros do R2 em que vale tentar o Supabase (o R2 não está pronto ou caiu). Recusas de regra (bloqueio, ritmo, cota, tamanho, tipo) NUNCA caem no Supabase: seria burlar a regra. */
export function r2FallbackAllowed(code: string): boolean {
    return ['r2_unconfigured', 'kind_disabled', 'wrong_provider', 'authorize_unavailable', 'server_error', 'storage_unavailable', 'upload_failed', 'network', 'complete_failed'].includes(code)
}
