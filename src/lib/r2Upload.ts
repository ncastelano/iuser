// src/lib/r2Upload.ts
//
// NAVEGADOR: envia um arquivo pesado (vídeo, música) ao Cloudflare R2 pelo caminho autorizado (migration 20261130000023): pede o link a /api/uploads/r2/sign, envia DIRETO ao R2 (o arquivo
// não passa pelo servidor nem pelo Supabase) e confirma em /api/uploads/r2/complete. Não tem chave nenhuma: tudo que precisa de segredo é do servidor (src/lib/r2.ts, que NÃO pode ser
// importado aqui). As regras (tipo, tamanho, ritmo, cota, bloqueio) vêm do banco; aqui só se orquestra e se mostra a mensagem em português que o servidor mandou.
// Sem importar o cliente do Supabase nem usar o alias '@/', para rodar nos testes de Node; fetch e envio são injetáveis.

export type R2UploadResult =
    | { ok: true; id: string; key: string; bytes: number; url: string | null }
    | { ok: false; code: string; message: string }

export type R2UploadOptions = { onProgress?: (percent: number) => void; signal?: AbortSignal }
export type R2UploadDeps = {
    fetch?: typeof fetch
    /** Envia o arquivo ao link assinado (PUT). Padrão: XMLHttpRequest, que tem progresso. */
    put?: (url: string, headers: Record<string, string>, body: Blob, onProgress?: (percent: number) => void, signal?: AbortSignal) => Promise<{ status: number }>
}

type ApiFail = { ok: false; code?: string; error?: string }
const failure = (code: string, message: string): R2UploadResult => ({ ok: false, code, message })
const text = (j: unknown, fallback: string) => (j && typeof (j as ApiFail).error === 'string' ? (j as ApiFail).error! : fallback)

function xhrPut(url: string, headers: Record<string, string>, body: Blob, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
        if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))) }
        xhr.onload = () => resolve({ status: xhr.status })
        xhr.onerror = () => reject(new Error('network'))
        xhr.onabort = () => reject(new DOMException('Envio cancelado', 'AbortError'))
        signal?.addEventListener('abort', () => xhr.abort(), { once: true })
        xhr.send(body)
    })
}

export async function uploadToR2(file: Blob, kind: string, opts: R2UploadOptions = {}, deps: R2UploadDeps = {}): Promise<R2UploadResult> {
    const f = deps.fetch ?? fetch
    const put = deps.put ?? xhrPut
    if (!file || file.size <= 0) return failure('empty_file', 'O arquivo está vazio.')
    if (!file.type) return failure('type_not_allowed', 'Não foi possível identificar o formato do arquivo.')

    // 1) autorização (o servidor decide e escolhe o nome do arquivo)
    let sign: { ok: true; url: string; headers: Record<string, string>; key: string } | ApiFail
    try {
        const res = await f('/api/uploads/r2/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, mime: file.type, bytes: file.size }), signal: opts.signal })
        sign = await res.json()
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') return failure('aborted', 'Envio cancelado.')
        return failure('network', 'Sem conexão. Verifique a internet e tente de novo.')
    }
    if (!sign.ok) return failure(sign.code || 'denied', text(sign, 'Não foi possível autorizar o envio.'))

    // 2) envio direto ao R2
    try {
        const r = await put(sign.url, sign.headers, file, opts.onProgress, opts.signal)
        if (r.status < 200 || r.status >= 300) return failure('upload_failed', r.status === 403 ? 'O armazenamento recusou o arquivo. Tente de novo; se continuar, avise o suporte.' : 'Não foi possível enviar o arquivo. Tente de novo.')
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') return failure('aborted', 'Envio cancelado.')
        return failure('network', 'O envio foi interrompido. Verifique a internet e tente de novo.')
    }

    // 3) confirmação: o servidor confere o que chegou e registra
    try {
        const res = await f('/api/uploads/r2/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: sign.key }) })
        const done = (await res.json()) as { ok: true; id: string; key: string; bytes: number; url: string | null } | ApiFail
        if (!done.ok) return failure(done.code || 'complete_failed', text(done, 'Não foi possível concluir o envio.'))
        return { ok: true, id: done.id, key: done.key, bytes: done.bytes, url: done.url }
    } catch {
        return failure('network', 'Não foi possível confirmar o envio. Verifique a internet e tente de novo.')
    }
}

export type R2Availability = { available: false } | { available: true; maxBytes: number; mimeTypes: string[] | null }
const availCache = new Map<string, { at: number; value: Promise<R2Availability> }>()

/** O envio pelo R2 está pronto (configurado E tipo ligado)? Guarda a resposta por 30 s (e reaproveita a consulta em andamento). Qualquer falha = não disponível: o app usa o caminho do Supabase. */
export function r2Availability(kind: string, deps: Pick<R2UploadDeps, 'fetch'> = {}, now = Date.now()): Promise<R2Availability> {
    const hit = availCache.get(kind)
    if (hit && now - hit.at < 30_000) return hit.value
    const value = (async (): Promise<R2Availability> => {
        try {
            const res = await (deps.fetch ?? fetch)(`/api/uploads/r2/sign?kind=${encodeURIComponent(kind)}`)
            const j = (await res.json()) as { available?: boolean; maxBytes?: number; mimeTypes?: string[] | null }
            if (res.ok && j.available === true && typeof j.maxBytes === 'number' && j.maxBytes > 0) return { available: true, maxBytes: j.maxBytes, mimeTypes: j.mimeTypes ?? null }
        } catch { /* sem rede ou erro: não disponível */ }
        return { available: false }
    })()
    availCache.set(kind, { at: now, value })
    return value
}
export const resetR2AvailabilityCache = () => availCache.clear()

/** Apaga do R2 um arquivo seu que nenhum flash usa mais. Nunca lança: é limpeza, não pode atrapalhar a ação da pessoa. */
export async function removeFromR2(key: string, deps: Pick<R2UploadDeps, 'fetch'> = {}): Promise<boolean> {
    try {
        const res = await (deps.fetch ?? fetch)('/api/uploads/r2/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
        const j = (await res.json()) as { ok?: boolean; removed?: boolean }
        return res.ok && j.ok === true && j.removed === true
    } catch { return false }
}
