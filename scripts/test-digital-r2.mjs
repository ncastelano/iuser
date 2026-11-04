// Testes do DIGITAL PESADO NO R2 PRIVADO (migration 20261130000033). Rodar: npm run test:digital-r2
// Regras puras (tipos de arquivo, configuração dos dois buckets, link de download) e a varredura do código. Quem recusa de verdade é o banco: supabase/tests/digital_r2_scenarios.sql.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MIME_EXT, HEAVY_PROGRAM_EXTS, HEAVY_DOCUMENT_EXTS, programExtension, heavyUploadInfo, resolveUploadExtension, r2FallbackAllowed } from '../src/lib/r2Types.ts'
import { readR2Config, r2ConfigForBucket, r2ConfigProblems, r2PresignGet, contentDisposition } from '../src/lib/r2.ts'
import { uploadToR2 } from '../src/lib/r2Upload.ts'
import { PROGRAM_EXTENSIONS, DIGITAL_BUCKETS, DIGITAL_UPLOAD_KIND, DIGITAL_HEAVY_KIND, DIGITAL_MAX_BYTES_BY_BUCKET, isHeavyBucket } from '../src/modules/digital/domain.ts'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261130000033_digital_r2.sql')
const ENV = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'AKIAMEDIA', R2_SECRET_ACCESS_KEY: 'segredo-media', R2_BUCKET: 'iuser-media', R2_PUBLIC_BASE: 'https://midia.iuser.com.br', R2_DIGITAL_BUCKET: 'iuser-digital' }

test('extensões de programa do R2 = as do bloco "Programa ou aplicativo" (uma lista só)', () => {
    assert.deepEqual([...HEAVY_PROGRAM_EXTS].sort(), [...PROGRAM_EXTENSIONS].sort())
})

test('o servidor escolhe a extensão: tipo conhecido vale; octet-stream só com extensão da lista; o resto não', () => {
    assert.equal(resolveUploadExtension('video/mp4', 'exe'), 'mp4', 'o tipo conhecido manda; a extensão digitada é ignorada')
    assert.equal(resolveUploadExtension('application/pdf', undefined), 'pdf')
    assert.equal(resolveUploadExtension('application/zip', undefined), 'zip')
    assert.equal(resolveUploadExtension('application/octet-stream', 'EXE'), 'exe')
    assert.equal(resolveUploadExtension('application/octet-stream', 'tar.gz'), 'tar.gz')
    assert.equal(resolveUploadExtension('application/octet-stream', 'xlsx'), 'xlsx')
    for (const bad of [undefined, null, '', 'html', 'svg', 'js', '../x', 'exe/../../a', 'php', 42]) assert.equal(resolveUploadExtension('application/octet-stream', bad), null, String(bad))
    for (const mime of ['text/html', 'image/svg+xml', 'application/x-msdownload', '']) assert.equal(resolveUploadExtension(mime, 'exe'), null, mime)
})

test('o navegador declara tipo e extensão pelo arquivo (programa sem tipo vira octet-stream com a extensão)', () => {
    assert.deepEqual(heavyUploadInfo('video/mp4', 'aula 1.mp4'), { mime: 'video/mp4', ext: 'mp4' })
    assert.deepEqual(heavyUploadInfo('', 'Setup.v2.EXE'), { mime: 'application/octet-stream', ext: 'exe' })
    assert.deepEqual(heavyUploadInfo('application/x-msdownload', 'a.msi'), { mime: 'application/octet-stream', ext: 'msi' })
    assert.deepEqual(heavyUploadInfo('', 'app.tar.gz'), { mime: 'application/octet-stream', ext: 'tar.gz' })
    assert.deepEqual(heavyUploadInfo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'planilha.xlsx'), { mime: 'application/octet-stream', ext: 'xlsx' })
    assert.deepEqual(heavyUploadInfo('image/png', 'arte.png'), { mime: 'image/png', ext: 'png' })
    assert.equal(heavyUploadInfo('text/html', 'pagina.html'), null, 'formato fora da lista: segue pelo armazenamento comum (se couber)')
    assert.equal(heavyUploadInfo('', 'sem-extensao'), null)
    assert.equal(programExtension('x.EXE'), 'exe'); assert.equal(programExtension('x.docx'), 'docx'); assert.equal(programExtension('x.html'), null)
    assert.ok(HEAVY_DOCUMENT_EXTS.every((e) => !MIME_EXT[e]), 'documento não duplica tipo conhecido')
})

test('configuração: o bucket do digital é PRIVADO e nunca é o da mídia', () => {
    const media = readR2Config(ENV), digital = readR2Config(ENV, 'digital')
    assert.equal(media.bucket, 'iuser-media'); assert.equal(media.publicBase, 'https://midia.iuser.com.br'); assert.equal(media.scope, 'media')
    assert.equal(digital.bucket, 'iuser-digital'); assert.equal(digital.scope, 'digital')
    assert.equal(digital.publicBase, null, 'nunca tem domínio público, nem se R2_PUBLIC_BASE existir')
    assert.equal(digital.accessKeyId, 'AKIAMEDIA', 'sem chave própria usa a principal')
    const own = readR2Config({ ...ENV, R2_DIGITAL_ACCESS_KEY_ID: 'AKIADIG', R2_DIGITAL_SECRET_ACCESS_KEY: 'segredo-dig' }, 'digital')
    assert.equal(own.accessKeyId, 'AKIADIG'); assert.equal(own.secretAccessKey, 'segredo-dig'); assert.equal(readR2Config({ ...ENV, R2_DIGITAL_ACCESS_KEY_ID: 'AKIADIG' }, 'media').accessKeyId, 'AKIAMEDIA', 'a chave do digital não vaza para a mídia')
    // o mesmo bucket das duas pontas = conteúdo pago aberto pelo domínio público: recusado
    assert.equal(readR2Config({ ...ENV, R2_DIGITAL_BUCKET: 'iuser-media' }, 'digital'), null)
    assert.equal(readR2Config({ ...ENV, R2_DIGITAL_BUCKET: undefined }, 'digital'), null, 'sem a variável o digital fica "não configurado"')
    assert.ok(readR2Config({ ...ENV, R2_DIGITAL_BUCKET: undefined }, 'media'), 'e a mídia segue funcionando')
    assert.equal(readR2Config({ ...ENV, R2_DIGITAL_BUCKET: 'A_B' }, 'digital'), null)
})

test('o bucket do catálogo escolhe a configuração (e bucket desconhecido não acha nenhuma)', () => {
    assert.equal(r2ConfigForBucket('iuser-media', ENV).scope, 'media')
    assert.equal(r2ConfigForBucket('iuser-digital', ENV).scope, 'digital')
    assert.equal(r2ConfigForBucket('digital-files', ENV), null); assert.equal(r2ConfigForBucket('outro', ENV), null)
    assert.equal(r2ConfigForBucket('iuser-digital', { ...ENV, R2_DIGITAL_BUCKET: undefined }), null)
})

test('problemas da configuração dizem só nomes de variáveis (e avisam o bucket repetido)', () => {
    assert.deepEqual(r2ConfigProblems(ENV, 'digital'), [])
    const miss = r2ConfigProblems({ ...ENV, R2_DIGITAL_BUCKET: undefined }, 'digital'); assert.deepEqual(miss, ['R2_DIGITAL_BUCKET não está definida.'])
    const same = r2ConfigProblems({ ...ENV, R2_DIGITAL_BUCKET: 'iuser-media' }, 'digital'); assert.match(same.join(' '), /não pode ser o mesmo bucket/)
    for (const t of [...miss, ...same]) assert.ok(!/segredo|AKIA/.test(t))
})

test('link de leitura do digital: assinado, curto, com o nome do download dentro da assinatura', () => {
    const cfg = readR2Config(ENV, 'digital')
    const url = new URL(r2PresignGet(cfg, 'u1/abc.exe', { expiresSec: 3600, downloadName: 'Meu Programa 1.0.exe', now: new Date('2026-11-03T12:00:00Z') }))
    assert.equal(url.host, `${'a'.repeat(32)}.r2.cloudflarestorage.com`); assert.equal(url.pathname, '/iuser-digital/u1/abc.exe')
    assert.equal(url.searchParams.get('X-Amz-Expires'), '3600'); assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/)
    assert.match(url.searchParams.get('response-content-disposition'), /^attachment; filename="Meu Programa 1\.0\.exe"; filename\*=UTF-8''Meu%20Programa%201\.0\.exe$/)
    const plain = new URL(r2PresignGet(cfg, 'u1/abc.mp4', { now: new Date('2026-11-03T12:00:00Z') })); assert.equal(plain.searchParams.get('response-content-disposition'), null, 'sem nome = sem forçar download (o vídeo toca)')
    assert.notEqual(plain.searchParams.get('X-Amz-Signature'), url.searchParams.get('X-Amz-Signature'))
})

test('nome do download: sem aspas, quebra de linha nem barra; acentos vão codificados', () => {
    const d = contentDisposition('relatório "final"\r\nSet-Cookie: x/../y;%.pdf')
    assert.ok(!/[\r\n]/.test(d)); assert.ok(!/filename="[^"]*"[^;]*"/.test(d.replace(/filename\*=.*$/, '')), 'aspas internas não escapam')
    assert.match(d, /^attachment; filename="relat_rio _final__+Set-Cookie: x_\.\._y__\.pdf"; filename\*=UTF-8''/)
    assert.match(contentDisposition('é.pdf'), /filename\*=UTF-8''%C3%A9\.pdf$/); assert.match(contentDisposition(''), /filename="arquivo"/)
    assert.ok(contentDisposition('a'.repeat(500)).length < 700)
})

function fakeServer({ sign, put = { status: 200 }, complete } = {}) {
    const calls = []
    const f = async (url, init) => { calls.push([url, init && init.body ? JSON.parse(init.body) : null]); return new Response(JSON.stringify(url.endsWith('/sign') ? sign : complete), { status: 200 }) }
    return { calls, deps: { fetch: f, put: async (u, h, b) => { calls.push(['PUT', u, h, b.size]); return put } } }
}
const exe = (name, type = '') => Object.assign(new Blob([new Uint8Array(900)], { type }), { name })

test('cliente (binário): programa sem tipo vai como octet-stream + extensão; formato fora da lista nem pede link', async () => {
    const s = fakeServer({ sign: { ok: true, url: 'https://r2.example/iuser-digital/u/a.exe?s', headers: { 'Content-Type': 'application/octet-stream' }, key: 'u/a.exe' }, complete: { ok: true, id: 'x', key: 'u/a.exe', bytes: 900, url: null } })
    const r = await uploadToR2(exe('Setup.EXE'), 'digital_heavy', { binary: true }, s.deps)
    assert.equal(r.ok, true); assert.deepEqual(s.calls[0][1], { kind: 'digital_heavy', mime: 'application/octet-stream', bytes: 900, ext: 'exe' })
    assert.deepEqual(s.calls[1].slice(2), [{ 'Content-Type': 'application/octet-stream' }, 900])
    const s2 = fakeServer({ sign: {} }); const bad = await uploadToR2(exe('pagina.html'), 'digital_heavy', { binary: true }, s2.deps)
    assert.equal(bad.ok, false); assert.equal(bad.code, 'type_not_allowed'); assert.equal(s2.calls.length, 0, 'nada vai ao servidor')
    const s3 = fakeServer({ sign: {} }); assert.equal((await uploadToR2(exe('x.mp4'), 'media_r2', {}, s3.deps)).code, 'type_not_allowed', 'sem binary e sem tipo: continua recusando como antes'); assert.equal(s3.calls.length, 0)
    const mp4 = fakeServer({ sign: { ok: false, code: 'rate_limited', error: 'x' } }); await uploadToR2(exe('aula.mp4', 'video/mp4'), 'digital_heavy', { binary: true }, mp4.deps); assert.deepEqual(mp4.calls[0][1], { kind: 'digital_heavy', mime: 'video/mp4', bytes: 900, ext: 'mp4' }, 'tipo conhecido: a extensão é a do tipo (e o servidor a ignora de qualquer jeito)')
})

test('plano B: só cai no armazenamento comum quando o R2 não está pronto (nunca em recusa de regra)', () => {
    for (const ok of ['r2_unconfigured', 'kind_disabled', 'network', 'upload_failed']) assert.equal(r2FallbackAllowed(ok), true, ok)
    for (const no of ['rate_limited', 'too_large', 'daily_quota', 'storage_quota', 'type_not_allowed', 'blocked', 'user_blocked']) assert.equal(r2FallbackAllowed(no), false, no)
})

test('catálogo: o tipo nasce desligado, fora da válvula, fora da limpeza e no bucket privado', () => {
    assert.equal(DIGITAL_HEAVY_KIND, 'digital_heavy'); assert.equal(DIGITAL_UPLOAD_KIND['iuser-digital'], 'digital_heavy'); assert.ok(isHeavyBucket('iuser-digital')); assert.ok(!isHeavyBucket('digital-files') && !isHeavyBucket(null))
    assert.match(sql, /VALUES \('digital_heavy', 'Digital pesado \(R2 privado\)', 'iuser-digital', 'r2', 536870912,/); assert.equal(DIGITAL_MAX_BYTES_BY_BUCKET[DIGITAL_BUCKETS.heavy], 536870912)
    assert.match(sql, /\]\, false,\s+'Cloudflare R2, bucket PRIVADO/, 'enabled = false')
    assert.match(sql, /true, false, 5, 2147483648, 3221225472, 180, false\)/, 'owner_folder, sem plano, 5/h, 2 GB/dia, 3 GB por pessoa, 180 min de autorização, SEM limpeza automática')
    assert.match(sql, /valve_stage = NULL WHERE kind = 'digital_heavy'/)
    for (const m of ['application/octet-stream', 'application/zip', 'video/mp4', 'audio/mpeg', 'image/png']) assert.ok(sql.includes(`'${m}'`), m)
    assert.ok(!/text\/html|svg/.test(sql.split("INSERT INTO public.upload_kinds")[1].split("ON CONFLICT")[0]), 'nada que execute script')
})

test('o banco trava o item do R2: chave do servidor, arquivo registrado da mesma pessoa e uso único', () => {
    assert.match(sql, /CREATE TRIGGER digital_r2_guard BEFORE INSERT OR UPDATE OF storage_path, bucket ON public\.digital_contents/)
    assert.match(sql, /m\.provider = 'r2' AND m\.bucket = 'iuser-digital' AND m\.kind = 'digital_heavy' AND m\.key = NEW\.storage_path AND m\.owner_id = NEW\.owner_id AND m\.state = 'ready'/)
    assert.match(sql, /c\.storage_path = NEW\.storage_path AND c\.id <> NEW\.id/)
    assert.match(sql, /não muda entre o armazenamento comum e o R2/)
    assert.match(sql, /bucket IN \('digital-files', 'digital-music', 'digital-apps', 'iuser-digital'\)/)
    assert.match(sql, /'file_name', c\.file_name/); assert.match(sql, /release_r2_asset[\s\S]*digital_contents c WHERE c\.storage_path = p_key/)
})

test('a conta de banda do Supabase não conta o que está no R2 (válvula e estimativa do admin)', () => {
    assert.equal((sql.match(/c\.bucket <> 'iuser-digital'/g) || []).length, 4, '1 na válvula e 3 na estimativa (período, mês, itens)')
    assert.match(sql, /'r2_month_downloads', v_r2_month_n, 'r2_month_bytes', v_r2_month_total/)
})

test('rotas: o bucket do digital nunca vira link público; download assinado só depois do banco liberar', () => {
    const open = read('src/app/api/digital/open/route.ts'), sign = read('src/app/api/uploads/r2/sign/route.ts'), done = read('src/app/api/uploads/r2/complete/route.ts'), rm = read('src/app/api/uploads/r2/remove/route.ts')
    assert.ok(open.indexOf("rpc('get_digital_item_access'") < open.indexOf("a.bucket === 'iuser-digital'") && open.indexOf("if (!a?.allowed)") < open.indexOf("a.bucket === 'iuser-digital'"), 'o ramo do R2 vem DEPOIS da conferência de acesso')
    assert.match(open, /readR2Config\(process\.env, 'digital'\)/); assert.ok(!/r2PublicUrl|publicBase/.test(open), 'nunca devolve endereço público')
    assert.match(open, /r2PresignGet\(cfg, a\.storage_path, \{ expiresSec: 3600/)
    assert.match(open, /isSafeR2Key\(a\.storage_path\)/)
    assert.match(sign, /resolveUploadExtension\(mime, body\?\.ext\)/); assert.ok(!/extensionForMime/.test(sign))
    assert.match(done, /r2ConfigForBucket\(grant\.bucket\)/); assert.match(rm, /r2ConfigForBucket\(asset\.bucket\)/)
    assert.match(rm, /from\('digital_contents'\)[\s\S]*eq\('storage_path', key\)/, 'não apaga arquivo que um item ainda usa')
})

test('editor e carregamento: R2 quando pronto, plano B só para o que couber, e o arquivo some do R2 ao apagar o item', () => {
    const load = read('src/modules/digital/load.ts'), ed = read('src/components/digital/DigitalContentManager.tsx')
    assert.match(load, /uploadToR2\(file, DIGITAL_HEAVY_KIND, \{ onProgress, binary: true \}\)/)
    assert.match(load, /!r2FallbackAllowed\(up\.code\) \|\| file\.size > fallbackMaxBytes/)
    assert.match(load, /isHeavyBucket\(bucket\)\) void removeFromR2\(path\)/, 'se o item não entrou, o arquivo não fica sobrando no R2')
    assert.match(load, /isHeavyBucket\(item\.bucket\)\) await removeFromR2\(item\.storage_path\)/)
    assert.match(load, /file_name: isHeavyBucket\(bucket\) \? args\.file\.name\.slice\(0, 200\) : null/)
    assert.match(ed, /r2Availability\(DIGITAL_HEAVY_KIND\)/); assert.match(ed, /heavyUploadInfo\(f\.type, f\.name\)/); assert.match(ed, /Enviando \$\{progress\}%/)
})
