// src/lib/uploadLimits.ts
//
// Limite de tamanho e de tipo das FOTOS que o app envia ao Storage. A regra de verdade é do servidor (migration
// 20261130000018_storage_bucket_limits.sql: o próprio Storage recusa); esta tabela é o ESPELHO dela no navegador, para dar um aviso
// claro antes de gastar o envio. `npm run test:upload-limits` falha se as duas divergirem. Funções puras, sem React.

export const MB = 1024 * 1024

/** Texto curto de um tamanho ("5 MB", "500 MB", "1,5 MB", "2 GB"). */
export function formatBytes(bytes: number): string {
    const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
    if (bytes >= 1024 * MB) return `${trim(bytes / (1024 * MB))} GB`
    if (bytes >= MB) return `${trim(bytes / MB)} MB`
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
    return `${bytes} B`
}

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const

/** Buckets de foto com limite imposto no servidor (bytes). flash-media, delivery-proofs e digital-files têm regra própria e ficam de fora. */
export const PHOTO_BUCKET_LIMITS: Record<string, number> = {
    avatars: 5 * MB,
    backgrounds: 5 * MB,
    'store-logos': 5 * MB,
    'product-images': 5 * MB,
    'community-photos': 6 * MB,
    'service-request-photos': 5 * MB,
    'ride-object-photos': 5 * MB,
    'driver-car-photos': 5 * MB,
    'driver-selfie-photos': 5 * MB,
    'mural-images': 5 * MB,
    posts: 5 * MB,
    'store-links': 5 * MB,
}

const EXT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

/** Tipo da foto: o do arquivo ou, se o aparelho não informou (acontece em algumas câmeras), o da extensão do nome. */
export function inferPhotoType(type: string | undefined | null, name?: string | null): string {
    const t = (type || '').toLowerCase()
    if (t && t !== 'application/octet-stream') return t
    const ext = (name || '').split('?')[0].split('.').pop()?.toLowerCase() || ''
    return EXT_TYPE[ext] || t
}

export type UploadCheck = { ok: true; contentType: string } | { ok: false; reason: 'type' | 'size'; message: string }

/** Confere uma foto contra o limite do bucket. Bucket sem regra aqui (flash, provas, digitais) passa: quem manda é o servidor. */
export function checkPhotoUpload(bucket: string, file: { size: number; type?: string; name?: string }, path?: string): UploadCheck {
    const limit = PHOTO_BUCKET_LIMITS[bucket]
    const contentType = inferPhotoType(file.type, file.name || path)
    if (limit === undefined) return { ok: true, contentType }
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(contentType)) {
        return { ok: false, reason: 'type', message: 'Formato de imagem não aceito. Use JPG, PNG, WebP, GIF ou AVIF.' }
    }
    if (file.size > limit) {
        return { ok: false, reason: 'size', message: `A imagem pode ter até ${Math.round(limit / MB)} MB.` }
    }
    return { ok: true, contentType }
}
