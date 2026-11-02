// src/lib/uploadAuthorization.ts
//
// Autorização de envio (migration 20261130000020). Antes de cada upload o ponto central (lib/supabase/client.ts) pede ao BANCO, como a própria pessoa, a função authorize_upload:
// ela confere login, conta bloqueada, bloqueios, tipo, tamanho, caminho, plano, ritmo (arquivos por hora) e cotas (por dia e total) e grava uma autorização curta que a política do
// Storage exige quando o interruptor "envio só com autorização" está ligado. Aqui só se PEDE e se TRADUZ a resposta em português; nenhuma regra mora aqui.
//
// Falha-aberta de propósito no navegador: se o banco não responde (rede, migration ainda não aplicada, sem login), devolve 'unavailable' e o envio segue DIRETO — quem decide então é a
// política do Storage (que, ligado o interruptor, recusa sem autorização). Assim nada que funcionava deixa de funcionar por causa deste arquivo.
// Sem importar o cliente do Supabase (recebe por argumento) e sem alias '@/', para rodar nos testes de Node.
import { formatBytes } from './uploadLimits.ts'
import { isMissingFunction } from './mediaAssets.ts'

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }

export type AuthorizeInput = { bucket: string; path: string; bytes: number; mime: string; upsert?: boolean }
export type AuthorizeResult =
    | { status: 'ok' }
    | { status: 'denied'; code: string; message: string; retryAfter?: number }
    | { status: 'unavailable' }

type Denial = { ok: false; error?: string; limit?: number; used?: number; retry_after?: number; reason?: string }

/** "menos de 1 minuto", "5 minutos", "2 horas". */
export function waitText(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds))
    if (s < 60) return 'menos de 1 minuto'
    const m = Math.ceil(s / 60)
    if (m < 60) return m === 1 ? '1 minuto' : `${m} minutos`
    const h = Math.ceil(m / 60)
    return h === 1 ? '1 hora' : `${h} horas`
}

/** O texto que a pessoa vê para cada código que authorize_upload devolve. */
export function uploadDeniedMessage(d: Denial): string {
    switch (d.error) {
        case 'not_authenticated': return 'Entre na sua conta para enviar arquivos.'
        case 'kind_disabled': return 'Este tipo de envio está temporariamente desativado.'
        case 'wrong_provider': return 'Este tipo de envio ainda não está disponível.'
        case 'account_blocked': return 'Sua conta não pode enviar arquivos no momento.'
        case 'blocked': return d.reason ? `Seus envios estão bloqueados: ${d.reason}` : 'Seus envios estão bloqueados no momento.'
        case 'type_not_allowed': return 'Formato de arquivo não aceito.'
        case 'empty_file': return 'O arquivo está vazio.'
        case 'too_large': return typeof d.limit === 'number' ? `O arquivo pode ter até ${formatBytes(d.limit)}.` : 'O arquivo é grande demais.'
        case 'invalid_path': return 'O nome do arquivo não é válido.'
        case 'wrong_folder': return 'Não foi possível enviar o arquivo para esse local.'
        case 'not_owner': return 'Esse arquivo pertence a outra pessoa.'
        case 'plan_required': return 'Para enviar este tipo de arquivo você precisa de um plano ativo.'
        case 'rate_limited': return `Muitos envios em pouco tempo. Tente de novo em ${waitText(d.retry_after ?? 60)}.`
        case 'daily_quota': return typeof d.limit === 'number' ? `Você atingiu o limite de envios de hoje (${formatBytes(d.limit)}). Tente de novo amanhã.` : 'Você atingiu o limite de envios de hoje. Tente de novo amanhã.'
        case 'storage_quota': return typeof d.limit === 'number' ? `Você atingiu o espaço máximo para este tipo de arquivo (${formatBytes(d.limit)}). Apague arquivos antigos para enviar novos.` : 'Você atingiu o espaço máximo para este tipo de arquivo.'
        default: return 'Não foi possível autorizar o envio.'
    }
}

/** Código HTTP-ish para o erro devolvido ao chamador (429 = tente depois; 413 = grande; 403 = o resto). */
export function uploadDeniedStatus(code: string | undefined): string {
    if (code === 'rate_limited') return '429'
    if (code === 'too_large' || code === 'daily_quota' || code === 'storage_quota') return '413'
    if (code === 'type_not_allowed') return '415'
    return '403'
}

let disabled = false

/** Tamanho e tipo do que vai ser enviado (Blob, ArrayBuffer ou typed array); null quando não dá para saber (FormData, stream): aí não há como autorizar e o envio segue direto. */
export function uploadBodyInfo(body: unknown, options?: { contentType?: string } | null): { bytes: number; mime: string } | null {
    if (typeof Blob !== 'undefined' && body instanceof Blob) return { bytes: body.size, mime: options?.contentType || body.type || '' }
    if (body instanceof ArrayBuffer) return { bytes: body.byteLength, mime: options?.contentType || '' }
    if (ArrayBuffer.isView(body)) return { bytes: body.byteLength, mime: options?.contentType || '' }
    return null
}

/** Pede a autorização ao banco. Nunca lança. */
export async function authorizeUpload(client: RpcClient, input: AuthorizeInput): Promise<AuthorizeResult> {
    if (disabled || !input.bucket || !input.path) return { status: 'unavailable' }
    try {
        const { data, error } = await client.rpc('authorize_upload', {
            p_bucket: input.bucket, p_path: input.path, p_bytes: input.bytes, p_mime: input.mime || '', p_upsert: !!input.upsert,
        })
        if (error) {
            if (isMissingFunction(error)) disabled = true
            return { status: 'unavailable' }
        }
        const r = data as { ok?: boolean; error?: string } | null
        if (r?.ok === true) return { status: 'ok' }
        if (r?.ok === false) {
            const d = r as Denial
            return { status: 'denied', code: d.error || 'unknown', message: uploadDeniedMessage(d), retryAfter: typeof d.retry_after === 'number' ? d.retry_after : undefined }
        }
        return { status: 'unavailable' }
    } catch {
        return { status: 'unavailable' }
    }
}
