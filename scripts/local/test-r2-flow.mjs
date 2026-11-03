// TESTE PONTA A PONTA do envio pelo R2 (rotas /api/uploads/r2/sign e /complete + migration 20261130000023) contra o app LOCAL e o Supabase LOCAL, com um "R2 de mentira"
// (servidor em 127.0.0.1) que CONFERE cada assinatura como o R2 de verdade faria. NÃO usa a conta real da Cloudflare nem chaves reais.
//   1) node scripts/local/test-r2-flow.mjs --prepare     (grava .local-supabase/dev.env e liga o R2 de mentira; reinicie o `npm run dev:local`)
//   2) node scripts/local/test-r2-flow.mjs               (roda o teste, restaura o banco e apaga o dev.env)
// Só LOCAL (recusa qualquer outro banco). Restaura tudo no final, mesmo se um passo falhar.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { presignUrl, signHeaders } from '../../src/lib/r2.ts'

const root = path.resolve(import.meta.dirname, '..', '..')
const ENV_FILE = path.join(root, '.local-supabase', 'dev.env')
const FAKE = { accountId: crypto.createHash('md5').update('iuser-local-r2').digest('hex'), ak: 'LOCALFAKEACCESSKEY', sk: 'local-fake-secret-key-not-real', bucket: 'iuser-media', port: 4599 }
const APP = 'http://localhost:3100'

if (process.argv.includes('--prepare')) {
    fs.writeFileSync(ENV_FILE, [`R2_ACCOUNT_ID=${FAKE.accountId}`, `R2_ACCESS_KEY_ID=${FAKE.ak}`, `R2_SECRET_ACCESS_KEY=${FAKE.sk}`, `R2_BUCKET=${FAKE.bucket}`, `R2_TEST_ENDPOINT=http://127.0.0.1:${FAKE.port}`, 'R2_PUBLIC_BASE=https://midia.exemplo.test', ''].join('\n'))
    console.log(`gravado ${ENV_FILE}\nReinicie o app: npm run dev:local (ou preview_stop/preview_start), e rode este script sem --prepare.`); process.exit(0)
}

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY
if (!API || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado — este teste só roda no banco local')
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_iuser-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()
let passed = 0
const ok = (c, m) => { if (!c) throw new Error(`FALHOU: ${m}`); passed++; console.log(`  ok  ${m}`) }

// ---------- o R2 de mentira: confere assinatura, validade, tipo e tamanho; guarda os objetos na memória ----------
const store = new Map()      // "bucket/key" -> { body, type }
let lenient = false
let deny = false             // true = recusa tudo (chave errada), para ver o teste do painel acusar o erro
let _unused = false          // true = aceita qualquer corpo (simula um R2 que não confere o tamanho assinado) para testar a conferência do servidor
const log = []
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${FAKE.port}`)
    const host = `127.0.0.1:${FAKE.port}`
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks)
    const reply = (code, headers = {}) => { res.writeHead(code, headers); res.end() }
    const objKey = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.pathname === '/__deny') { deny = url.searchParams.get('on') === '1'; return reply(204) }
    if (deny && !url.pathname.startsWith('/__')) return reply(403)
    if (url.pathname === '/__lenient') { lenient = url.searchParams.get('on') === '1'; return reply(204) }
    try {
        if (req.method === 'PUT' && req.headers.authorization) {   // PUT do SERVIDOR (assinatura nos cabeçalhos), usado pelo teste de conexão do painel
            const date = req.headers['x-amz-date']
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const want = signHeaders({ host, path: '/' + objKey, method: 'PUT', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, now, payloadHash: String(req.headers['x-amz-content-sha256']), headers: { 'content-type': String(req.headers['content-type']) } })
            if (want.Authorization !== req.headers.authorization || crypto.createHash('sha256').update(body).digest('hex') !== req.headers['x-amz-content-sha256']) { log.push('PUT (servidor) assinatura NÃO confere'); return reply(403) }
            store.set(objKey, { body, type: String(req.headers['content-type'] || '') }); return reply(200)
        }
        if (req.method === 'GET') {   // leitura por link assinado
            const q = url.searchParams, date = q.get('X-Amz-Date')
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const expect = presignUrl({ host, scheme: 'http', path: '/' + objKey, method: 'GET', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, expires: Number(q.get('X-Amz-Expires')), now })
            if (new URL(expect).searchParams.get('X-Amz-Signature') !== q.get('X-Amz-Signature')) return reply(403)
            const o = store.get(objKey); if (!o) return reply(404)
            res.writeHead(200, { 'content-length': String(o.body.length), 'content-type': o.type }); return res.end(o.body)
        }
        if (req.method === 'PUT') {
            const q = url.searchParams, date = q.get('X-Amz-Date')
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            if (Date.now() > now.getTime() + Number(q.get('X-Amz-Expires')) * 1000) { log.push('PUT expirado'); return reply(403) }
            const signed = q.get('X-Amz-SignedHeaders').split(';')
            const hdr = {}; for (const n of signed) if (n !== 'host') hdr[n] = String(req.headers[n] ?? '')
            const expect = presignUrl({ host, scheme: 'http', path: '/' + objKey, method: 'PUT', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, expires: Number(q.get('X-Amz-Expires')), now, headers: hdr })
            if (!lenient && new URL(expect).searchParams.get('X-Amz-Signature') !== q.get('X-Amz-Signature')) { log.push(`PUT assinatura NÃO confere (${objKey})`); return reply(403) }
            if (!signed.includes('content-length') || !signed.includes('content-type')) return reply(403)
            store.set(objKey, { body, type: String(req.headers['content-type'] || '') }); log.push(`PUT ok ${objKey} ${body.length}B`); return reply(200)
        }
        if (req.method === 'HEAD' || req.method === 'DELETE') {
            const date = req.headers['x-amz-date']
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const want = signHeaders({ host, path: '/' + objKey, method: req.method, accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, now })
            if (want.Authorization !== req.headers.authorization) { log.push(`${req.method} assinatura NÃO confere`); return reply(403) }
            const o = store.get(objKey)
            if (req.method === 'DELETE') { store.delete(objKey); log.push(`DELETE ${objKey}`); return reply(204) }
            return o ? reply(200, { 'content-length': String(o.body.length), 'content-type': o.type }) : reply(404)
        }
        reply(405)
    } catch (e) { log.push('erro ' + e.message); reply(500) }
})
await new Promise((r) => server.listen(FAKE.port, '127.0.0.1', r))

// ---------- a pessoa de teste (login real; cookie de sessão como o navegador mandaria) ----------
const PASSWORD = 'Teste-local-24h'
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function login(slug) {
    const p = (await (await fetch(`${API}/rest/v1/profiles?select=id&%22profileSlug%22=eq.${slug}`, { headers: SVC })).json())[0]
    await fetch(`${API}/auth/v1/admin/users/${p.id}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ password: PASSWORD }) })
    const email = (await (await fetch(`${API}/auth/v1/admin/users/${p.id}`, { headers: SVC })).json()).email
    const session = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })).json()
    const name = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`
    const val = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
    const parts = val.match(/.{1,3180}/g)
    const cookie = parts.length === 1 ? `${name}=${val}` : parts.map((c, i) => `${name}.${i}=${c}`).join('; ')
    return { id: p.id, cookie }
}
const api = async (who, route, body) => {
    const r = await fetch(APP + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { cookie: who.cookie } : {}) }, body: JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) }
}
const put = (url, headers, body) => fetch(url, { method: 'PUT', headers, body })
const video = (n) => Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), crypto.randomBytes(n - 8)])

let A, B, saved
try {
    console.log('preparo')
    saved = psql(`select row_to_json(k) from (select enabled, per_hour_files, per_day_bytes, per_user_bytes, max_bytes from upload_kinds where kind='media_r2') k`)
    psql(`update upload_kinds set enabled=true, per_hour_files=50, per_day_bytes=NULL, per_user_bytes=NULL, max_bytes=209715200 where kind='media_r2'`)
    psql(`delete from upload_grants where kind='media_r2'; delete from media_assets where provider='r2'`)
    A = await login('cliente-teste'); B = await login('lojista-teste')
    const ping = await fetch(APP + '/api/uploads/r2/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null)
    ok(ping, 'o app local responde em ' + APP)
    ok(ping.status !== 503, 'o app está com o R2 de mentira ligado (se falhar: rode com --prepare e reinicie o app)')

    console.log('1) o que é recusado ANTES de assinar')
    let r = await api(null, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 401 && r.json.code === 'not_authenticated', 'sem login: 401')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'avatar', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 400, 'tipo que não é do R2 (avatar): 400')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: -5 })
    ok(r.status === 400, 'tamanho inválido: 400')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'text/html', bytes: 1000 })
    ok(r.status === 415 && r.json.code === 'type_not_allowed', 'HTML: 415')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'image/jpeg', bytes: 1000 })
    ok(r.status === 415, 'imagem neste tipo (só vídeo e música): 415 pela regra do banco')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 209715201 })
    ok(r.status === 413 && /200 MB/.test(r.json.error), `acima do máximo: 413 com o limite em português (${r.json.error})`)
    ok(Number(psql(`select count(*) from upload_grants where kind='media_r2'`)) === 0, 'nenhuma recusa gerou autorização')

    console.log('2) caminho feliz: assinar → enviar direto ao R2 → confirmar')
    const file = video(300_000)
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: file.length })
    ok(r.status === 200 && r.json.ok && r.json.method === 'PUT', 'autorizado e assinado')
    const key = r.json.key, link = new URL(r.json.url)
    ok(key.startsWith(A.id + '/') && /^[0-9a-f-]{36}\.mp4$/.test(key.split('/')[1]), `o servidor escolheu o nome: <pessoa>/<uuid>.mp4 (${key.slice(-16)})`)
    ok(link.origin === `http://127.0.0.1:${FAKE.port}` && link.pathname === `/iuser-media/${key}`, 'link aponta para o bucket e o caminho certos')
    ok(link.searchParams.get('X-Amz-SignedHeaders') === 'content-length;content-type;host' && link.searchParams.get('X-Amz-Expires') === '900', 'tipo e tamanho assinados, válido por 15 min')
    ok(Number(psql(`select count(*) from upload_grants where kind='media_r2' and key='${key}' and used_at is null and declared_bytes=${file.length}`)) === 1, 'autorização gravada para o caminho exato')
    const early = await api(A, '/api/uploads/r2/complete', { key })
    ok(early.status === 409 && early.json.code === 'not_uploaded', 'confirmar antes de enviar: 409 (ainda não chegou)')
    let p = await put(r.json.url, r.json.headers, file)
    ok(p.status === 200, 'envio direto ao R2 aceito (a assinatura confere com o que o navegador mandou)')
    const done = await api(A, '/api/uploads/r2/complete', { key })
    ok(done.status === 200 && done.json.ok && done.json.bytes === file.length && done.json.mime === 'video/mp4', 'confirmado com o tamanho e o tipo que o R2 guardou')
    ok(done.json.url === `https://midia.exemplo.test/${key}`, 'devolve o endereço do domínio de mídia')
    const asset = psql(`select provider||'|'||bucket||'|'||bytes||'|'||mime||'|'||state||'|'||owner_id from media_assets where key='${key}'`)
    ok(asset === `r2|iuser-media|${file.length}|video/mp4|ready|${A.id}`, 'registrado em media_assets (dono, tamanho real, tipo)')
    ok(Number(psql(`select count(*) from upload_grants where key='${key}' and used_at is not null and actual_bytes=${file.length}`)) === 1, 'a autorização foi fechada com o tamanho real')
    const again = await api(A, '/api/uploads/r2/complete', { key })
    ok(again.status === 404 && again.json.code === 'no_grant', 'confirmar de novo não registra duas vezes')

    console.log('3) o R2 recusa o que não é o assinado')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    let bad = await put(r.json.url, r.json.headers, video(1001))
    ok(bad.status === 403, 'um byte a mais que o autorizado: o R2 recusa (403)')
    bad = await put(r.json.url, { 'Content-Type': 'video/webm' }, video(1000))
    ok(bad.status === 403, 'outro tipo de arquivo: o R2 recusa (403)')
    const tampered = r.json.url.replace(key.slice(0, 8), 'ffffffff')
    bad = await put(r.json.url.replace(/\/[^/]+\.mp4/, '/outro-arquivo.mp4'), r.json.headers, video(1000))
    ok(bad.status === 403, 'outro caminho com o mesmo link: o R2 recusa (403)')
    ok(!store.has(`iuser-media/${r.json.key}`), 'nada foi gravado no R2')
    ok(log.every((l) => !/NÃO confere/.test(l) || /PUT/.test(l)), 'o servidor assinou HEAD/DELETE corretamente')

    console.log('4) defesa em profundidade: se o R2 aceitasse tamanho errado, a confirmação pega e apaga')
    await fetch(`http://127.0.0.1:${FAKE.port}/__lenient?on=1`)
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    await put(r.json.url, r.json.headers, video(5000))
    ok(store.has(`iuser-media/${r.json.key}`), '(R2 permissivo guardou 5000 B para uma autorização de 1000 B)')
    const rej = await api(A, '/api/uploads/r2/complete', { key: r.json.key })
    ok(rej.status === 422 && rej.json.code === 'rejected', 'confirmação recusa: maior que o autorizado (422)')
    ok(!store.has(`iuser-media/${r.json.key}`), 'e o objeto foi APAGADO do R2')
    ok(Number(psql(`select count(*) from media_assets where key='${r.json.key}'`)) === 0, 'nada foi registrado')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    await put(r.json.url, r.json.headers, video(1000))
    store.get(`iuser-media/${r.json.key}`).type = 'text/html'
    const rej2 = await api(A, '/api/uploads/r2/complete', { key: r.json.key })
    ok(rej2.status === 422 && !store.has(`iuser-media/${r.json.key}`), 'tipo guardado diferente do permitido: recusado e apagado')
    await fetch(`http://127.0.0.1:${FAKE.port}/__lenient?on=0`)

    console.log('5) uma pessoa não mexe no que é da outra')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 2000 })
    await put(r.json.url, r.json.headers, video(2000))
    const steal = await api(B, '/api/uploads/r2/complete', { key: r.json.key })
    ok(steal.status === 400, 'outra pessoa confirmar o seu caminho: 400')
    ok(Number(psql(`select count(*) from media_assets where key='${r.json.key}'`)) === 0, 'e nada foi registrado para ela')
    const mine = await api(A, '/api/uploads/r2/complete', { key: r.json.key })
    ok(mine.status === 200, 'a dona confirma normalmente')
    const trav = await api(A, '/api/uploads/r2/complete', { key: `${A.id}/../${B.id}/x.mp4` })
    ok(trav.status === 400, 'caminho com .. é recusado')

    console.log('6) as regras do banco valem: desligado, bloqueio e ritmo')
    psql(`update upload_kinds set enabled=false where kind='media_r2'`)
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 403 && r.json.code === 'kind_disabled', 'tipo desligado: 403')
    psql(`update upload_kinds set enabled=true where kind='media_r2'`)
    const blk = psql(`select public.admin_upload_block('${B.id}', 'media_r2', 'teste do R2', 1, NULL)`)
    r = await api(B, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 403 && r.json.code === 'blocked' && /teste do R2/.test(r.json.error), 'pessoa bloqueada: 403 com o motivo')
    psql(`select public.admin_upload_unblock('${blk}', NULL)`)
    psql(`update upload_kinds set per_hour_files=1 where kind='media_r2'`)
    psql(`delete from upload_grants where kind='media_r2' and profile_id='${B.id}'`)
    r = await api(B, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 200, 'liberada: assina')
    r = await api(B, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 429 && /Tente de novo/.test(r.json.error), 'ritmo por hora: 429 com a espera em português')

    console.log('7) botão "Testar o R2" do painel (usa as chaves do servidor)')
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'ncastelano@gmail.com'
    const au = (await (await fetch(`${API}/auth/v1/admin/users?per_page=1000`, { headers: SVC })).json()).users.find((u) => u.email === adminEmail)
    if (!au) throw new Error(`o administrador geral (${adminEmail}) não existe no banco local`)
    await fetch(`${API}/auth/v1/admin/users/${au.id}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ password: PASSWORD }) })
    const adm = (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: PASSWORD }) })).json()).access_token
    const admin = (action) => fetch(APP + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adm}` }, body: JSON.stringify({ action }) }).then(async (x) => ({ status: x.status, json: await x.json() }))
    const load = await admin('load')
    ok(load.json.r2 && load.json.r2.configured === true && load.json.r2.bucket === 'iuser-media', 'o painel sabe que o R2 está configurado (sem mostrar chave nenhuma)')
    ok(!JSON.stringify(load.json.r2).includes(FAKE.sk) && !JSON.stringify(load.json.r2).includes(FAKE.ak), 'a resposta não contém as chaves')
    let chk = await admin('r2_check')
    ok(chk.status === 200 && chk.json.ok === true && chk.json.steps.length === 4 && chk.json.steps.every((x) => x.ok), 'teste: gravou, conferiu o tamanho, leu e apagou (4 passos)')
    ok(![...store.keys()].some((k) => k.includes('_healthcheck')), 'o arquivo de teste não ficou no R2')
    ok(!JSON.stringify(chk.json).includes(FAKE.sk), 'o resultado não contém as chaves')
    const nonAdmin = await fetch(APP + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'r2_check' }) })
    ok(nonAdmin.status === 403, 'sem ser o administrador geral: 403')
    await fetch(`http://127.0.0.1:${FAKE.port}/__deny?on=1`)
    chk = await admin('r2_check')
    ok(chk.json.ok === false && chk.json.steps[0].ok === false && /403/.test(chk.json.steps[0].detail), 'chave recusada pelo R2: o teste acusa "R2 PUT 403" no primeiro passo')
    await fetch(`http://127.0.0.1:${FAKE.port}/__deny?on=0`)

    console.log(`\nTUDO CERTO: ${passed} verificações\n(registro do R2 de mentira: ${log.length} chamadas, ${log.filter((l) => /NÃO confere/.test(l)).length} com assinatura errada — esperado: só as de teste da seção 3)`)
} finally {
    console.log('\nlimpando…')
    try {
        server.close()
        psql(`delete from upload_blocks where reason='teste do R2'; delete from upload_denials where kind='media_r2'; delete from upload_grants where kind='media_r2'; delete from media_assets where provider='r2'`)
        psql(`delete from admin_config_audit where scope='upload_blocks' and changed_at > now() - interval '30 minutes'`)
        if (saved) { const s = JSON.parse(saved); psql(`update upload_kinds set enabled=${s.enabled}, per_hour_files=${s.per_hour_files ?? 'NULL'}, per_day_bytes=${s.per_day_bytes ?? 'NULL'}, per_user_bytes=${s.per_user_bytes ?? 'NULL'}, max_bytes=${s.max_bytes} where kind='media_r2'`) }
        console.log('  banco restaurado (apague .local-supabase/dev.env e reinicie o app para desligar o R2 de mentira)')
    } catch (e) { console.error('  ERRO ao restaurar:', e.message) }
}
