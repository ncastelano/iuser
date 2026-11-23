// lib/imageCrop.ts — RECORTE da foto antes de enviar (23/11/2026, decisão do dono): a foto do PERFIL (bucket avatars) e o LOGO da loja
// (store-logos) passam por uma janela de recorte quadrado (arrastar e aproximar). Quem desenha a janela é o ImageCropHost (providers);
// aqui só a fila. Sem a janela montada (ex.: servidor), a foto segue como veio. "Usar sem recortar" também devolve a original.
export const CROP_BUCKETS = new Set(['avatars', 'store-logos'])

export interface CropRequest { file: Blob; round: boolean; resolve: (b: Blob) => void }
type Host = (req: CropRequest) => void
let host: Host | null = null

export function registerCropHost(h: Host | null) { host = h }

// já passou pelo recorte (na hora de ESCOLHER a foto): não pergunta de novo na hora de enviar
const done = new WeakSet<Blob>()

export function requestCrop(file: Blob, bucket: string): Promise<Blob> {
    if (!host || typeof window === 'undefined' || done.has(file)) return Promise.resolve(file)
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return Promise.resolve(file)   // GIF (animado) e o resto seguem como vieram
    return new Promise((resolve) => host!({ file, round: bucket === 'avatars', resolve }))
}

/** Recorte na hora de ESCOLHER a foto (cadastro, criar loja...): devolve um File já recortado (a prévia já mostra o recorte) */
export async function cropOnPick(file: File, kind: 'avatar' | 'logo'): Promise<File> {
    const out = await requestCrop(file, kind === 'avatar' ? 'avatars' : 'store-logos')
    const f = out instanceof File ? out : new File([out], file.name, { type: out.type || file.type })
    done.add(f)
    return f
}
