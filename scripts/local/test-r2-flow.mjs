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
const FAKE = { accountId: crypto.createHash('md5').update('iuser-local-r2').digest('hex'), ak: 'LOCALFAKEACCESSKEY', sk: 'local-fake-secret-key-not-real', bucket: 'iuser-media', digital: 'iuser-digital', port: 4599 }
const APP = 'http://localhost:3100'

if (process.argv.includes('--prepare')) {
    fs.writeFileSync(ENV_FILE, [`R2_ACCOUNT_ID=${FAKE.accountId}`, `R2_ACCESS_KEY_ID=${FAKE.ak}`, `R2_SECRET_ACCESS_KEY=${FAKE.sk}`, `R2_BUCKET=${FAKE.bucket}`, `R2_DIGITAL_BUCKET=${FAKE.digital}`, `R2_TEST_ENDPOINT=http://127.0.0.1:${FAKE.port}`, 'R2_PUBLIC_BASE=https://midia.exemplo.test', ''].join('\n'))
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
    if (url.pathname === '/__plant') { store.set(`iuser-media/${url.searchParams.get('key')}`, { body: Buffer.alloc(Number(url.searchParams.get('size') || 100)), type: 'video/mp4', lm: new Date(Date.now() - Number(url.searchParams.get('days') || 0) * 86_400_000) }); return reply(204) }
    if (url.pathname === '/__deny') { deny = url.searchParams.get('on') === '1'; return reply(204) }
    if (deny && !url.pathname.startsWith('/__')) return reply(403)
    if (url.pathname === '/__lenient') { lenient = url.searchParams.get('on') === '1'; return reply(204) }
    try {
        if (req.method === 'PUT' && req.headers.authorization) {   // PUT do SERVIDOR (assinatura nos cabeçalhos), usado pelo teste de conexão do painel
            const date = req.headers['x-amz-date']
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const want = signHeaders({ host, path: '/' + objKey, method: 'PUT', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, now, payloadHash: String(req.headers['x-amz-content-sha256']), headers: { 'content-type': String(req.headers['content-type']) } })
            if (want.Authorization !== req.headers.authorization || crypto.createHash('sha256').update(body).digest('hex') !== req.headers['x-amz-content-sha256']) { log.push('PUT (servidor) assinatura NÃO confere'); return reply(403) }
            store.set(objKey, { body, type: String(req.headers['content-type'] || ''), lm: new Date() }); return reply(200)
        }
        if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {   // listagem do bucket (ListObjectsV2), assinada nos cabeçalhos como a do servidor
            const date = req.headers['x-amz-date']
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const query = Object.fromEntries(url.searchParams.entries())
            const want = signHeaders({ host, path: '/' + objKey, method: 'GET', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, now, query })
            if (want.Authorization !== req.headers.authorization) { log.push('LIST assinatura NÃO confere'); return reply(403) }
            const items = [...store.entries()].filter(([k]) => k.startsWith(objKey + '/')).map(([k, o]) => `<Contents><Key>${k.slice(objKey.length + 1)}</Key><LastModified>${(o.lm || new Date()).toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`).join('')
            res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${objKey}</Name><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`)
        }
        if (req.method === 'GET') {   // leitura por link assinado
            const q = url.searchParams, date = q.get('X-Amz-Date')
            const now = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
            const extra = {}; for (const [k, v] of q.entries()) if (!k.startsWith('X-Amz-')) extra[k] = v   // ex.: response-content-disposition (assinado dentro do link)
            const expect = presignUrl({ host, scheme: 'http', path: '/' + objKey, method: 'GET', accessKeyId: FAKE.ak, secretAccessKey: FAKE.sk, expires: Number(q.get('X-Amz-Expires')), now, query: extra })
            if (log.length < 500 && q.get('response-content-disposition')) log.push('GET com nome de download')
            if (new URL(expect).searchParams.get('X-Amz-Signature') !== q.get('X-Amz-Signature')) return reply(403)
            const o = store.get(objKey); if (!o) return reply(404)
            const hdrs = { 'content-length': String(o.body.length), 'content-type': o.type }; if (extra['response-content-disposition']) hdrs['content-disposition'] = extra['response-content-disposition']
            res.writeHead(200, hdrs); return res.end(o.body)
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
            store.set(objKey, { body, type: String(req.headers['content-type'] || ''), lm: new Date() }); log.push(`PUT ok ${objKey} ${body.length}B`); return reply(200)
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
    return { id: p.id, cookie, token: session.access_token }
}
const api = async (who, route, body) => {
    const r = await fetch(APP + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { cookie: who.cookie } : {}) }, body: JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) }
}
const put = (url, headers, body) => fetch(url, { method: 'PUT', headers, body })
const video = (n) => Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), crypto.randomBytes(n - 8)])

const startedAt = new Date(Date.now() - 5000).toISOString()   // tudo que o teste cria (rodadas de limpeza) é apagado no final
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

    console.log('8) Flash com vídeo no R2: postar, abrir, apagar')
    psql(`update upload_kinds set per_hour_files=50 where kind='media_r2'`)
    const getAvail = async () => (await fetch(APP + '/api/uploads/r2/sign?kind=media_r2')).json()
    let av = await getAvail()
    ok(av.available === true && av.maxBytes === 209715200 && av.mimeTypes.includes('video/mp4'), 'o app pergunta e o R2 está disponível (200 MB, vídeo e áudio)')
    psql(`update upload_kinds set enabled=false where kind='media_r2'`)
    av = await getAvail()
    ok(av.available === false, 'com o tipo desligado o app sabe que não está disponível (e usa o Supabase)')
    psql(`update upload_kinds set enabled=true where kind='media_r2'`)
    ok((await (await fetch(APP + '/api/uploads/r2/sign?kind=avatar')).json()).available === false, 'tipo que não é do R2: não disponível')

    const flashApi = (token, method, route, body) => fetch(`${API}/rest/v1/${route}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
    const vid = video(40_000)
    const s8 = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: vid.length })
    await put(s8.json.url, s8.json.headers, vid)
    const c8 = await api(A, '/api/uploads/r2/complete', { key: s8.json.key })
    ok(c8.status === 200, 'vídeo enviado e registrado')
    const key8 = s8.json.key
    let fr = await flashApi(A.token, 'POST', 'flashes', { author_id: A.id, content: 'r2e2e video', media_url: `${A.id}/6f1c0f2e-3b1a-4c55-9a60-0d5d1f7a2b11.mp4`, media_type: 'video' })
    ok(fr.status >= 400 && /r2_asset_required|não foi enviado por você/.test(await fr.text()), 'flash apontando para um vídeo que não foi enviado: recusado pelo banco')
    fr = await flashApi(A.token, 'POST', 'flashes', { author_id: A.id, content: 'r2e2e video', media_url: key8, media_type: 'video' })
    const flash = (await fr.json())[0]
    ok(fr.status === 201 && flash.media_url === key8, 'flash com o vídeo registrado entra')
    fr = await flashApi(A.token, 'POST', 'flashes', { author_id: A.id, content: 'r2e2e repetido', media_url: key8, media_type: 'video' })
    ok(fr.status >= 400, 'o mesmo vídeo em outro flash: recusado')

    const open = await fetch(`${APP}/api/media/r2?key=${encodeURIComponent(key8)}`, { redirect: 'manual' })
    ok(open.status === 302 && open.headers.get('location').startsWith(`http://127.0.0.1:${FAKE.port}/iuser-media/${key8}?X-Amz-`), 'abrir o vídeo: redireciona para um link assinado do R2 (visitante, sem login)')
    const played = await fetch(open.headers.get('location'))
    ok(played.status === 200 && (await played.arrayBuffer()).byteLength === vid.length, 'o link assinado entrega o vídeo inteiro')
    ok((await fetch(`${APP}/api/media/r2?key=${encodeURIComponent(A.id + '/ffffffff-3b1a-4c55-9a60-0d5d1f7a2bff.mp4')}`, { redirect: 'manual' })).status === 404, 'vídeo que nenhum flash usa: 404')
    ok((await fetch(`${APP}/api/media/r2?key=${encodeURIComponent('../x.mp4')}`, { redirect: 'manual' })).status === 404, 'chave inválida: 404')

    const inUse = await api(A, '/api/uploads/r2/remove', { key: key8 })
    ok(inUse.status === 409 && inUse.json.code === 'in_use', 'apagar o vídeo enquanto um flash o usa: 409')
    ok((await api(B, '/api/uploads/r2/remove', { key: key8 })).status === 400, 'outra pessoa não apaga o vídeo alheio')
    await flashApi(A.token, 'DELETE', `flashes?id=eq.${flash.id}`)
    const gone = await api(A, '/api/uploads/r2/remove', { key: key8 })
    ok(gone.status === 200 && gone.json.removed === true, 'apagado o flash, o vídeo é removido')
    ok(!store.has(`iuser-media/${key8}`), 'e sumiu do R2')
    ok(psql(`select state||'/'||deleted_reason from media_assets where key='${key8}'`) === 'deleted/owner', 'registro marcado como apagado pelo dono')
    ok((await api(A, '/api/uploads/r2/remove', { key: key8 })).json.removed === false, 'apagar de novo não faz nada')
    ok((await fetch(`${APP}/api/media/r2?key=${encodeURIComponent(key8)}`, { redirect: 'manual' })).status === 404, 'e o vídeo já não abre')

    console.log('9) Limpeza no R2: vídeo sem uso e objeto solto')
    const cleanSaved = psql(`select row_to_json(s) from (select cleanup_enabled, cleanup_min_age_days, cleanup_quarantine_days, cleanup_max_per_run from upload_settings where id) s`)
    const bioSaved = psql(`select coalesce(bio,'') from profiles where id='${A.id}'`)
    psql(`update upload_settings set cleanup_enabled=true, cleanup_min_age_days=1, cleanup_quarantine_days=1, cleanup_max_per_run=1000 where id`)
    const adminPost = (body) => fetch(APP + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adm}` }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, json: await x.json() }))
    const mkAsset = async (n) => {   // envia pelo caminho oficial (assinar, enviar, confirmar) e envelhece o registro
        const f = video(3000), sg = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'video/mp4', bytes: f.length })
        await put(sg.json.url, sg.json.headers, f); const cm = await api(A, '/api/uploads/r2/complete', { key: sg.json.key })
        if (cm.status !== 200) throw new Error('não registrou o vídeo ' + n)
        psql(`update media_assets set created_at = now() - interval '10 days', orphan_since = now() - interval '3 days' where key='${sg.json.key}'`)
        return sg.json.key
    }
    const keyFree = await mkAsset('livre'), keyUsed = await mkAsset('em uso')
    const fl = await flashApi(A.token, 'POST', 'flashes', { author_id: A.id, content: 'r2e2e limpeza', media_url: keyUsed, media_type: 'video' })
    ok(fl.status === 201, 'um vídeo registrado entra num flash (esse NÃO pode ser apagado)')
    const U2 = (n) => `${A.id}/${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`
    const plant = (key, days, size = 800) => fetch(`http://127.0.0.1:${FAKE.port}/__plant?key=${encodeURIComponent(key)}&days=${days}&size=${size}`)
    const strayOld = `${U2(1)}.mp4`.replace(`${A.id}/`, `${A.id}/`), strayNew = `${U2(2)}.mp4`, strayAudio = `${U2(3)}.mp3`, strayCited = `${U2(4)}.mp4`
    for (const [k, d] of [[strayOld, 10], [strayNew, 0], [strayAudio, 10], [strayCited, 10], ['foto-subida-a-mao.png', 10], ['_healthcheck/antigo.txt', 10]]) await plant(k, d)
    psql(`update profiles set bio = 'meu vídeo ${strayCited}' where id='${A.id}'`)

    let run = await adminPost({ action: 'cleanup_run', dry: true })
    ok(run.status === 200 && run.json.result.ok === true && run.json.result.dryRun === true, 'a simulação roda sem erro e sem apagar')
    ok(run.json.result.r2Strays === 1, `simulação: 1 objeto solto apagável (${run.json.result.r2Strays})`)
    ok(run.json.result.due === 2 && run.json.result.deleted === 0, 'simulação: 2 prontos (o vídeo livre e o solto) e nada apagado')
    ok(store.has(`iuser-media/${keyFree}`) && store.has(`iuser-media/${strayOld}`), 'a simulação não apagou nada do R2')

    run = await adminPost({ action: 'cleanup_run', dry: false })
    const res = run.json.result
    ok(res.ok === true && res.dryRun === false && res.deleted === 2, `apagou 2 (o vídeo livre e o solto): ${res.deleted}`)
    ok(!store.has(`iuser-media/${keyFree}`) && !store.has(`iuser-media/${strayOld}`), 'os dois sumiram do R2')
    ok(psql(`select state||'/'||deleted_reason from media_assets where key='${keyFree}'`) === 'deleted/orphan', 'o registro do vídeo livre ficou deleted/orphan')
    ok(store.has(`iuser-media/${keyUsed}`) && psql(`select state||'/'||(orphan_since is null) from media_assets where key='${keyUsed}'`) === 'ready/true', 'o vídeo de um flash ficou, e a marca de "sem uso" saiu')
    ok([strayNew, strayAudio, strayCited, 'foto-subida-a-mao.png', '_healthcheck/antigo.txt'].every((k) => store.has(`iuser-media/${k}`)), 'ficaram: o novo, o áudio, o citado, o subido à mão e o healthcheck')
    ok(JSON.stringify(res).includes(FAKE.sk) === false, 'o resultado não traz chave nenhuma')
    ok(Number(psql(`select count(*) from upload_cleanup_runs where source='admin' and dry_run=false and deleted=2`)) >= 1, 'a rodada ficou registrada')
    run = await adminPost({ action: 'cleanup_run', dry: false })
    ok(run.json.result.deleted === 0 && run.json.result.r2Strays === 0, 'repetir não apaga mais nada')

    { const cs = JSON.parse(cleanSaved); psql(`update upload_settings set cleanup_enabled=${cs.cleanup_enabled}, cleanup_min_age_days=${cs.cleanup_min_age_days}, cleanup_quarantine_days=${cs.cleanup_quarantine_days}, cleanup_max_per_run=${cs.cleanup_max_per_run} where id`) }
    psql(`update profiles set bio = ${bioSaved === '' ? 'NULL' : `'${bioSaved.replace(/'/g, "''")}'`} where id='${A.id}'`)


    console.log('10) Digital pesado no R2 PRIVADO (bucket iuser-digital)')
    const dkSaved = psql(`select row_to_json(k) from (select enabled, per_hour_files, per_day_bytes, per_user_bytes, max_bytes from upload_kinds where kind='digital_heavy') k`)
    psql(`update upload_kinds set enabled=false where kind='digital_heavy'`)
    const availD = async () => (await fetch(APP + '/api/uploads/r2/sign?kind=digital_heavy')).json()
    ok((await availD()).available === false, 'com o tipo desligado (como nasce) o app sabe que não está disponível')
    psql(`update upload_kinds set enabled=true, per_hour_files=50, per_day_bytes=NULL, per_user_bytes=NULL where kind='digital_heavy'`)
    const av10 = await availD()
    ok(av10.available === true && av10.maxBytes === 536870912 && av10.mimeTypes.includes('application/octet-stream'), 'ligado: disponível (512 MB, com programa e pacote)')
    ok(JSON.stringify(av10).includes(FAKE.sk) === false, 'a resposta pública não traz chave')

    // recusas antes de assinar
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'application/octet-stream', ext: 'html', bytes: 1000 })
    ok(r.status === 415, 'octet-stream com extensão fora da lista (html): 415')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'application/octet-stream', bytes: 1000 })
    ok(r.status === 415, 'octet-stream SEM extensão: 415')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'text/html', ext: 'exe', bytes: 1000 })
    ok(r.status === 415, 'tipo html com extensão de programa: 415 (a extensão só vale com octet-stream)')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'media_r2', mime: 'application/octet-stream', ext: 'exe', bytes: 1000 })
    ok(r.status === 415 && r.json.code === 'type_not_allowed', 'o tipo de vídeo/música (media_r2) não aceita programa: 415')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'application/octet-stream', ext: 'exe', bytes: 536870913 })
    ok(r.status === 413 && /512 MB/.test(r.json.error), `acima do máximo do tipo: 413 (${r.json.error})`)

    // programa .exe (sem tipo no navegador): assinar → enviar → confirmar; mora no bucket privado e NÃO tem endereço público
    const exeFile = crypto.randomBytes(90_000)
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'application/octet-stream', ext: 'exe', bytes: exeFile.length })
    ok(r.status === 200 && r.json.ok, 'programa autorizado')
    const dKey = r.json.key, dLink = new URL(r.json.url)
    ok(dKey.startsWith(A.id + '/') && /^[0-9a-f-]{36}\.exe$/.test(dKey.split('/')[1]), 'o servidor escolheu o nome: <pessoa>/<uuid>.exe')
    ok(dLink.pathname === `/iuser-digital/${dKey}`, 'o link aponta para o bucket PRIVADO do digital (não para o da mídia)')
    ok(r.json.headers['Content-Type'] === 'application/octet-stream', 'o tipo assinado é octet-stream (o navegador baixa, nunca executa)')
    ok((await put(r.json.url, r.json.headers, exeFile)).status === 200, 'enviado direto ao R2 privado')
    const dDone = await api(A, '/api/uploads/r2/complete', { key: dKey })
    ok(dDone.status === 200 && dDone.json.bytes === exeFile.length && dDone.json.url === null, 'confirmado e SEM endereço público (o bucket não tem domínio)')
    ok(psql(`select provider||'|'||bucket||'|'||kind||'|'||state from media_assets where key='${dKey}'`) === 'r2|iuser-digital|digital_heavy|ready', 'registrado em media_assets no bucket do digital')
    ok((await fetch(`${APP}/api/media/r2?key=${encodeURIComponent(dKey)}`, { redirect: 'manual' })).status === 404, 'a rota pública de mídia NÃO abre arquivo do digital')
    // tipo conhecido manda; a extensão digitada é ignorada
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'video/mp4', ext: 'exe', bytes: 5000 })
    ok(r.status === 200 && r.json.key.endsWith('.mp4'), 'vídeo mp4 com "ext: exe" no pedido: o nome sai .mp4')
    const vFile = video(5000)
    await put(r.json.url, r.json.headers, vFile); const vDone = await api(A, '/api/uploads/r2/complete', { key: r.json.key }); const vKey = r.json.key
    ok(vDone.status === 200, 'vídeo da aula enviado e registrado')

    // itens do produto (como o editor faz, pelo PostgREST, logado como a dona)
    const prodId = psql(`insert into products (name, slug, price, type, store_id, owner_id, is_active) select 'Digital R2 e2e', 'digital-r2-e2e', 30, 'digital', (select id from stores limit 1), '${A.id}', true returning id`).split('\n')[0]
    const rest = (who, method, route, body) => fetch(`${API}/rest/v1/${route}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
    ok((await rest(A, 'POST', 'rpc/declare_digital_rights', { p_product: prodId })).status < 300, 'a dona declara a autoria')
    let ins = await rest(A, 'POST', 'digital_contents', { product_id: prodId, owner_id: A.id, title: 'Setup', kind: 'app', bucket: 'iuser-digital', storage_path: dKey, file_name: 'Meu Programa 1.0.exe', platform: 'windows', version: '1.0', size_bytes: exeFile.length, position: 0 })
    const appItem = (await ins.json())[0]
    ok(ins.status === 201 && appItem.bucket === 'iuser-digital', 'item de programa entra apontando para o arquivo do R2')
    ins = await rest(A, 'POST', 'digital_contents', { product_id: prodId, owner_id: A.id, title: 'Aula 1', kind: 'video', bucket: 'iuser-digital', storage_path: vKey, file_name: 'aula 1.mp4', size_bytes: vFile.length, position: 1, is_preview: false })
    const vidItem = (await ins.json())[0]
    ok(ins.status === 201, 'item de vídeo entra')
    ins = await rest(B, 'POST', 'digital_contents', { product_id: prodId, owner_id: B.id, title: 'Roubado', kind: 'video', bucket: 'iuser-digital', storage_path: vKey, position: 2 })
    ok(ins.status >= 400, 'outra pessoa não consegue pôr o arquivo da dona num item (nem no produto dela)')
    ins = await rest(A, 'POST', 'digital_contents', { product_id: prodId, owner_id: A.id, title: 'Repetido', kind: 'video', bucket: 'iuser-digital', storage_path: vKey, position: 3 })
    ok(ins.status >= 400, 'o mesmo arquivo em dois itens: recusado')

    // abrir / baixar: só com direito; link assinado do bucket PRIVADO; download com o nome original
    const openAs = (who, id, extra = '') => fetch(`${APP}/api/digital/open?item=${id}${extra}`, { headers: who ? { cookie: who.cookie } : {} }).then(async (x) => ({ status: x.status, json: await x.json().catch(() => null) }))
    ok((await openAs(null, appItem.id, '&download=1')).status === 403, 'visitante sem direito: 403')
    ok((await openAs(B, appItem.id, '&download=1')).status === 403, 'quem não comprou: 403')
    psql(`insert into digital_claims (profile_id, product_id) values ('${B.id}', '${prodId}')`)   // o direito que a compra (ou o "pegar grátis") gravaria
    const dl = await openAs(B, appItem.id, '&download=1')
    ok(dl.status === 200 && dl.json.external === false, 'quem tem o direito recebe o link')
    const dlUrl = new URL(dl.json.url)
    ok(dlUrl.origin === `http://127.0.0.1:${FAKE.port}` && dlUrl.pathname === `/iuser-digital/${dKey}` && dlUrl.searchParams.get('X-Amz-Expires') === '3600', 'link assinado de 1 hora do bucket privado do digital')
    ok(/Meu%20Programa%201\.0\.exe/.test(dlUrl.searchParams.get('response-content-disposition') + dlUrl.search) , 'o nome do download (original) vai assinado no link')
    const got = await fetch(dl.json.url)
    ok(got.status === 200 && Buffer.compare(Buffer.from(await got.arrayBuffer()), exeFile) === 0, 'o link entrega o arquivo inteiro')
    ok(/attachment; filename="Meu Programa 1\.0\.exe"/.test(got.headers.get('content-disposition') || ''), 'e manda baixar com o nome original')
    ok((await fetch(dl.json.url.replace('X-Amz-Signature=', 'X-Amz-Signature=00'))).status === 403, 'link adulterado: o R2 recusa')
    ok(Number(psql(`select count(*) from digital_downloads where item_id='${appItem.id}'`)) === 1, 'o download do programa foi contado')
    const watch = await openAs(B, vidItem.id)
    ok(watch.status === 200 && !new URL(watch.json.url).searchParams.get('response-content-disposition'), 'vídeo abre para tocar (sem forçar download)')
    // dono do produto sempre abre; a rota não vaza chave
    ok((await openAs(A, vidItem.id)).status === 200, 'a dona abre o próprio conteúdo')
    ok(!JSON.stringify(dl.json).includes(FAKE.sk), 'a resposta não traz a chave secreta')

    // painel do admin: o bucket privado aparece e o teste de conexão passa
    const load10 = await admin('load')
    ok(load10.json.r2Digital && load10.json.r2Digital.configured === true && load10.json.r2Digital.bucket === 'iuser-digital' && load10.json.r2Digital.publicBase === null, 'o painel mostra o R2 privado configurado e SEM endereço público')
    const chk10 = await adminPost({ action: 'r2_check', scope: 'digital' })
    ok(chk10.json.ok === true && chk10.json.bucket === 'iuser-digital' && chk10.json.steps.length === 4, 'teste do R2 privado: gravou, conferiu, leu e apagou (4 passos)')
    ok(![...store.keys()].some((k) => k.startsWith('iuser-digital/_healthcheck')), 'sem sobra do teste')

    // apagar: enquanto o item existe o servidor recusa; sem o item, apaga do R2
    const busy10 = await api(A, '/api/uploads/r2/remove', { key: dKey })
    ok(busy10.status === 409 && busy10.json.code === 'in_use', 'apagar o arquivo de um item que existe: 409')
    ok((await api(B, '/api/uploads/r2/remove', { key: dKey })).status === 400, 'outra pessoa não apaga o arquivo alheio')
    ok((await rest(A, 'DELETE', `digital_contents?id=eq.${appItem.id}`)).status < 300, 'a dona apaga o item')
    const rm10 = await api(A, '/api/uploads/r2/remove', { key: dKey })
    ok(rm10.status === 200 && rm10.json.removed === true && !store.has(`iuser-digital/${dKey}`), 'depois, o arquivo sai do R2 privado')
    ok(psql(`select state||'/'||deleted_reason from media_assets where key='${dKey}'`) === 'deleted/owner', 'registro marcado como apagado pela dona')
    ok(store.has(`iuser-digital/${vKey}`), 'o outro arquivo (ainda em uso) ficou')

    // o bucket do digital sem configuração = não disponível (a mídia segue funcionando): confere pelo catálogo apontando para um bucket que o servidor não tem
    psql(`update upload_kinds set bucket='iuser-sem-config' where kind='digital_heavy'`)
    ok((await availD()).available === false, 'tipo apontando para um bucket que este servidor não tem: não disponível')
    r = await api(A, '/api/uploads/r2/sign', { kind: 'digital_heavy', mime: 'video/mp4', bytes: 1000 })
    ok(r.status === 503 && r.json.code === 'r2_unconfigured', 'e assinar responde 503 (o app usa o plano B)')
    psql(`update upload_kinds set bucket='iuser-digital' where kind='digital_heavy'`)
    psql(`delete from digital_claims where product_id='${prodId}'; delete from digital_contents where product_id='${prodId}'; delete from digital_rights where product_id='${prodId}'; delete from products where id='${prodId}'`)
    { const d = JSON.parse(dkSaved); psql(`update upload_kinds set enabled=${d.enabled}, per_hour_files=${d.per_hour_files ?? 'NULL'}, per_day_bytes=${d.per_day_bytes ?? 'NULL'}, per_user_bytes=${d.per_user_bytes ?? 'NULL'}, max_bytes=${d.max_bytes} where kind='digital_heavy'`) }

    console.log(`\nTUDO CERTO: ${passed} verificações\n(registro do R2 de mentira: ${log.length} chamadas, ${log.filter((l) => /NÃO confere/.test(l)).length} com assinatura errada — esperado: só as de teste da seção 3)`)
} finally {
    console.log('\nlimpando…')
    try {
        server.close()
        psql(`delete from upload_cleanup_runs where started_at >= '${startedAt}'; delete from flashes where content like 'r2e2e%'; delete from upload_blocks where reason='teste do R2'; delete from upload_denials where kind='media_r2'; delete from upload_grants where kind in ('media_r2','digital_heavy'); delete from upload_denials where kind='digital_heavy'; delete from media_assets where provider='r2'`)
        psql(`delete from admin_config_audit where scope='upload_blocks' and changed_at > now() - interval '30 minutes'`)
        if (saved) { const s = JSON.parse(saved); psql(`update upload_kinds set enabled=${s.enabled}, per_hour_files=${s.per_hour_files ?? 'NULL'}, per_day_bytes=${s.per_day_bytes ?? 'NULL'}, per_user_bytes=${s.per_user_bytes ?? 'NULL'}, max_bytes=${s.max_bytes} where kind='media_r2'`) }
        console.log('  banco restaurado (apague .local-supabase/dev.env e reinicie o app para desligar o R2 de mentira)')
    } catch (e) { console.error('  ERRO ao restaurar:', e.message) }
}
