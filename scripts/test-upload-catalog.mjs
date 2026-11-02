// Catálogo e registro de uploads (src/modules/uploads, src/lib/mediaAssets.ts, migration 20261130000019). Rodar: npm run test:upload-catalog
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { UPLOAD_PROVIDERS, READY_PROVIDERS, isProviderReady, validateUploadKind, formatBytes, sumUsage } from '../src/modules/uploads/domain.ts'
import { registerMediaAsset, isMissingFunction } from '../src/lib/mediaAssets.ts'
import { PHOTO_BUCKET_LIMITS } from '../src/lib/uploadLimits.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/migrations/20261130000019_upload_catalog.sql')

const GOOD = { kind: 'avatar', label: 'Foto de perfil', bucket: 'avatars', provider: 'supabase', max_bytes: 5 * 1024 * 1024, mime_types: ['image/jpeg', 'image/png'], enabled: true }

test('o catálogo da migration cobre os 15 buckets, e os tamanhos das fotos batem com a tabela do navegador', () => {
    const rows = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'([a-z-]+)',\s*(\d+)::bigint/g)].map((m) => ({ kind: m[1], bucket: m[2], bytes: Number(m[3]) }))
    assert.equal(rows.length, 15)
    assert.equal(new Set(rows.map((r) => r.kind)).size, 15, 'tipos repetidos')
    assert.equal(new Set(rows.map((r) => r.bucket)).size, 15, 'um tipo por bucket')
    for (const [bucket, limit] of Object.entries(PHOTO_BUCKET_LIMITS)) {
        const r = rows.find((x) => x.bucket === bucket)
        assert.ok(r, `bucket ${bucket} sem tipo no catálogo`)
        assert.equal(r.bytes, limit, `${bucket}: catálogo e uploadLimits.ts divergem`)
    }
    for (const b of ['flash-media', 'delivery-proofs', 'digital-files']) assert.ok(rows.some((r) => r.bucket === b), b)
})

test('provedores: só supabase está pronto; r2 e stream existem no catálogo mas não podem ser escolhidos ainda', () => {
    assert.deepEqual([...UPLOAD_PROVIDERS], ['supabase', 'r2', 'stream'])
    assert.deepEqual([...READY_PROVIDERS], ['supabase'])
    assert.equal(isProviderReady('supabase'), true)
    assert.equal(isProviderReady('r2'), false)
    assert.equal(isProviderReady('stream'), false)
    // o CHECK do banco aceita exatamente os mesmos
    assert.match(sql, /provider\s+text NOT NULL DEFAULT 'supabase' CHECK \(provider IN \('supabase', 'r2', 'stream'\)\)/)
})

test('validação de um tipo: aceita o bom e recusa cada erro', () => {
    assert.deepEqual(validateUploadKind(GOOD), [])
    assert.deepEqual(validateUploadKind({ ...GOOD, mime_types: null }), [], 'null = qualquer tipo')
    assert.ok(validateUploadKind({ ...GOOD, kind: 'Avatar!' }).length)
    assert.ok(validateUploadKind({ ...GOOD, label: '  ' }).length)
    assert.ok(validateUploadKind({ ...GOOD, bucket: '' }).length)
    assert.ok(validateUploadKind({ ...GOOD, max_bytes: 0 }).length)
    assert.ok(validateUploadKind({ ...GOOD, max_bytes: Number.NaN }).length)
    assert.ok(validateUploadKind({ ...GOOD, provider: 'ftp' }).length)
    assert.match(validateUploadKind({ ...GOOD, provider: 'r2' }).join(' '), /ainda não está pronto/)
    assert.ok(validateUploadKind({ ...GOOD, mime_types: [] }).length)
    assert.ok(validateUploadKind({ ...GOOD, mime_types: ['jpeg'] }).length)
    assert.match(validateUploadKind({ ...GOOD, mime_types: ['image/svg+xml'] }).join(' '), /SVG/)
    assert.match(validateUploadKind({ ...GOOD, mime_types: ['text/html'] }).join(' '), /HTML/)
})

test('textos de tamanho e soma de uso', () => {
    assert.equal(formatBytes(5 * 1024 * 1024), '5 MB')
    assert.equal(formatBytes(1.5 * 1024 * 1024), '1,5 MB')
    assert.equal(formatBytes(524288000), '500 MB')
    assert.equal(formatBytes(2048), '2 KB')
    assert.equal(formatBytes(10), '10 B')
    assert.equal(formatBytes(2 * 1024 ** 3), '2 GB')
    assert.deepEqual(sumUsage([{ files: 2, bytes: 100 }, { files: 3, bytes: 50 }]), { files: 5, bytes: 150 })
    assert.deepEqual(sumUsage([]), { files: 0, bytes: 0 })
})

test('registrar: devolve o id, ignora entradas vazias e NUNCA lança', async () => {
    const calls = []
    const ok = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: 'id-1', error: null } } }
    assert.equal(await registerMediaAsset(ok, 'avatars', 'u/a.jpg'), 'id-1')
    assert.deepEqual(calls[0], ['register_media_asset', { p_bucket: 'avatars', p_path: 'u/a.jpg' }])
    assert.equal(await registerMediaAsset(ok, '', 'x'), null)
    assert.equal(await registerMediaAsset(ok, 'avatars', ''), null)
    assert.equal(calls.length, 1, 'entrada vazia não chama o banco')
    assert.equal(await registerMediaAsset({ rpc: async () => ({ data: null, error: null }) }, 'x-fora', 'a.jpg'), null, 'bucket fora do catálogo = null')
    assert.equal(await registerMediaAsset({ rpc: async () => ({ data: null, error: { code: '42501', message: 'not_owner' } }) }, 'avatars', 'a.jpg'), null)
    assert.equal(await registerMediaAsset({ rpc: async () => { throw new Error('rede caiu') } }, 'avatars', 'a.jpg'), null)
})

test('migration ainda não aplicada: para de tentar depois da primeira falha (sem barulho a cada upload)', async () => {
    assert.equal(isMissingFunction({ code: 'PGRST202', message: 'x' }), true)
    assert.equal(isMissingFunction({ code: '42883', message: 'x' }), true)
    assert.equal(isMissingFunction({ message: 'Could not find the function public.register_media_asset' }), true)
    assert.equal(isMissingFunction({ code: '42501', message: 'not_owner' }), false)
    assert.equal(isMissingFunction(null), false)
    // este teste roda por último neste arquivo e deixa o módulo "desligado": a chamada seguinte não vai ao banco
    let n = 0
    const missing = { rpc: async () => { n++; return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } } }
    assert.equal(await registerMediaAsset(missing, 'avatars', 'a.jpg'), null)
    assert.equal(await registerMediaAsset(missing, 'avatars', 'b.jpg'), null)
    assert.equal(n, 1, 'depois de "função não existe" não tenta de novo')
})

test('o ponto central de upload registra SÓ depois de um envio bem-sucedido e sem esperar', () => {
    const c = read('src/lib/supabase/client.ts')
    assert.match(c, /import \{ registerMediaAsset \} from '@\/lib\/mediaAssets'/)
    assert.match(c, /if \(!result\.error\) void registerMediaAsset\(supabase, bucket,/)
    const m = read('src/lib/mediaAssets.ts')
    assert.ok(!/from '@\/lib\/supabase/.test(m), 'mediaAssets não pode importar o cliente (ciclo)')
})

test('o registro só pelo servidor: tabelas sem acesso do app, só o dono registra, bytes vêm do Storage', () => {
    assert.match(sql, /REVOKE ALL ON public\.media_assets FROM anon, authenticated/)
    assert.match(sql, /REVOKE ALL ON public\.upload_kinds FROM anon, authenticated/)
    assert.match(sql, /IF v_owner IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'not_owner'/)
    assert.match(sql, /COALESCE\(\(v_meta->>'size'\)::bigint, 0\), v_meta->>'mimetype'/)
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.media_assets_reconcile\(\) FROM PUBLIC, anon, authenticated/)
    assert.ok(!/p_bytes|p_size|p_mime/.test(sql), 'a função não pode aceitar tamanho/tipo vindos do app')
})

test('rollback e cenários de banco existem', () => {
    assert.match(read('supabase/rollbacks/upload_catalog_rollback.sql'), /DROP TABLE IF EXISTS public\.media_assets/)
    assert.match(read('supabase/tests/upload_catalog_scenarios.sql'), /OK 7/)
})
