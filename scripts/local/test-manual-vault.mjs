// Teste do COFRE do manual contra o app LOCAL (http://localhost:3100) com um "autenticador" simulado (passkey de mentira, assina de verdade com ECDSA P-256).
// Cobre as etapas: login do admin, origem permitida, aparelho cadastrado, aprovação de aparelho novo, sessão, revogação e leitura cifrada.
//   node scripts/local/test-manual-vault.mjs          (precisa de: python3 scripts/local/setup.py, npm run dev:local; só LOCAL)
// Limpa o que criou (aparelhos, desafios, o capítulo de teste e o registro de acesso deste teste).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { isoCBOR, isoBase64URL } from '@simplewebauthn/server/helpers'
import { encryptText, chapterKey } from '../../src/lib/manualCrypto.mjs'

const root = path.resolve(import.meta.dirname, '..', '..')
const APP = 'http://localhost:3100'
const ORIGIN = 'http://localhost:3100'
const ADMIN_EMAIL = 'ncastelano@gmail.com'

const env = { ...process.env, PATH: `${process.env.HOME}/.orbstack/bin:${process.env.PATH}` }
delete env.SUPABASE_ACCESS_TOKEN
const r = spawnSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', path.join(root, '.local-supabase')], { encoding: 'utf8', env, cwd: root })
const kv = Object.fromEntries(r.stdout.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
if (!kv.API_URL || !/localhost|127\.0\.0\.1/.test(kv.API_URL)) { console.error('Supabase local desligado (ou não é local). Abortando.'); process.exit(1) }
const SECRET = `local-dev:${kv.SERVICE_ROLE_KEY}`.slice(0, 200)

const svc = createClient(kv.API_URL, kv.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(kv.API_URL, kv.ANON_KEY, { auth: { persistSession: false } })

async function tokenFor(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token })
  if (e2) throw e2
  return s.session.access_token
}

// ----- autenticador simulado -----
const sha256 = (b) => crypto.createHash('sha256').update(b).digest()
const b64u = (b) => Buffer.from(b).toString('base64url')
function newAuthenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  return { privateKey, credId: crypto.randomBytes(32), x: Buffer.from(jwk.x, 'base64url'), y: Buffer.from(jwk.y, 'base64url'), counter: 0, rpIdHash: sha256(Buffer.from('localhost')) }
}
function register(a, options, origin = ORIGIN) {
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }))
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, a.x], [-3, a.y]]))
  const credIdLen = Buffer.alloc(2); credIdLen.writeUInt16BE(a.credId.length)
  const authData = Buffer.concat([a.rpIdHash, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), credIdLen, a.credId, Buffer.from(cose)])
  const attestationObject = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
  return { id: b64u(a.credId), rawId: b64u(a.credId), type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
    response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(Buffer.from(attestationObject)), transports: ['internal'] } }
}
function assertion(a, options, { origin = ORIGIN, uv = true } = {}) {
  a.counter += 1
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }))
  const ctr = Buffer.alloc(4); ctr.writeUInt32BE(a.counter)
  const authData = Buffer.concat([a.rpIdHash, Buffer.from([uv ? 0x05 : 0x01]), ctr])
  const signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), a.privateKey)
  return { id: b64u(a.credId), rawId: b64u(a.credId), type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
    response: { authenticatorData: b64u(authData), clientDataJSON: b64u(clientDataJSON), signature: b64u(signature) } }
}

// ----- HTTP -----
async function call(route, body, { token, cookie, origin = ORIGIN } = {}) {
  const res = await fetch(`${APP}/api/admin/manual/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  })
  const set = res.headers.get('set-cookie')
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: set ? set.split(';')[0] : null, headers: res.headers, rawSet: set }
}

let passed = 0
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✔', name) }, (e) => { console.error('  ✖', name, '\n   ', e.message); process.exitCode = 1 })

const { data: adminRow } = await svc.from('profiles').select('id').eq('id', (await svc.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === ADMIN_EMAIL)?.id).maybeSingle()
assert.ok(adminRow, 'administrador local não encontrado')
const adminId = adminRow.id
const clean = async () => {
  await svc.from('admin_trusted_devices').delete().eq('profile_id', adminId)
  await svc.from('admin_webauthn_challenges').delete().eq('profile_id', adminId)
  await svc.from('admin_manual_access_log').delete().eq('profile_id', adminId)
  await svc.from('admin_manual_chapters').delete().eq('id', chapterKey(SECRET, 'zzteste'))
}
await clean()

const admin = await tokenFor(ADMIN_EMAIL)
const stranger = await tokenFor('cliente-007@staging.iuser.test')
const A = newAuthenticator(), B = newAuthenticator()
let cookieA = null, cookieB = null

console.log('Cofre do manual')
await ok('estranho (não é o administrador) é barrado em tudo', async () => {
  assert.equal((await call('device', { action: 'status' }, { token: stranger })).status, 403)
  assert.equal((await call('content', { action: 'index' }, { token: stranger })).status, 401)
  assert.equal((await call('device', { action: 'status' }, {})).status, 403) // sem login
})
await ok('o administrador vê o estado: configurado, sem aparelhos, fechado', async () => {
  const s = await call('device', { action: 'status' }, { token: admin })
  assert.equal(s.status, 200); assert.equal(s.body.configured, true); assert.equal(s.body.hasDevices, false); assert.equal(s.body.unlocked, false)
  assert.ok(s.headers.get('cache-control').includes('no-store'))
})
await ok('só logado não basta: o conteúdo exige a sessão de um aparelho', async () => {
  assert.equal((await call('content', { action: 'index' }, { token: admin })).status, 401)
})
await ok('origem fora da lista é recusada (nem para o administrador)', async () => {
  assert.equal((await call('device', { action: 'enroll-start', label: 'X' }, { token: admin, origin: 'https://evil.example' })).status, 403)
  assert.equal((await call('device', { action: 'enroll-start', label: 'X' }, { token: admin, origin: null })).status, 403)
})
await ok('primeiro aparelho: cadastra direto e já abre a sessão', async () => {
  const st = await call('device', { action: 'enroll-start', label: 'Notebook' }, { token: admin })
  assert.equal(st.status, 200); assert.equal(st.body.needsApproval, false)
  const op = await call('device', { action: 'enroll-options', requestId: st.body.requestId }, { token: admin })
  assert.equal(op.status, 200); assert.equal(op.body.options.authenticatorSelection.userVerification, 'required'); assert.equal(op.body.options.authenticatorSelection.authenticatorAttachment, 'platform')
  const bad = await call('device', { action: 'enroll-verify', challengeId: op.body.challengeId, response: register(A, { challenge: 'errado' }) }, { token: admin })
  assert.equal(bad.status, 400) // desafio errado (e o desafio é de uso único)
  const st2 = await call('device', { action: 'enroll-start', label: 'Notebook' }, { token: admin })
  const op2 = await call('device', { action: 'enroll-options', requestId: st2.body.requestId }, { token: admin })
  const v = await call('device', { action: 'enroll-verify', challengeId: op2.body.challengeId, response: register(A, op2.body.options) }, { token: admin })
  assert.equal(v.status, 200, JSON.stringify(v.body)); assert.ok(v.cookie?.startsWith('iu_manual='))
  assert.ok(/HttpOnly/i.test(v.rawSet) && /SameSite=Strict/i.test(v.rawSet) && /Path=\/api\/admin\/manual/i.test(v.rawSet))
  cookieA = v.cookie
})
await ok('capítulo cifrado no banco: lido só com a sessão; o banco não guarda texto aberto', async () => {
  const id = chapterKey(SECRET, 'zzteste')
  const payload = { slug: 'zzteste', title: 'Teste', summary: 'resumo', position: 999, sections: [{ id: 'T-1', title: 'Seção de teste', status: 'ativo', blocks: [{ t: 'p', text: 'texto SECRETÍSSIMO do manual' }] }] }
  await svc.from('admin_manual_chapters').upsert({ id, position: 999, payload_enc: encryptText(SECRET, payload, id) })
  const raw = (await svc.from('admin_manual_chapters').select('payload_enc').eq('id', id).single()).data.payload_enc
  assert.ok(!raw.includes('SECRETÍSSIMO') && !raw.includes('Teste'))
  const idx = await call('content', { action: 'index' }, { token: admin, cookie: cookieA })
  assert.equal(idx.status, 200); assert.ok(idx.body.chapters.some((c) => c.slug === 'zzteste'))
  assert.ok(idx.headers.get('cache-control').includes('no-store'))
  const ch = await call('content', { action: 'chapter', slug: 'zzteste' }, { token: admin, cookie: cookieA })
  assert.equal(ch.body.chapter.sections[0].blocks[0].text, 'texto SECRETÍSSIMO do manual')
  const se = await call('content', { action: 'search', q: 'secretíssimo' }, { token: admin, cookie: cookieA })
  assert.equal(se.body.hits[0]?.slug, 'zzteste')
})
await ok('cookie sem o login (bearer) ou de outra pessoa não vale; cookie adulterado também não', async () => {
  assert.equal((await call('content', { action: 'index' }, { cookie: cookieA })).status, 401)
  assert.equal((await call('content', { action: 'index' }, { token: stranger, cookie: cookieA })).status, 401)
  assert.equal((await call('content', { action: 'index' }, { token: admin, cookie: cookieA.slice(0, -3) + 'abc' })).status, 401)
})
await ok('texto adulterado no banco: o capítulo some em vez de sair errado', async () => {
  const id = chapterKey(SECRET, 'zzteste')
  const raw = (await svc.from('admin_manual_chapters').select('payload_enc').eq('id', id).single()).data.payload_enc
  const [v, iv, tag, ct] = raw.split('.'); const f = Buffer.from(ct, 'base64url'); f[0] ^= 1
  await svc.from('admin_manual_chapters').update({ payload_enc: [v, iv, tag, f.toString('base64url')].join('.') }).eq('id', id)
  const ch = await call('content', { action: 'chapter', slug: 'zzteste' }, { token: admin, cookie: cookieA })
  assert.equal(ch.status, 404)
  await svc.from('admin_manual_chapters').update({ payload_enc: raw }).eq('id', id)
})
await ok('aparelho novo: vira pedido e NÃO cadastra sem a aprovação de um aparelho cadastrado', async () => {
  const st = await call('device', { action: 'enroll-start', label: 'Celular' }, { token: admin })
  assert.equal(st.body.needsApproval, true)
  const early = await call('device', { action: 'enroll-options', requestId: st.body.requestId }, { token: admin })
  assert.equal(early.status, 403)
  // quem aprova precisa da sessão do aparelho cadastrado
  assert.equal((await call('device', { action: 'pending' }, { token: admin })).status, 401)
  const pend = await call('device', { action: 'pending' }, { token: admin, cookie: cookieA })
  assert.equal(pend.body.pending.length, 1); assert.equal(pend.body.pending[0].label, 'Celular')
  // aprovar exige a digital do aparelho cadastrado (assinatura nova), não basta a sessão
  const ap = await call('device', { action: 'approve-options', requestId: st.body.requestId }, { token: admin, cookie: cookieA })
  assert.equal(ap.status, 200)
  const noUv = await call('device', { action: 'approve-verify', challengeId: ap.body.challengeId, response: assertion(A, ap.body.options, { uv: false }) }, { token: admin, cookie: cookieA })
  assert.equal(noUv.status, 401) // sem verificação do usuário (digital) não vale
  const ap2 = await call('device', { action: 'approve-options', requestId: st.body.requestId }, { token: admin, cookie: cookieA })
  const good = await call('device', { action: 'approve-verify', challengeId: ap2.body.challengeId, response: assertion(A, ap2.body.options) }, { token: admin, cookie: cookieA })
  assert.equal(good.status, 200, JSON.stringify(good.body))
  assert.equal((await call('device', { action: 'enroll-status', requestId: st.body.requestId }, { token: admin })).body.approved, true)
  const op = await call('device', { action: 'enroll-options', requestId: st.body.requestId }, { token: admin })
  assert.equal(op.status, 200)
  const v = await call('device', { action: 'enroll-verify', challengeId: op.body.challengeId, response: register(B, op.body.options) }, { token: admin })
  assert.equal(v.status, 200, JSON.stringify(v.body)); cookieB = v.cookie
  // o pedido é de uso único
  assert.equal((await call('device', { action: 'enroll-options', requestId: st.body.requestId }, { token: admin })).status, 403)
})
await ok('desbloquear: assinatura de aparelho cadastrado entra; de aparelho desconhecido ou desafio repetido não', async () => {
  const o = await call('device', { action: 'unlock-options' }, { token: admin })
  assert.equal(o.body.options.allowCredentials.length, 2); assert.equal(o.body.options.userVerification, 'required')
  const stranger = newAuthenticator()
  const bad = await call('device', { action: 'unlock-verify', challengeId: o.body.challengeId, response: assertion(stranger, o.body.options) }, { token: admin })
  assert.equal(bad.status, 401)
  const o2 = await call('device', { action: 'unlock-options' }, { token: admin })
  const wrongOrigin = await call('device', { action: 'unlock-verify', challengeId: o2.body.challengeId, response: assertion(B, o2.body.options, { origin: 'https://evil.example' }) }, { token: admin })
  assert.equal(wrongOrigin.status, 401)
  const o3 = await call('device', { action: 'unlock-options' }, { token: admin })
  const resp = assertion(B, o3.body.options)
  const good = await call('device', { action: 'unlock-verify', challengeId: o3.body.challengeId, response: resp }, { token: admin })
  assert.equal(good.status, 200); assert.equal(good.body.device, 'Celular'); cookieB = good.cookie
  const replay = await call('device', { action: 'unlock-verify', challengeId: o3.body.challengeId, response: resp }, { token: admin })
  assert.equal(replay.status, 401)
})
await ok('muitas falhas seguidas travam o desbloqueio por um tempo', async () => {
  const stranger = newAuthenticator()
  let last
  for (let i = 0; i < 9; i++) {
    const o = await call('device', { action: 'unlock-options' }, { token: admin })
    if (o.status === 429) { last = o; break }
    last = await call('device', { action: 'unlock-verify', challengeId: o.body.challengeId, response: assertion(stranger, o.body.options) }, { token: admin })
  }
  assert.equal(last.status, 429)
  await svc.from('admin_manual_access_log').delete().eq('profile_id', adminId).eq('action', 'unlock_fail') // destrava para os próximos passos
})
await ok('revogar um aparelho derruba a sessão dele na hora', async () => {
  const list = await call('device', { action: 'list' }, { token: admin, cookie: cookieB })
  const devA = list.body.devices.find((d) => d.label === 'Notebook')
  assert.equal((await call('content', { action: 'index' }, { token: admin, cookie: cookieA })).status, 200)
  const rv = await call('device', { action: 'revoke', id: devA.id }, { token: admin, cookie: cookieB })
  assert.equal(rv.status, 200)
  assert.equal((await call('content', { action: 'index' }, { token: admin, cookie: cookieA })).status, 401)
  assert.equal((await call('content', { action: 'index' }, { token: admin, cookie: cookieB })).status, 200)
  // aparelho revogado não desbloqueia mais
  const o = await call('device', { action: 'unlock-options' }, { token: admin })
  assert.equal(o.body.options.allowCredentials.length, 1)
})
await ok('travar encerra a sessão; o registro de acessos guarda o que aconteceu', async () => {
  const lk = await call('device', { action: 'lock' }, { token: admin, cookie: cookieB })
  assert.equal(lk.status, 200); assert.match(lk.rawSet, /Max-Age=0/)
  const { data } = await svc.from('admin_manual_access_log').select('action').eq('profile_id', adminId)
  const acts = new Set((data || []).map((x) => x.action))
  for (const a of ['enroll_done', 'unlock', 'chapter', 'approve', 'revoke', 'lock']) assert.ok(acts.has(a), `falta ${a} no registro`)
})
await clean()
console.log(`${passed} verificações passaram`)
