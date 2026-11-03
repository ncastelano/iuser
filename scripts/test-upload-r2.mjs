// Envio pelo Cloudflare R2: src/lib/r2.ts (assinatura AWS SigV4, sem dependência), rotas /api/uploads/r2/*, migration 20261130000023. Rodar: npm run test:upload-r2
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { presignUrl, signHeaders, readR2Config, isSafeR2Key, extensionForMime, r2PresignPut, r2PresignGet, r2PublicUrl, r2Head, r2Delete, R2_MIME_TYPES } from '../src/lib/r2.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
// chaves de EXEMPLO publicadas na documentação da AWS (não são de ninguém)
const AK = 'AKIAIOSFODNN7EXAMPLE', SK = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const T0 = new Date('2013-05-24T00:00:00Z')

test('assinatura: bate com o exemplo oficial da AWS para link assinado (GET, 24 h)', () => {
    const url = presignUrl({ host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', method: 'GET', accessKeyId: AK, secretAccessKey: SK, region: 'us-east-1', now: T0, expires: 86400 })
    assert.equal(url, 'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
})

test('assinatura: bate com o exemplo oficial da AWS para cabeçalhos (GET com Range)', () => {
    const h = signHeaders({ host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', method: 'GET', accessKeyId: AK, secretAccessKey: SK, region: 'us-east-1', now: T0, headers: { range: 'bytes=0-9' } })
    assert.equal(h.Authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41')
    assert.equal(h['x-amz-date'], '20130524T000000Z'); assert.ok(!('host' in h), 'o fetch coloca o host sozinho')
})

const CFG = readR2Config({ R2_ACCOUNT_ID: '596432f3d0236d4cbdb2a1291340c4d1', R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_BUCKET: 'iuser-media', R2_PUBLIC_BASE: 'https://midia.iuser.com.br/' })

test('configuração: sem as quatro variáveis (ou com valor fora do formato) o R2 fica "não configurado"', () => {
    assert.ok(CFG); assert.equal(CFG.host, '596432f3d0236d4cbdb2a1291340c4d1.r2.cloudflarestorage.com'); assert.equal(CFG.publicBase, 'https://midia.iuser.com.br')
    const base = { R2_ACCOUNT_ID: '596432f3d0236d4cbdb2a1291340c4d1', R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_BUCKET: 'iuser-media' }
    assert.ok(readR2Config(base)); assert.equal(readR2Config(base).publicBase, null)
    for (const k of Object.keys(base)) assert.equal(readR2Config({ ...base, [k]: '' }), null, k)
    assert.equal(readR2Config({ ...base, R2_ACCOUNT_ID: 'curto' }), null); assert.equal(readR2Config({ ...base, R2_BUCKET: 'Nome Ruim' }), null)
    assert.equal(readR2Config({ ...base, R2_PUBLIC_BASE: 'http://inseguro.com' }).publicBase, null, 'domínio de mídia só https')
    assert.equal(readR2Config({}), null)
})

test('R2 de mentira (só teste local): só em desenvolvimento e só no próprio computador', () => {
    const base = { R2_ACCOUNT_ID: '596432f3d0236d4cbdb2a1291340c4d1', R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_BUCKET: 'iuser-media' }
    const dev = readR2Config({ ...base, R2_TEST_ENDPOINT: 'http://127.0.0.1:4599', NODE_ENV: 'development' })
    assert.equal(dev.origin, 'http://127.0.0.1:4599'); assert.equal(dev.host, '127.0.0.1:4599')
    assert.equal(new URL(r2PresignPut(dev, 'u1/a.mp4', { contentType: 'video/mp4', contentLength: 5 })).origin, 'http://127.0.0.1:4599')
    for (const env of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) assert.equal(readR2Config({ ...base, R2_TEST_ENDPOINT: 'http://127.0.0.1:4599', ...env }).origin, `https://${CFG.host}`, 'em produção o endereço de teste é ignorado')
    for (const bad of ['http://evil.com:80', 'https://127.0.0.1:4599', 'http://127.0.0.1', 'http://127.0.0.1:4599/x', 'http://127.0.0.1.evil.com:4599']) assert.equal(readR2Config({ ...base, R2_TEST_ENDPOINT: bad, NODE_ENV: 'development' }).origin, `https://${CFG.host}`, bad)
})

test('caminhos: só os seguros, e a extensão sai do tipo (o nome que a pessoa deu nunca entra)', () => {
    assert.ok(isSafeR2Key('u1/abc.mp4')); assert.ok(isSafeR2Key('11111111-2222-3333-4444-555555555555/a-b_c.d.mp3'))
    for (const bad of ['', '/a', 'a/', '../a', 'a/../b', 'a b', 'a?x=1', 'a#b', 'a\\b', 'a%2e', 'á.mp4', 'x'.repeat(401), null, 5]) assert.equal(isSafeR2Key(bad), false, String(bad))
    assert.equal(extensionForMime('video/mp4'), 'mp4'); assert.equal(extensionForMime(' AUDIO/MPEG '), 'mp3'); assert.equal(extensionForMime('image/svg+xml'), null); assert.equal(extensionForMime('text/html'), null)
    assert.ok(!R2_MIME_TYPES.includes('image/svg+xml') && !R2_MIME_TYPES.includes('text/html'), 'nada que carregue script')
})

test('link de envio: caminho do bucket, tipo e tamanho assinados, validade curta', () => {
    const u = new URL(r2PresignPut(CFG, 'u1/abc.mp4', { contentType: 'video/mp4', contentLength: 123456, expiresSec: 600, now: T0 }))
    assert.equal(u.host, CFG.host); assert.equal(u.pathname, '/iuser-media/u1/abc.mp4')
    assert.equal(u.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host'); assert.equal(u.searchParams.get('X-Amz-Expires'), '600')
    assert.match(u.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/); assert.match(u.searchParams.get('X-Amz-Credential'), /\/20130524\/auto\/s3\/aws4_request$/)
    const other = (o) => new URL(r2PresignPut(CFG, 'u1/abc.mp4', { contentType: 'video/mp4', contentLength: 123456, expiresSec: 600, now: T0, ...o })).searchParams.get('X-Amz-Signature')
    const sig = u.searchParams.get('X-Amz-Signature')
    assert.notEqual(other({ contentLength: 123457 }), sig, 'outro tamanho = outra assinatura'); assert.notEqual(other({ contentType: 'video/webm' }), sig, 'outro tipo = outra assinatura')
    assert.equal(r2PresignPut(CFG, 'u1/abc.mp4', { contentType: 'video/mp4', contentLength: 123456, expiresSec: 600, now: T0 }), u.toString(), 'determinístico')
    assert.throws(() => r2PresignPut(CFG, '../x', { contentType: 'video/mp4', contentLength: 1 })); assert.throws(() => r2PresignPut(CFG, 'u1/a.mp4', { contentType: 'video/mp4', contentLength: 0 }))
    assert.throws(() => r2PresignPut(CFG, 'u1/a.mp4', { contentType: 'video/mp4', contentLength: 1.5 }))
    assert.ok(new URL(r2PresignGet(CFG, 'u1/abc.mp4', { now: T0 })).searchParams.get('X-Amz-Expires') === '3600')
})

test('endereço público só com o domínio de mídia ligado', () => {
    assert.equal(r2PublicUrl(CFG, 'u1/abc.mp4'), 'https://midia.iuser.com.br/u1/abc.mp4')
    assert.equal(r2PublicUrl({ ...CFG, publicBase: null }, 'u1/abc.mp4'), null); assert.equal(r2PublicUrl(CFG, '../x'), null)
})

test('HEAD e DELETE usam cabeçalhos assinados e interpretam a resposta', async () => {
    const calls = []
    const mk = (status, headers = {}) => async (url, init) => { calls.push([url, init]); return new Response(null, { status, headers }) }
    assert.deepEqual(await r2Head(CFG, 'u1/a.mp4', mk(404)), { exists: false })
    assert.deepEqual(await r2Head(CFG, 'u1/a.mp4', mk(200, { 'content-length': '999', 'content-type': 'video/mp4' })), { exists: true, size: 999, contentType: 'video/mp4' })
    await assert.rejects(r2Head(CFG, 'u1/a.mp4', mk(403)), /R2 HEAD 403/)
    await r2Delete(CFG, 'u1/a.mp4', mk(204)); await r2Delete(CFG, 'u1/a.mp4', mk(404)); await assert.rejects(r2Delete(CFG, 'u1/a.mp4', mk(500)), /R2 DELETE 500/)
    assert.equal(calls[0][0], `https://${CFG.host}/iuser-media/u1/a.mp4`); assert.equal(calls[0][1].method, 'HEAD'); assert.match(calls[0][1].headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/auto\/s3\/aws4_request,SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/)
    await assert.rejects(r2Head(CFG, '../x', mk(200)), /inválido/); await assert.rejects(r2Delete(CFG, 'a b', mk(200)), /inválido/)
})

test('o arquivo do servidor nunca vai para o navegador', () => {
    const lib = read('src/lib/r2.ts')
    assert.match(lib, /SERVIDOR APENAS/)
    const client = fs.existsSync(path.join(root, 'src/lib/r2Upload.ts')) ? read('src/lib/r2Upload.ts') : ''
    assert.ok(!/from ['"][^'"]*\/r2(\.ts)?['"]/.test(client), 'o cliente não importa lib/r2 (tem as chaves)')
    assert.ok(!/SECRET_ACCESS_KEY|ACCESS_KEY_ID/.test(client))
})

// ---------- navegador: src/lib/r2Upload.ts ----------
import { uploadToR2 } from '../src/lib/r2Upload.ts'

function fakeServer({ sign, put = { status: 200 }, complete } = {}) {
    const calls = []
    const f = async (url, init) => {
        calls.push([url, init && init.body ? JSON.parse(init.body) : null])
        const body = url.endsWith('/sign') ? sign : complete
        return new Response(JSON.stringify(body), { status: 200 })
    }
    return { calls, deps: { fetch: f, put: async (u, h, b) => { calls.push(['PUT', u, h, b.size]); return put } } }
}
const FILE = new Blob([new Uint8Array(1234)], { type: 'video/mp4' })
const SIGN_OK = { ok: true, url: 'https://r2.example/iuser-media/u1/a.mp4?sig', headers: { 'Content-Type': 'video/mp4' }, key: 'u1/a.mp4' }

test('cliente: pede o link, envia direto ao R2 e confirma, nessa ordem, mandando só tipo e tamanho', async () => {
    const s = fakeServer({ sign: SIGN_OK, complete: { ok: true, id: 'asset-1', key: 'u1/a.mp4', bytes: 1234, url: null } })
    const r = await uploadToR2(FILE, 'media_r2', {}, s.deps)
    assert.deepEqual(r, { ok: true, id: 'asset-1', key: 'u1/a.mp4', bytes: 1234, url: null })
    assert.deepEqual(s.calls.map((c) => c[0]), ['/api/uploads/r2/sign', 'PUT', '/api/uploads/r2/complete'])
    assert.deepEqual(s.calls[0][1], { kind: 'media_r2', mime: 'video/mp4', bytes: 1234 }, 'o nome do arquivo não vai: o servidor escolhe')
    assert.deepEqual(s.calls[1].slice(1), ['https://r2.example/iuser-media/u1/a.mp4?sig', { 'Content-Type': 'video/mp4' }, 1234])
    assert.deepEqual(s.calls[2][1], { key: 'u1/a.mp4' })
})

test('cliente: recusa do servidor vira a mensagem dele e NADA é enviado', async () => {
    const s = fakeServer({ sign: { ok: false, code: 'rate_limited', error: 'Muitos envios em pouco tempo. Tente de novo em 5 minutos.' } })
    const r = await uploadToR2(FILE, 'media_r2', {}, s.deps)
    assert.deepEqual(r, { ok: false, code: 'rate_limited', message: 'Muitos envios em pouco tempo. Tente de novo em 5 minutos.' })
    assert.ok(!s.calls.some((c) => c[0] === 'PUT'), 'sem autorização não há envio')
})

test('cliente: falhas do envio, da confirmação, de rede e arquivos ruins', async () => {
    let s = fakeServer({ sign: SIGN_OK, put: { status: 403 } })
    let r = await uploadToR2(FILE, 'media_r2', {}, s.deps); assert.equal(r.ok, false); assert.equal(r.code, 'upload_failed'); assert.ok(!s.calls.some((c) => c[0] === '/api/uploads/r2/complete'), 'envio falhou: não confirma')
    s = fakeServer({ sign: SIGN_OK, complete: { ok: false, code: 'rejected', error: 'O arquivo é maior do que o autorizado.' } })
    r = await uploadToR2(FILE, 'media_r2', {}, s.deps); assert.deepEqual(r, { ok: false, code: 'rejected', message: 'O arquivo é maior do que o autorizado.' })
    r = await uploadToR2(FILE, 'media_r2', {}, { fetch: async () => { throw new Error('offline') }, put: async () => ({ status: 200 }) }); assert.equal(r.code, 'network')
    r = await uploadToR2(FILE, 'media_r2', {}, { fetch: async () => new Response(JSON.stringify(SIGN_OK)), put: async () => { throw new Error('caiu') } }); assert.equal(r.code, 'network')
    assert.equal((await uploadToR2(new Blob([]), 'media_r2', {}, s.deps)).code, 'empty_file')
    assert.equal((await uploadToR2(new Blob([new Uint8Array(5)]), 'media_r2', {}, s.deps)).code, 'type_not_allowed')
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    assert.equal((await uploadToR2(FILE, 'media_r2', {}, { fetch: async () => new Response(JSON.stringify(SIGN_OK)), put: async () => { throw abort } })).code, 'aborted')
})

test('rotas: o porteiro é o banco, o nome do arquivo é do servidor e o objeto é conferido de verdade', () => {
    const sign = read('src/app/api/uploads/r2/sign/route.ts'), done = read('src/app/api/uploads/r2/complete/route.ts')
    assert.ok(sign.indexOf('readR2Config()') < sign.indexOf('auth.getUser()') && sign.indexOf('auth.getUser()') < sign.indexOf("rpc('authorize_upload'") && sign.indexOf("rpc('authorize_upload'") < sign.indexOf('r2PresignPut('), 'só assina depois de logar e autorizar')
    assert.match(sign, /supabase\.rpc\('authorize_upload'/, 'autoriza como a própria pessoa (cliente com a sessão), nunca com o serviço'); assert.ok(!/supabaseAdmin\.rpc\('authorize_upload'/.test(sign))
    assert.match(sign, /`\$\{user\.id\}\/\$\{randomUUID\(\)\}\.\$\{ext\}`/, 'caminho = <pessoa>/<uuid>.<extensão pelo tipo>'); assert.ok(!/body\??\.(name|path|key)/.test(sign), 'nome vindo do cliente nunca entra')
    assert.match(sign, /'Cache-Control': 'no-store'/); assert.match(sign, /fail\(503, 'r2_unconfigured'/, 'sem R2 configurado responde 503')
    assert.ok(done.indexOf('r2Head(') < done.indexOf("rpc('register_r2_asset'"), 'confere o R2 antes de registrar'); assert.match(done, /key\.split\('\/'\)\[0\] !== user\.id/, 'só a própria pasta')
    assert.match(done, /r2Delete\(cfg, key\)/, 'objeto fora do combinado é apagado'); assert.match(done, /head\.size > declared/)
    assert.match(done, /\.is\('used_at', null\)/, 'a autorização precisa estar aberta')
    for (const f of [sign, done]) assert.ok(!/R2_SECRET|SECRET_ACCESS_KEY|accessKeyId/.test(f.replace(/\/\/.*$/gm, '')), 'nenhuma chave nas respostas')
    assert.ok(!/NextResponse\.json\([^)]*cfg\./.test(sign + done))
})

test('migration: o tipo nasce desligado, só o serviço registra e há rollback', () => {
    const sql = read('supabase/migrations/20261130000023_upload_r2.sql')
    assert.match(sql, /'media_r2'[\s\S]*?, false,\n/, 'enabled = false'); assert.match(sql, /REVOKE ALL ON FUNCTION public\.register_r2_asset\(uuid, text, text, bigint, text\) FROM PUBLIC, anon, authenticated/)
    assert.ok(!/(CREATE|DROP|ALTER) POLICY/i.test(sql), 'não mexe nas políticas do Storage')
    assert.ok(fs.existsSync(path.join(root, 'supabase/rollbacks/upload_r2_rollback.sql')))
})
