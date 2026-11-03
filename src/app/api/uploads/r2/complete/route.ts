// app/api/uploads/r2/complete/route.ts
//
// POST { key } → depois do envio direto ao R2, confere o objeto DE VERDADE (HEAD: tamanho e tipo que o R2 guardou, não o que a pessoa disse), registra em media_assets e fecha a autorização
// (register_r2_asset, só serviço). Objeto fora do combinado (maior que o autorizado, tipo errado, acima do máximo do tipo) é APAGADO do R2. Roda como a própria pessoa.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { readR2Config, isSafeR2Key, r2Head, r2Delete, r2PublicUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (status: number, code: string, error: string) => NextResponse.json({ ok: false, code, error }, { status, headers: NO_STORE })

export async function POST(req: Request) {
    const cfg = readR2Config()
    if (!cfg) return fail(503, 'r2_unconfigured', 'O envio de arquivos pesados ainda não está disponível.')

    const supabase = await createServerSupabase()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return fail(401, 'not_authenticated', 'Entre na sua conta para enviar arquivos.')

    const body = (await req.json().catch(() => null)) as { key?: unknown } | null
    const key = body?.key
    if (!isSafeR2Key(key) || key.split('/')[0] !== user.id) return fail(400, 'invalid_request', 'Arquivo inválido.')

    // a autorização desta pessoa para ESTE caminho (aberta, não usada, dentro da validade)
    const { data: grant } = await supabaseAdmin.from('upload_grants').select('id, kind, bucket, declared_bytes')
        .eq('profile_id', user.id).eq('key', key).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!grant || grant.bucket !== cfg.bucket) return fail(404, 'no_grant', 'Este envio não foi autorizado ou já venceu. Envie o arquivo de novo.')
    const { data: k } = await supabaseAdmin.from('upload_kinds').select('kind, max_bytes, mime_types').eq('kind', grant.kind).eq('provider', 'r2').maybeSingle()
    if (!k) return fail(404, 'no_grant', 'Este envio não foi autorizado ou já venceu. Envie o arquivo de novo.')

    let head
    try { head = await r2Head(cfg, key) } catch { return fail(502, 'storage_unavailable', 'Não foi possível conferir o arquivo agora. Tente de novo.') }
    if (!head.exists) return fail(409, 'not_uploaded', 'O arquivo ainda não chegou ao armazenamento. Tente de novo.')

    const mime = (head.contentType || '').split(';')[0].trim().toLowerCase()
    const declared = Number(grant.declared_bytes)
    const bad = head.size <= 0 ? 'O arquivo está vazio.'
        : head.size > Number(k.max_bytes) || head.size > declared ? 'O arquivo é maior do que o autorizado.'
        : k.mime_types && !k.mime_types.includes(mime) ? 'Formato de arquivo não aceito.' : null
    if (bad) {
        try { await r2Delete(cfg, key) } catch { /* fica registrado só na autorização vencida; a limpeza do R2 virá com o uso real */ }
        return fail(422, 'rejected', bad)
    }

    const { data: id, error } = await supabaseAdmin.rpc('register_r2_asset', { p_owner: user.id, p_kind: k.kind, p_key: key, p_bytes: head.size, p_mime: mime })
    if (error) {
        if (error.code === '42501') return fail(404, 'no_grant', 'Este envio não foi autorizado ou já venceu. Envie o arquivo de novo.')
        console.error('[r2/complete] register_r2_asset', error.message)
        return fail(500, 'server_error', 'Não foi possível registrar o arquivo. Tente de novo.')
    }
    return NextResponse.json({ ok: true, id, key, bytes: head.size, mime, url: r2PublicUrl(cfg, key) }, { headers: NO_STORE })
}
