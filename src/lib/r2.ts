// src/lib/r2.ts
//
// Cloudflare R2 (armazenamento compatível com S3) para arquivos pesados: vídeo, música, arquivos grandes. docs/CONTROLE-DE-UPLOADS.md (seção 5) e migration 20261130000023_upload_r2.sql.
// SERVIDOR APENAS (usa as chaves do R2): nunca importe isto de um componente 'use client'. Sem dependência nova: a assinatura AWS Signature V4 é escrita aqui com node:crypto e conferida
// contra os exemplos oficiais da AWS em scripts/test-upload-r2.mjs.
//
// Como o envio funciona (ao contrário do Supabase, o R2 não tem "dono" do arquivo nem políticas por linha, então o servidor é o porteiro):
//   1. a pessoa pede autorização à rota /api/uploads/r2/sign; a rota chama authorize_upload NO BANCO COMO A PESSOA (login, bloqueios, tipo, tamanho, ritmo, cotas);
//   2. só se autorizado a rota entrega um link de envio (PUT) que vale poucos minutos, para UM caminho e com o tamanho e o tipo do arquivo ASSINADOS (o R2 recusa outro tamanho/tipo);
//   3. o navegador envia direto ao R2 (o arquivo não passa pelo servidor nem pelo Supabase); 4. /api/uploads/r2/complete confere o objeto de verdade (HEAD), registra em media_assets e
//      fecha a autorização; objeto fora do combinado é apagado.
// O bucket é PRIVADO. Ler = link assinado (r2PresignGet) ou, para o que é público, o domínio de mídia ligado ao bucket (R2_PUBLIC_BASE, ex.: https://midia.iuser.com.br).
import { createHash, createHmac } from 'node:crypto'
import { MIME_EXT } from './r2Types.ts'

export type R2Scope = 'media' | 'digital'
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase: string | null; host: string; origin: string; scope: R2Scope }

const REGION = 'auto'
const SERVICE = 's3'
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

type Env = Record<string, string | undefined>
const BUCKET_RE = /^[a-z0-9][a-z0-9-]{2,62}$/

/** Lê a configuração do ambiente. null = R2 não configurado (as rotas respondem 503 e nada quebra).
 *  `media` = o bucket de vídeo/música (R2_BUCKET; pode ter domínio público). `digital` = o bucket PRIVADO do conteúdo vendido (R2_DIGITAL_BUCKET): NUNCA tem domínio público
 *  (publicBase sempre null), pode ter chave própria (R2_DIGITAL_ACCESS_KEY_ID/R2_DIGITAL_SECRET_ACCESS_KEY; sem elas usa as mesmas) e NÃO pode ser o mesmo bucket do `media` (se fosse,
 *  o conteúdo pago ficaria aberto pelo domínio público dele). */
export function readR2Config(env: Env = process.env, scope: R2Scope = 'media'): R2Config | null {
    const accountId = (env.R2_ACCOUNT_ID || '').trim()
    const digital = scope === 'digital'
    const accessKeyId = ((digital && (env.R2_DIGITAL_ACCESS_KEY_ID || '').trim()) || (env.R2_ACCESS_KEY_ID || '').trim())
    const secretAccessKey = ((digital && (env.R2_DIGITAL_SECRET_ACCESS_KEY || '').trim()) || (env.R2_SECRET_ACCESS_KEY || '').trim())
    const bucket = (digital ? env.R2_DIGITAL_BUCKET : env.R2_BUCKET || '')?.toString().trim() || ''
    if (!/^[0-9a-f]{32}$/i.test(accountId) || !accessKeyId || !secretAccessKey || !BUCKET_RE.test(bucket)) return null
    if (digital && bucket === (env.R2_BUCKET || '').trim()) return null   // o conteúdo pago nunca divide bucket com o que tem domínio público
    const base = digital ? '' : (env.R2_PUBLIC_BASE || '').trim().replace(/\/+$/, '')
    // Só para TESTE LOCAL: um "R2 de mentira" em http://127.0.0.1:<porta> (scripts/local/test-r2-flow.mjs). Ignorado em produção e para qualquer endereço que não seja o próprio computador.
    const fake = (env.R2_TEST_ENDPOINT || '').trim().match(/^http:\/\/(127\.0\.0\.1|localhost):(\d{2,5})$/)
    const testing = !!fake && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production'
    const host = testing ? `${fake![1]}:${fake![2]}` : `${accountId}.r2.cloudflarestorage.com`
    return { accountId, accessKeyId, secretAccessKey, bucket, publicBase: /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base : null, host, origin: `${testing ? 'http' : 'https'}://${host}`, scope }
}

/** A configuração (media ou digital) que corresponde a um bucket lógico do catálogo (`upload_kinds.bucket`). null = esse bucket não está configurado neste servidor. */
export function r2ConfigForBucket(bucket: string, env: Env = process.env): R2Config | null {
    for (const scope of ['media', 'digital'] as const) { const c = readR2Config(env, scope); if (c && c.bucket === bucket) return c }
    return null
}

/** O que está errado na configuração (só NOMES das variáveis e o motivo, nunca os valores). Lista vazia = pronto. Alimenta o botão "Testar o R2" do painel. */
export function r2ConfigProblems(env: Env = process.env, scope: R2Scope = 'media'): string[] {
    const out: string[] = []
    const v = (n: string) => (env[n] || '').trim()
    const digital = scope === 'digital'
    if (!v('R2_ACCOUNT_ID')) out.push('R2_ACCOUNT_ID não está definida.'); else if (!/^[0-9a-f]{32}$/i.test(v('R2_ACCOUNT_ID'))) out.push('R2_ACCOUNT_ID deve ter 32 letras/números (o Account ID da Cloudflare).')
    if (!(digital && v('R2_DIGITAL_ACCESS_KEY_ID')) && !v('R2_ACCESS_KEY_ID')) out.push('R2_ACCESS_KEY_ID não está definida.')
    if (!(digital && v('R2_DIGITAL_SECRET_ACCESS_KEY')) && !v('R2_SECRET_ACCESS_KEY')) out.push('R2_SECRET_ACCESS_KEY não está definida.')
    const name = digital ? 'R2_DIGITAL_BUCKET' : 'R2_BUCKET'
    if (!v(name)) out.push(`${name} não está definida.`); else if (!BUCKET_RE.test(v(name))) out.push(`${name} tem um nome inválido (só minúsculas, números e hífen).`)
    else if (digital && v(name) === v('R2_BUCKET')) out.push('R2_DIGITAL_BUCKET não pode ser o mesmo bucket de R2_BUCKET (esse tem domínio público): crie um bucket PRIVADO só para o conteúdo vendido.')
    return out
}

/** Caminho do objeto: só letras, números, ponto, hífen, sublinhado e barra; sem "..", sem barra no começo/fim. */
export function isSafeR2Key(key: unknown): key is string {
    return typeof key === 'string' && key.length > 0 && key.length <= 400 && /^[A-Za-z0-9._/-]+$/.test(key) && !/(^|\/)\.\.(\/|$)/.test(key) && !key.startsWith('/') && !key.endsWith('/')
}

/** Extensão do arquivo pelo tipo declarado (o servidor escolhe o nome; o nome que a pessoa deu nunca entra no caminho). */
export function extensionForMime(mime: string): string | null {
    return MIME_EXT[String(mime || '').toLowerCase().trim()] ?? null
}
export const R2_MIME_TYPES = Object.keys(MIME_EXT)

// ---------- AWS Signature V4 ----------
const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()

/** RFC 3986 (o que o S3 exige): encodeURIComponent deixa passar ! ' ( ) * que precisam ser codificados. */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const encodePath = (path: string) => path.split('/').map(enc).join('/')

function amzDates(now: Date) {
    const iso = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')   // 20130524T000000Z
    return { amzDate: iso, dateStamp: iso.slice(0, 8) }
}
function signingKey(secret: string, dateStamp: string, region: string, service: string) {
    return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request')
}
function canonical(method: string, path: string, query: Record<string, string>, headers: Record<string, string>, payloadHash: string) {
    const names = Object.keys(headers).map((h) => h.toLowerCase()).sort()
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]))
    const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&')
    const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('')
    const signedHeaders = names.join(';')
    return { request: [method, encodePath(path), canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n'), signedHeaders, canonicalQuery }
}

export type SignBase = { host: string; scheme?: 'http' | 'https'; path: string; method: string; accessKeyId: string; secretAccessKey: string; region?: string; service?: string; now?: Date }

/** Link assinado (a assinatura vai na URL): serve para o navegador enviar (PUT) ou ler (GET) sem ter as chaves. `headers` são os cabeçalhos que ficam ASSINADOS além do host. */
export function presignUrl(p: SignBase & { expires: number; headers?: Record<string, string>; query?: Record<string, string> }): string {
    const region = p.region ?? REGION, service = p.service ?? SERVICE
    const { amzDate, dateStamp } = amzDates(p.now ?? new Date())
    const scope = `${dateStamp}/${region}/${service}/aws4_request`
    const headers: Record<string, string> = { host: p.host, ...(p.headers || {}) }
    const signedNames = Object.keys(headers).map((h) => h.toLowerCase()).sort().join(';')
    const query: Record<string, string> = {
        ...(p.query || {}),
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.floor(p.expires)))),
        'X-Amz-SignedHeaders': signedNames,
    }
    const c = canonical(p.method, p.path, query, headers, 'UNSIGNED-PAYLOAD')
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(c.request)].join('\n')
    const signature = createHmac('sha256', signingKey(p.secretAccessKey, dateStamp, region, service)).update(toSign).digest('hex')
    return `${p.scheme ?? 'https'}://${p.host}${encodePath(p.path)}?${c.canonicalQuery}&X-Amz-Signature=${signature}`
}

/** Cabeçalhos assinados (Authorization) para o SERVIDOR chamar o R2 (HEAD, DELETE...). */
export function signHeaders(p: SignBase & { headers?: Record<string, string>; payloadHash?: string; query?: Record<string, string> }): Record<string, string> {
    const region = p.region ?? REGION, service = p.service ?? SERVICE
    const { amzDate, dateStamp } = amzDates(p.now ?? new Date())
    const payloadHash = p.payloadHash ?? EMPTY_SHA256
    const headers: Record<string, string> = { ...(p.headers || {}), host: p.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
    const scope = `${dateStamp}/${region}/${service}/aws4_request`
    const c = canonical(p.method, p.path, p.query || {}, headers, payloadHash)
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(c.request)].join('\n')
    const signature = createHmac('sha256', signingKey(p.secretAccessKey, dateStamp, region, service)).update(toSign).digest('hex')
    const out: Record<string, string> = { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${scope},SignedHeaders=${c.signedHeaders},Signature=${signature}` }
    delete out.host   // o fetch põe o host sozinho (ele já entrou na assinatura)
    return out
}

// ---------- operações ----------
const objectPath = (cfg: R2Config, key: string) => `/${cfg.bucket}/${key}`
const schemeOf = (cfg: R2Config) => (cfg.origin.startsWith('http://') ? 'http' : 'https') as 'http' | 'https'
const need = (key: string) => { if (!isSafeR2Key(key)) throw new Error('Caminho de arquivo inválido') }

/** Link de ENVIO (PUT). O tipo e o tamanho ficam assinados: o R2 recusa um arquivo de outro tamanho ou tipo. */
export function r2PresignPut(cfg: R2Config, key: string, o: { contentType: string; contentLength: number; expiresSec?: number; now?: Date }): string {
    need(key)
    if (!Number.isInteger(o.contentLength) || o.contentLength <= 0) throw new Error('Tamanho inválido')
    return presignUrl({
        host: cfg.host, scheme: schemeOf(cfg), path: objectPath(cfg, key), method: 'PUT', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, now: o.now,
        expires: o.expiresSec ?? 900, headers: { 'content-type': o.contentType, 'content-length': String(o.contentLength) },
    })
}

/** Link de LEITURA (GET) por tempo limitado. `downloadName` faz o navegador baixar com esse nome (cabeçalho Content-Disposition da resposta, assinado no link). */
export function r2PresignGet(cfg: R2Config, key: string, o: { expiresSec?: number; now?: Date; downloadName?: string } = {}): string {
    need(key)
    const query = o.downloadName ? { 'response-content-disposition': contentDisposition(o.downloadName) } : undefined
    return presignUrl({ host: cfg.host, scheme: schemeOf(cfg), path: objectPath(cfg, key), method: 'GET', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, now: o.now, expires: o.expiresSec ?? 3600, query })
}

/** attachment; filename="..."; filename*=UTF-8''... — só caracteres seguros no nome simples; o nome completo (acentos) vai codificado */
export function contentDisposition(name: string): string {
    const clean = String(name || 'arquivo').replace(/[\u0000-\u001f\u007f"\\/]/g, '_').slice(0, 200).trim() || 'arquivo'
    const ascii = clean.replace(/[^\x20-\x7e]/g, '_').replace(/[;%]/g, '_')
    return `attachment; filename="${ascii}"; filename*=UTF-8''${enc(clean)}`
}

/** Endereço público do arquivo, só se o domínio de mídia estiver ligado ao bucket (R2_PUBLIC_BASE). */
export function r2PublicUrl(cfg: R2Config, key: string): string | null {
    return cfg.publicBase && isSafeR2Key(key) ? `${cfg.publicBase}/${encodePath(key)}` : null
}

type Fetch = typeof fetch
export type R2Head = { exists: false } | { exists: true; size: number; contentType: string | null }

/** O objeto existe? Qual o tamanho e o tipo REAIS? (o que a pessoa disse não vale: vale o que o R2 guardou) */
export async function r2Head(cfg: R2Config, key: string, f: Fetch = fetch): Promise<R2Head> {
    need(key)
    const path = objectPath(cfg, key)
    const res = await f(`${cfg.origin}${encodePath(path)}`, { method: 'HEAD', headers: signHeaders({ host: cfg.host, path, method: 'HEAD', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }) })
    if (res.status === 404) return { exists: false }
    if (!res.ok) throw new Error(`R2 HEAD ${res.status}`)
    return { exists: true, size: Number(res.headers.get('content-length') || 0), contentType: res.headers.get('content-type') }
}

/** Grava um objeto pequeno pelo servidor (usado só no teste de conexão do painel). */
export async function r2Put(cfg: R2Config, key: string, body: Buffer, contentType: string, f: Fetch = fetch): Promise<void> {
    need(key)
    const path = objectPath(cfg, key)
    const res = await f(`${cfg.origin}${encodePath(path)}`, { method: 'PUT', body: new Uint8Array(body), headers: signHeaders({ host: cfg.host, path, method: 'PUT', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, payloadHash: sha256Hex(body), headers: { 'content-type': contentType } }) })
    if (!res.ok) throw new Error(`R2 PUT ${res.status}`)
}

/** Apaga o objeto (204 também quando ele já não existe). */
export async function r2Delete(cfg: R2Config, key: string, f: Fetch = fetch): Promise<void> {
    need(key)
    const path = objectPath(cfg, key)
    const res = await f(`${cfg.origin}${encodePath(path)}`, { method: 'DELETE', headers: signHeaders({ host: cfg.host, path, method: 'DELETE', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }) })
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`)
}

export type R2Object = { key: string; size: number; lastModified: Date }

/** Lista os objetos do bucket (ListObjectsV2), no máximo `max` (padrão 5000), em páginas de 1000. Só para a limpeza: quem usa decide o que fazer; aqui só se lê. */
export async function r2ListAll(cfg: R2Config, max = 5000, f: Fetch = fetch): Promise<{ objects: R2Object[]; truncated: boolean }> {
    const objects: R2Object[] = []
    let token: string | null = null
    for (;;) {
        const query: Record<string, string> = { 'list-type': '2', 'max-keys': String(Math.min(1000, max - objects.length)) }
        if (token) query['continuation-token'] = token
        const path = `/${cfg.bucket}`
        const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&')
        const res = await f(`${cfg.origin}${encodePath(path)}?${qs}`, { method: 'GET', headers: signHeaders({ host: cfg.host, path, method: 'GET', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, query }) })
        if (!res.ok) throw new Error(`R2 LIST ${res.status}`)
        const xml = await res.text()
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
            const key = m[1].match(/<Key>([^<]*)<\/Key>/)?.[1], size = m[1].match(/<Size>(\d+)<\/Size>/)?.[1], lm = m[1].match(/<LastModified>([^<]*)<\/LastModified>/)?.[1]
            if (key && size && lm && !Number.isNaN(Date.parse(lm))) objects.push({ key: key.replace(/&amp;/g, '&'), size: Number(size), lastModified: new Date(lm) })
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? null
        if (!truncated || !token) return { objects, truncated: false }
        if (objects.length >= max) return { objects, truncated: true }
    }
}
