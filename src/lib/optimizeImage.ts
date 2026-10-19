// src/lib/optimizeImage.ts
//
// Reduz a foto ANTES de ela ir para o Storage do Supabase. Sem isso, uma foto de celular (3-5 MB) vira o avatar de
// 40 px que toda lista baixa em tamanho original — foi o que estourou a cota de tráfego (Cached Egress) em outubro/2026.
// Roda só no navegador (canvas). Se qualquer coisa falhar, devolve o arquivo original (nunca impede o envio).

const MAX_DIM: Record<string, number> = {
    avatars: 800,
    'store-logos': 800,
    'product-images': 1600,
    posts: 1600,
    backgrounds: 1920,
    'mural-images': 1600,
    'community-photos': 1600,
    'ride-object-photos': 1280,
    'service-request-photos': 1280,
    'driver-car-photos': 1280,
    'driver-selfie-photos': 1024,
}
const MIN_BYTES = 120 * 1024 // abaixo disso não vale o trabalho

/** Lado máximo para um bucket (1600 se o bucket não for conhecido). */
export function maxDimFor(bucket: string): number {
    return MAX_DIM[bucket] ?? 1600
}

/** Novo tamanho mantendo a proporção, sem ampliar. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
    const scale = Math.min(1, max / Math.max(width, height))
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

/**
 * Devolve um Blob menor (JPEG para fotos, WebP para PNG/WebP com transparência) ou o próprio arquivo se não compensar.
 * GIF/SVG/vídeo/PDF passam direto.
 */
export async function optimizeImageForUpload<T extends Blob>(file: T, bucket: string): Promise<Blob> {
    try {
        if (typeof window === 'undefined' || typeof createImageBitmap !== 'function') return file
        const type = file.type
        if (!/^image\/(jpeg|png|webp)$/.test(type) || file.size < MIN_BYTES) return file

        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const { width, height } = fitWithin(bmp.width, bmp.height, maxDimFor(bucket))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { bmp.close?.(); return file }
        ctx.drawImage(bmp, 0, 0, width, height)
        bmp.close?.()

        // JPEG continua JPEG; PNG/WebP viram WebP (guarda transparência). Se o navegador não gerar WebP, cai para JPEG.
        let out: Blob | null = null
        if (type === 'image/jpeg') {
            out = await canvasToBlob(canvas, 'image/jpeg', 0.8)
        } else {
            out = await canvasToBlob(canvas, 'image/webp', 0.8)
            if (!out || out.type !== 'image/webp') out = await canvasToBlob(canvas, 'image/jpeg', 0.82)
        }
        if (!out || out.size >= file.size * 0.9) return file
        return out
    } catch {
        return file
    }
}
