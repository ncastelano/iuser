// app/api/uploads/r2/sign/route.ts
//
// POST { kind, mime, bytes } → link de envio ao Cloudflare R2 (src/lib/r2.ts). Roda como a própria pessoa (cookies de sessão).
// O PORTEIRO é o banco: authorize_upload confere login, bloqueios, tipo ligado, tipo de arquivo, tamanho, ritmo e cotas (a mesma função do Supabase), e só então se assina o link.
// O nome do arquivo é escolhido AQUI (<id da pessoa>/<uuid>.<extensão pelo tipo>): nada que a pessoa digitou entra no caminho. O link vale 15 minutos para COMEÇAR o envio, é de UM caminho
// e leva o tipo e o tamanho assinados (o R2 recusa outro tamanho ou tipo).
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { r2ConfigForBucket, r2PresignPut } from '@/lib/r2'
import { resolveUploadExtension } from '@/lib/r2Types'
import { uploadDeniedMessage } from '@/lib/uploadAuthorization'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const KIND = /^[a-z][a-z0-9_]{1,40}$/
const LINK_SECONDS = 900

const STATUS: Record<string, number> = { not_authenticated: 401, rate_limited: 429, too_large: 413, daily_quota: 413, storage_quota: 413, type_not_allowed: 415 }
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, code, error, ...extra }, { status, headers: NO_STORE })

/** O app pergunta antes de oferecer o envio pesado: o R2 está configurado E o tipo está ligado? (resposta pública e sem segredo; se algo falhar, "não disponível" e o app usa o Supabase) */
export async function GET(req: Request) {
    const kind = new URL(req.url).searchParams.get('kind') || ''
    const off = NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'private, max-age=30' } })
    if (!KIND.test(kind)) return off
    const { data: k } = await supabaseAdmin.from('upload_kinds').select('enabled, max_bytes, mime_types, bucket').eq('kind', kind).eq('provider', 'r2').maybeSingle()
    if (!k || !k.enabled || !r2ConfigForBucket(k.bucket)) return off   // cada tipo aponta para o seu bucket (vídeo/música ou o privado do digital); sem as variáveis desse bucket: não disponível
    return NextResponse.json({ available: true, maxBytes: Number(k.max_bytes), mimeTypes: k.mime_types ?? null }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}

export async function POST(req: Request) {
    const supabase = await createServerSupabase()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return fail(401, 'not_authenticated', 'Entre na sua conta para enviar arquivos.')

    const body = (await req.json().catch(() => null)) as { kind?: unknown; mime?: unknown; bytes?: unknown; ext?: unknown } | null
    const kind = typeof body?.kind === 'string' ? body.kind : ''
    const mime = typeof body?.mime === 'string' ? body.mime.toLowerCase().trim() : ''
    const bytes = body?.bytes
    if (!KIND.test(kind) || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return fail(400, 'invalid_request', 'Pedido de envio inválido.')
    // a extensão do caminho: pelo tipo declarado; programa e pacote (octet-stream) só com extensão da lista fechada. Nada mais digitado entra no nome.
    const ext = resolveUploadExtension(mime, body?.ext)
    if (!ext) return fail(415, 'type_not_allowed', uploadDeniedMessage({ ok: false, error: 'type_not_allowed' }))

    const { data: k, error: kErr } = await supabaseAdmin.from('upload_kinds').select('kind, bucket, provider').eq('kind', kind).eq('provider', 'r2').maybeSingle()
    if (kErr) return fail(500, 'server_error', 'Não foi possível preparar o envio. Tente de novo.')
    if (!k) return fail(400, 'invalid_request', 'Tipo de envio inválido.')
    const cfg = r2ConfigForBucket(k.bucket)
    if (!cfg) return fail(503, 'r2_unconfigured', 'O envio de arquivos pesados ainda não está disponível.')   // o bucket deste tipo não está configurado neste servidor

    const key = `${user.id}/${randomUUID()}.${ext}`
    const { data, error } = await supabase.rpc('authorize_upload', { p_bucket: k.bucket, p_path: key, p_bytes: bytes, p_mime: mime, p_upsert: false })
    if (error || !data) return fail(502, 'authorize_unavailable', 'Não foi possível autorizar o envio agora. Tente de novo.')
    const a = data as { ok?: boolean; error?: string; grant?: string; limit?: number; used?: number; retry_after?: number; reason?: string }
    if (!a.ok) return fail(STATUS[a.error || ''] ?? 403, a.error || 'denied', uploadDeniedMessage({ ...a, ok: false }), a.retry_after ? { retryAfter: a.retry_after } : {})

    const url = r2PresignPut(cfg, key, { contentType: mime, contentLength: bytes, expiresSec: LINK_SECONDS })
    return NextResponse.json({ ok: true, url, method: 'PUT', headers: { 'Content-Type': mime }, key, kind: k.kind, expiresIn: LINK_SECONDS }, { headers: NO_STORE })
}
