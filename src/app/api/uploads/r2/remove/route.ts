// app/api/uploads/r2/remove/route.ts
//
// POST { key } → a pessoa apaga um arquivo SEU do R2 que nenhum flash usa mais (ex.: depois de apagar o flash). Roda como a própria pessoa. Ordem: confere que ninguém usa, apaga o objeto no R2 e só então
// marca o registro como apagado (release_r2_asset, só serviço, que também confere dono e uso). Se o R2 falhar, nada é marcado e dá para tentar de novo.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { readR2Config, isSafeR2Key, r2Delete } from '@/lib/r2'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (status: number, code: string, error: string) => NextResponse.json({ ok: false, code, error }, { status, headers: NO_STORE })

export async function POST(req: Request) {
    const cfg = readR2Config()
    if (!cfg) return fail(503, 'r2_unconfigured', 'O armazenamento de arquivos pesados ainda não está disponível.')
    const supabase = await createServerSupabase()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return fail(401, 'not_authenticated', 'Entre na sua conta.')
    const body = (await req.json().catch(() => null)) as { key?: unknown } | null
    const key = body?.key
    if (!isSafeR2Key(key) || key.split('/')[0] !== user.id) return fail(400, 'invalid_request', 'Arquivo inválido.')

    const { data: asset } = await supabaseAdmin.from('media_assets').select('id').eq('provider', 'r2').eq('bucket', cfg.bucket).eq('key', key).eq('owner_id', user.id).eq('state', 'ready').maybeSingle()
    if (!asset) return NextResponse.json({ ok: true, removed: false }, { headers: NO_STORE })   // já apagado, ou não é seu: nada a fazer
    const { count } = await supabaseAdmin.from('flashes').select('id', { count: 'exact', head: true }).eq('media_url', key)
    if ((count ?? 0) > 0) return fail(409, 'in_use', 'Este arquivo ainda está em uso.')

    try { await r2Delete(cfg, key) } catch { return fail(502, 'storage_unavailable', 'Não foi possível apagar o arquivo agora. Tente de novo.') }
    const { data: released, error } = await supabaseAdmin.rpc('release_r2_asset', { p_owner: user.id, p_key: key })
    if (error) console.error('[r2/remove] release_r2_asset', error.message)
    return NextResponse.json({ ok: true, removed: released === true }, { headers: NO_STORE })
}
