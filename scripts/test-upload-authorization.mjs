// Autorização de envio, cotas e bloqueios (src/lib/uploadAuthorization.ts, lib/supabase/client.ts, migration 20261130000020). Rodar: npm run test:upload-authorization
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { authorizeUpload, uploadBodyInfo, uploadDeniedMessage, uploadDeniedStatus, waitText } from '../src/lib/uploadAuthorization.ts'
import { formatBytes, MB } from '../src/lib/uploadLimits.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/migrations/20261130000020_upload_authorization.sql')
const catalogSql = read('supabase/migrations/20261130000019_upload_catalog.sql')
const INPUT = { bucket: 'avatars', path: 'u-1.jpg', bytes: 1000, mime: 'image/jpeg', upsert: false }

test('todo código que a função do banco devolve tem mensagem própria em português (nenhum cai na genérica)', () => {
    const codes = [...new Set([...sql.matchAll(/'error', '([a-z_]+)'/g)].map((m) => m[1]))]
    assert.ok(codes.length >= 15, `esperava ao menos 15 códigos, achei ${codes.length}: ${codes}`)
    const generic = uploadDeniedMessage({ ok: false, error: 'codigo-que-nao-existe' })
    for (const code of codes) {
        const msg = uploadDeniedMessage({ ok: false, error: code, limit: 5 * MB, used: 1, retry_after: 120, reason: 'x' })
        assert.notEqual(msg, generic, `o código ${code} está sem mensagem`)
        assert.ok(/[a-zà-ú]/i.test(msg) && msg.length > 10, code)
    }
})

test('mensagens com números: tamanho, espera e motivo', () => {
    assert.equal(uploadDeniedMessage({ ok: false, error: 'too_large', limit: 5 * MB }), 'O arquivo pode ter até 5 MB.')
    assert.match(uploadDeniedMessage({ ok: false, error: 'rate_limited', retry_after: 300 }), /Tente de novo em 5 minutos\./)
    assert.match(uploadDeniedMessage({ ok: false, error: 'rate_limited', retry_after: 20 }), /menos de 1 minuto/)
    assert.match(uploadDeniedMessage({ ok: false, error: 'daily_quota', limit: 50 * MB }), /hoje \(50 MB\)/)
    assert.match(uploadDeniedMessage({ ok: false, error: 'storage_quota', limit: 200 * MB }), /\(200 MB\)\. Apague/)
    assert.equal(uploadDeniedMessage({ ok: false, error: 'blocked', reason: 'envio de spam' }), 'Seus envios estão bloqueados: envio de spam')
    assert.equal(uploadDeniedMessage({ ok: false, error: 'blocked' }), 'Seus envios estão bloqueados no momento.')
    assert.equal(waitText(1), 'menos de 1 minuto'); assert.equal(waitText(60), '1 minuto'); assert.equal(waitText(61), '2 minutos')
    assert.equal(waitText(3600), '1 hora'); assert.equal(waitText(7300), '3 horas')
    assert.equal(formatBytes(2 * 1024 ** 3), '2 GB')
})

test('código de status do erro devolvido ao chamador', () => {
    assert.equal(uploadDeniedStatus('rate_limited'), '429')
    for (const c of ['too_large', 'daily_quota', 'storage_quota']) assert.equal(uploadDeniedStatus(c), '413', c)
    assert.equal(uploadDeniedStatus('type_not_allowed'), '415')
    for (const c of ['blocked', 'account_blocked', 'plan_required', 'not_owner', undefined]) assert.equal(uploadDeniedStatus(c), '403', String(c))
})

test('tamanho e tipo do corpo: Blob, ArrayBuffer e typed array; o que não dá para medir devolve null', () => {
    assert.deepEqual(uploadBodyInfo(new Blob(['abcd'], { type: 'image/png' })), { bytes: 4, mime: 'image/png' })
    assert.deepEqual(uploadBodyInfo(new Blob(['abcd'], { type: 'image/png' }), { contentType: 'image/webp' }), { bytes: 4, mime: 'image/webp' }, 'o contentType informado vence')
    assert.deepEqual(uploadBodyInfo(new Blob(['ab'])), { bytes: 2, mime: '' })
    assert.deepEqual(uploadBodyInfo(new ArrayBuffer(8), { contentType: 'image/png' }), { bytes: 8, mime: 'image/png' })
    assert.deepEqual(uploadBodyInfo(new Uint8Array(3)), { bytes: 3, mime: '' })
    assert.equal(uploadBodyInfo(new FormData()), null)
    assert.equal(uploadBodyInfo('texto'), null)
    assert.equal(uploadBodyInfo(null), null)
})

test('autorizar: manda os 5 argumentos certos e entende ok, ok sem controle e recusa', async () => {
    const calls = []
    const mk = (data) => ({ rpc: async (fn, args) => { calls.push([fn, args]); return { data, error: null } } })
    assert.deepEqual(await authorizeUpload(mk({ ok: true, controlled: true, kind: 'avatar' }), { ...INPUT, upsert: true }), { status: 'ok' })
    assert.deepEqual(calls[0], ['authorize_upload', { p_bucket: 'avatars', p_path: 'u-1.jpg', p_bytes: 1000, p_mime: 'image/jpeg', p_upsert: true }])
    assert.deepEqual(await authorizeUpload(mk({ ok: true, controlled: false }), INPUT), { status: 'ok' })
    const d = await authorizeUpload(mk({ ok: false, error: 'rate_limited', retry_after: 90, limit: 20 }), INPUT)
    assert.equal(d.status, 'denied'); assert.equal(d.code, 'rate_limited'); assert.equal(d.retryAfter, 90); assert.match(d.message, /2 minutos/)
    const b = await authorizeUpload(mk({ ok: false, error: 'blocked', reason: 'abuso' }), INPUT)
    assert.equal(b.status, 'denied'); assert.match(b.message, /abuso/)
    assert.equal((await authorizeUpload(mk({ ok: false }), INPUT)).code, 'unknown', 'recusa sem código ainda é recusa')
    assert.deepEqual(await authorizeUpload({ rpc: async (fn, args) => { calls.push([fn, args]); return { data: { ok: true }, error: null } } }, { ...INPUT, mime: '' }), { status: 'ok' })
    assert.equal(calls.at(-1)[1].p_mime, '', 'tipo vazio vai como texto vazio')
    assert.equal(calls.at(-1)[1].p_upsert, false)
})

test('falha-aberta: qualquer problema para falar com o banco é "unavailable" (o envio segue direto e a política do Storage decide)', async () => {
    const err = (code, message) => ({ rpc: async () => ({ data: null, error: { code, message } }) })
    assert.deepEqual(await authorizeUpload(err('42501', 'permission denied for function authorize_upload'), INPUT), { status: 'unavailable' }, 'visitante sem login')
    assert.deepEqual(await authorizeUpload(err('500', 'boom'), INPUT), { status: 'unavailable' })
    assert.deepEqual(await authorizeUpload({ rpc: async () => { throw new Error('rede caiu') } }, INPUT), { status: 'unavailable' })
    assert.deepEqual(await authorizeUpload({ rpc: async () => ({ data: 'lixo', error: null }) }, INPUT), { status: 'unavailable' })
    assert.deepEqual(await authorizeUpload({ rpc: async () => ({ data: null, error: null }) }, INPUT), { status: 'unavailable' })
    assert.deepEqual(await authorizeUpload({ rpc: async () => ({ data: { ok: true }, error: null }) }, { ...INPUT, bucket: '' }), { status: 'unavailable' })
})

test('migration ainda não aplicada: para de perguntar depois da primeira falha (por último, porque desliga o módulo)', async () => {
    let n = 0
    const missing = { rpc: async () => { n++; return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.authorize_upload' } } } }
    assert.deepEqual(await authorizeUpload(missing, INPUT), { status: 'unavailable' })
    assert.deepEqual(await authorizeUpload(missing, INPUT), { status: 'unavailable' })
    assert.equal(n, 1)
})

test('o ponto central de upload autoriza ANTES de enviar e recusa sem chamar o Storage', () => {
    const c = read('src/lib/supabase/client.ts')
    assert.match(c, /import \{ authorizeUpload, uploadBodyInfo, uploadDeniedStatus \} from '@\/lib\/uploadAuthorization'/)
    const iAuth = c.indexOf('await authorizeUpload(supabase')
    const iUpload = c.indexOf('await originalUpload(path')
    const iPhoto = c.indexOf('checkPhotoUpload(bucket')
    assert.ok(iPhoto > 0 && iAuth > iPhoto && iUpload > iAuth, 'ordem: checagem de foto → autorização → envio')
    assert.match(c, /if \(auth\.status === 'denied'\) return \{ data: null, error: Object\.assign\(new Error\(auth\.message\)/)
    assert.ok(!/auth\.status === 'unavailable'/.test(c), 'indisponível NÃO bloqueia o envio')
    const lib = read('src/lib/uploadAuthorization.ts')
    const imports = lib.split('\n').filter((l) => /^\s*(import|export) .* from /.test(l)).join('\n')
    assert.ok(imports && !/from '@\/|supabase\/client/.test(imports), 'a lib não importa o cliente nem usa alias (roda no Node)')
})

test('migration: o padrão é o envio direto continuar permitido (nada quebra até alguém ligar o interruptor)', () => {
    assert.match(sql, /signed_required boolean NOT NULL DEFAULT false/)
    assert.match(sql, /SELECT NOT COALESCE\(\(SELECT signed_required FROM public\.upload_settings WHERE id\), false\)/)
    for (const name of ['storage_insert_flat', 'storage_insert_own_folder', 'storage_insert_flash_media', 'storage_insert_delivery_proofs', 'storage_insert_digital_files']) {
        const m = sql.match(new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`))
        assert.ok(m, `política ${name} não recriada`)
        assert.match(m[0], /public\._direct_upload_allowed\(\) OR public\._has_upload_grant\(bucket_id, name\)/, name)
    }
})

test('migration: a política antiga de pasta própria continua exigida (a autorização SOMA, não substitui)', () => {
    const folder = sql.match(/CREATE POLICY "storage_insert_own_folder"[\s\S]*?;/)[0]
    assert.match(folder, /\(storage\.foldername\(name\)\)\[1\] = \(SELECT auth\.uid\(\)\)::text/)
    for (const b of ['community-photos', 'driver-car-photos', 'driver-selfie-photos', 'posts', 'ride-object-photos', 'service-request-photos', 'store-links']) assert.ok(folder.includes(`'${b}'`), b)
    const flat = sql.match(/CREATE POLICY "storage_insert_flat"[\s\S]*?;/)[0]
    for (const b of ['avatars', 'backgrounds', 'mural-images', 'product-images', 'store-logos']) assert.ok(flat.includes(`'${b}'`), b)
})

test('migration: permissões (autorizar só logado; administração só do serviço; tabelas sem acesso do app)', () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.authorize_upload\(text, text, bigint, text, boolean\) FROM PUBLIC, anon;\s*GRANT EXECUTE ON FUNCTION public\.authorize_upload\(text, text, bigint, text, boolean\) TO authenticated;/)
    for (const f of ['admin_upload_set_enforced(boolean, uuid)', 'admin_upload_block(uuid, text, text, integer, uuid)', 'admin_upload_unblock(uuid, uuid)', 'admin_upload_update_kind(text, jsonb, uuid)', 'upload_grants_purge()']) {
        const e = f.replace(/[()]/g, '\\$&')
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;\\s*GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`), f)
    }
    for (const t of ['upload_settings', 'upload_blocks', 'upload_grants']) assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`), t)
})

test('migration: cada tipo do catálogo ganhou ritmo e cotas, e as cotas são coerentes entre si', () => {
    const kinds = [...catalogSql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'[a-z-]+',\s*\d+::bigint/g)].map((m) => m[1]).sort()
    const block = sql.slice(sql.indexOf('UPDATE public.upload_kinds k'), sql.indexOf(') AS v(kind'))
    const rows = [...block.matchAll(/\('([a-z_]+)',\s*(true|false),\s*(\d+),\s*(\d+)::bigint,\s*(\d+)::bigint,\s*(\d+)\)/g)]
    assert.deepEqual(rows.map((m) => m[1]).sort(), kinds, 'todo tipo do catálogo precisa de uma linha de limites (e só eles)')
    const max = Object.fromEntries([...catalogSql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'[a-z-]+',\s*(\d+)::bigint/g)].map((m) => [m[1], Number(m[2])]))
    for (const [, kind, , perHour, perDay, perUser, mins] of rows) {
        assert.ok(Number(perDay) >= max[kind], `${kind}: a cota do dia deve caber ao menos 1 arquivo do tamanho máximo`)
        assert.ok(Number(perUser) >= Number(perDay), `${kind}: a cota total deve ser ao menos a do dia`)
        assert.ok(Number(perHour) > 0 && Number(mins) >= 1 && Number(mins) <= 240, kind)
    }
    // tipos com pasta própria = exatamente os buckets que a política do Storage já exige em <uid>/...
    const own = rows.filter((m) => m[2] === 'true').map((m) => m[1]).sort()
    assert.deepEqual(own, ['community_photo', 'delivery_proof', 'digital_file', 'driver_car_photo', 'driver_selfie', 'flash_media', 'post_image', 'ride_object_photo', 'service_request_photo', 'store_link_image'].sort())
})

test('decisão de arquitetura: não existe rota /api/uploads/sign (a autorização é no banco e o arquivo é enviado pela própria pessoa)', () => {
    assert.ok(!fs.existsSync(path.join(root, 'src/app/api/uploads')), 'sem rota de assinatura: o dono do arquivo ficaria nulo')
    assert.match(read('docs/CONTROLE-DE-UPLOADS.md'), /não há rota `\/api\/uploads\/sign`/i)
})

test('rollback e cenários de banco existem', () => {
    const rb = read('supabase/rollbacks/upload_authorization_rollback.sql')
    for (const t of ['authorize_upload', 'admin_upload_update_kind', 'upload_grants', 'upload_blocks', 'upload_settings', 'storage_insert_flat', 'upload-grants-purge']) assert.ok(rb.includes(t), t)
    assert.match(read('supabase/tests/upload_authorization_scenarios.sql'), /OK 11/)
})
