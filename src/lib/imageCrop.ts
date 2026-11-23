// lib/imageCrop.ts — RECORTE da foto antes de enviar (23/11/2026, decisão do dono): a foto do PERFIL (bucket avatars) e o LOGO da loja
// (store-logos) passam por uma janela de recorte quadrado (arrastar e aproximar). Quem desenha a janela é o ImageCropHost (providers);
// aqui só a fila. Sem a janela montada (ex.: servidor), a foto segue como veio. "Usar sem recortar" também devolve a original.
export const CROP_BUCKETS = new Set(['avatars', 'store-logos'])

export interface CropRequest { file: Blob; round: boolean; resolve: (b: Blob) => void }
type Host = (req: CropRequest) => void
let host: Host | null = null

export function registerCropHost(h: Host | null) { host = h }

export function requestCrop(file: Blob, bucket: string): Promise<Blob> {
    if (!host || typeof window === 'undefined') return Promise.resolve(file)
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return Promise.resolve(file)   // GIF (animado) e o resto seguem como vieram
    return new Promise((resolve) => host!({ file, round: bucket === 'avatars', resolve }))
}
