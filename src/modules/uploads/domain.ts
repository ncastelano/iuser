// src/modules/uploads/domain.ts — regras PURAS do catálogo de uploads (tabela upload_kinds; ver docs/CONTROLE-DE-UPLOADS.md). Sem React nem rede.
// O Admin vai editar o catálogo (Camada 5); estas funções são a validação que a tela e a rota usam, para a regra ser uma só.

export const UPLOAD_PROVIDERS = ['supabase', 'r2', 'stream'] as const
export type UploadProvider = (typeof UPLOAD_PROVIDERS)[number]

/** Provedores com envio JÁ implementado no app. r2 (Cloudflare R2) e stream (Cloudflare Stream) existem no catálogo, mas só podem ser escolhidos quando entrarem aqui. */
export const READY_PROVIDERS: readonly UploadProvider[] = ['supabase']

export function isProviderReady(provider: string): boolean {
    return (READY_PROVIDERS as readonly string[]).includes(provider)
}

export type UploadKind = {
    kind: string
    label: string
    bucket: string
    provider: UploadProvider
    max_bytes: number
    mime_types: string[] | null
    enabled: boolean
}

const KIND_RE = /^[a-z][a-z0-9_]{1,40}$/
const MIME_RE = /^[a-z]+\/[a-z0-9.+-]+$/

export { formatBytes } from '../../lib/uploadLimits.ts'

/** Erros de um tipo de upload (lista vazia = válido). Vale para criar e para editar. */
export function validateUploadKind(k: Partial<UploadKind>): string[] {
    const errors: string[] = []
    if (!k.kind || !KIND_RE.test(k.kind)) errors.push('O código do tipo deve ter letras minúsculas, números e _ (2 a 41 caracteres).')
    if (!k.label || !k.label.trim()) errors.push('Dê um nome ao tipo.')
    if (!k.bucket || !k.bucket.trim()) errors.push('Escolha o bucket.')
    if (!k.provider || !(UPLOAD_PROVIDERS as readonly string[]).includes(k.provider)) errors.push('Provedor inválido.')
    else if (!isProviderReady(k.provider)) errors.push(`O provedor ${k.provider} ainda não está pronto no app: o envio por ele não foi implementado.`)
    if (typeof k.max_bytes !== 'number' || !Number.isFinite(k.max_bytes) || k.max_bytes <= 0) errors.push('O tamanho máximo deve ser maior que zero.')
    if (k.mime_types != null) {
        if (k.mime_types.length === 0) errors.push('A lista de tipos aceitos não pode ser vazia (deixe em branco para aceitar qualquer tipo).')
        else if (k.mime_types.some((m) => !MIME_RE.test(m))) errors.push('Há um tipo de arquivo inválido na lista (ex.: image/jpeg).')
        else if (k.mime_types.some((m) => m === 'image/svg+xml' || m === 'text/html')) errors.push('SVG e HTML não são aceitos: podem carregar script.')
    }
    return errors
}

/** Resumo para o painel: bytes totais e nº de arquivos somados. */
export function sumUsage(rows: { files: number; bytes: number }[]): { files: number; bytes: number } {
    return rows.reduce((acc, r) => ({ files: acc.files + (Number(r.files) || 0), bytes: acc.bytes + (Number(r.bytes) || 0) }), { files: 0, bytes: 0 })
}
