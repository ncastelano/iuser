// Prova da trava do Storage (migration 20261106) PELA API REAL do Supabase, só no STAGING:
// visitante, usuário logado e "outro" usuário. Cria arquivos de teste e apaga tudo no fim.
// Credenciais: .env.staging.local (STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, STAGING_TEST_PASSWORD)
// e a chave pública (anon) do staging em STAGING_SUPABASE_ANON_KEY (ou lida pelo CLI: supabase projects api-keys).
// Uso: node scripts/staging/test-storage-lockdown.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
const root = path.resolve(import.meta.dirname, '..', '..')
const file = path.join(root, '.env.staging.local')
const env = { ...Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])), ...process.env }
const URL_ = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE = env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = env.STAGING_TEST_PASSWORD
if (!URL_ || URL_.includes(PROD_REF)) { console.error('RECUSADO: URL de staging ausente ou é a da produção'); process.exit(1) }
const ref = new URL(URL_).hostname.split('.')[0]
let ANON = env.STAGING_SUPABASE_ANON_KEY
if (!ANON) {
    const e = { ...process.env }; delete e.SUPABASE_ACCESS_TOKEN
    ANON = JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { env: e, cwd: root }).toString()).find((k) => k.name === 'anon').api_key
}

let passes = 0, fails = 0
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FALHOU:', msg) } }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function raw(method, p, { key, body, headers = {} } = {}) {
    const r = await fetch(`${URL_}${p}`, { method, headers: { apikey: ANON, ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers }, body })
    const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
    return { status: r.status, body: j }
}
const upload = (key, bucket, name, upsert = false) => raw('POST', `/storage/v1/object/${bucket}/${name}`, { key, body: png, headers: { 'Content-Type': 'image/png', 'x-upsert': String(upsert) } })
const remove = (key, bucket, name) => raw('DELETE', `/storage/v1/object/${bucket}`, { key, body: JSON.stringify({ prefixes: [name] }), headers: { 'Content-Type': 'application/json' } })
const list = (key, bucket, prefix = '') => raw('POST', `/storage/v1/object/list/${bucket}`, { key, body: JSON.stringify({ prefix, limit: 100 }), headers: { 'Content-Type': 'application/json' } })
const publicGet = (bucket, name) => fetch(`${URL_}/storage/v1/object/public/${bucket}/${name}`).then((r) => r.status)
async function login(email) {
    const r = await raw('POST', '/auth/v1/token?grant_type=password', { body: JSON.stringify({ email, password: PASSWORD }), headers: { 'Content-Type': 'application/json' } })
    if (!r.body.access_token) throw new Error('login falhou ' + email)
    return { token: r.body.access_token, id: r.body.user.id }
}
const denied = (r) => r.status >= 400
const stamp = Date.now()
const made = []   // [bucket, name] para limpar no fim

const A = await login('cliente@staging.iuser.test')
const B = await login('lojista@staging.iuser.test')

// arquivos "de outra pessoa" criados pelo serviço (dono = B)
const bFlat = `${B.id}-${stamp}.png`
for (const bucket of ['avatars', 'product-images', 'store-logos', 'mural-images']) {
    const r = await upload(B.token, bucket, bFlat); ok(!denied(r), `lojista envia ${bucket} (${r.status})`); made.push([bucket, bFlat])
}
const bFolder = `${B.id}/b-${stamp}.png`
for (const bucket of ['driver-selfie-photos', 'ride-object-photos', 'community-photos']) {
    const r = await upload(B.token, bucket, bFolder); ok(!denied(r), `lojista envia ${bucket} na pasta dele (${r.status})`); made.push([bucket, bFolder])
}

// ---- VISITANTE (anon) ----
for (const bucket of ['avatars', 'product-images', 'store-logos', 'mural-images', 'backgrounds', 'posts', 'driver-selfie-photos']) {
    const r = await upload(ANON, bucket, `anon-${stamp}.png`); ok(denied(r), `anon NÃO envia ${bucket} (${r.status})`)
    if (!denied(r)) made.push([bucket, `anon-${stamp}.png`])
}
for (const bucket of ['avatars', 'product-images', 'store-logos', 'mural-images']) {
    const r = await upload(ANON, bucket, bFlat, true); ok(denied(r), `anon NÃO sobrescreve ${bucket} (${r.status})`)
    const d = await remove(ANON, bucket, bFlat); ok(!(Array.isArray(d.body) && d.body.length > 0), `anon NÃO apaga ${bucket} (${d.status} ${JSON.stringify(d.body).slice(0, 60)})`)
}
for (const bucket of ['avatars', 'driver-selfie-photos', 'product-images']) {
    const l = await list(ANON, bucket, bucket === 'driver-selfie-photos' ? B.id : ''); ok(Array.isArray(l.body) && l.body.length === 0 || denied(l), `anon NÃO lista ${bucket}`)
}
// leitura por URL pública continua
for (const [bucket, name] of [['avatars', bFlat], ['product-images', bFlat], ['driver-selfie-photos', bFolder]]) ok(await publicGet(bucket, name) === 200, `URL pública de ${bucket} abre`)

// ---- OUTRO USUÁRIO LOGADO (A) mexendo em arquivo de B ----
for (const bucket of ['avatars', 'product-images', 'store-logos', 'mural-images']) {
    const r = await upload(A.token, bucket, bFlat, true); ok(denied(r), `A NÃO sobrescreve arquivo de B em ${bucket} (${r.status})`)
    const d = await remove(A.token, bucket, bFlat); ok(!(Array.isArray(d.body) && d.body.length > 0), `A NÃO apaga arquivo de B em ${bucket}`)
}
for (const bucket of ['driver-selfie-photos', 'ride-object-photos', 'community-photos']) {
    const r = await upload(A.token, bucket, `${B.id}/a-${stamp}.png`); ok(denied(r), `A NÃO envia na pasta de B em ${bucket} (${r.status})`)
    const l = await list(A.token, bucket, B.id); ok(denied(l) || (Array.isArray(l.body) && !l.body.some((o) => o.name === `b-${stamp}.png`)), `A NÃO enxerga o arquivo de B em ${bucket}`)
}
// ---- USUÁRIO LOGADO no que é dele (o que o app faz) ----
const aFlat = `${A.id}-${stamp}.png`
for (const bucket of ['avatars', 'product-images', 'store-logos', 'backgrounds']) {
    let r = await upload(A.token, bucket, aFlat); ok(!denied(r), `A envia ${bucket} (${r.status} ${JSON.stringify(r.body).slice(0, 80)})`); made.push([bucket, aFlat])
    r = await upload(A.token, bucket, aFlat, true); ok(!denied(r), `A substitui o próprio arquivo (upsert) em ${bucket} (${r.status})`)
    const d = await remove(A.token, bucket, aFlat); ok(Array.isArray(d.body) && d.body.length === 1, `A apaga o próprio arquivo em ${bucket} (${d.status} ${JSON.stringify(d.body).slice(0, 80)})`)
}
for (const bucket of ['driver-car-photos', 'driver-selfie-photos', 'ride-object-photos', 'service-request-photos', 'community-photos', 'posts']) {
    const name = `${A.id}/a-${stamp}.png`
    let r = await upload(A.token, bucket, name); ok(!denied(r), `A envia na própria pasta de ${bucket} (${r.status} ${JSON.stringify(r.body).slice(0, 80)})`); made.push([bucket, name])
    r = await upload(A.token, bucket, `solto-${stamp}.png`); ok(denied(r), `A NÃO envia fora da própria pasta em ${bucket} (${r.status})`)
    const l = await list(A.token, bucket, A.id); ok(Array.isArray(l.body) && l.body.some((o) => o.name === `a-${stamp}.png`), `A lista os próprios arquivos em ${bucket}`)
}
// limpeza (serviço)
for (const [bucket, name] of made) await remove(SERVICE, bucket, name)
console.log(`\nRESULTADO: ${fails === 0 ? 'OK' : 'FALHAS'} passes=${passes} fails=${fails}`)
process.exit(fails === 0 ? 0 : 1)
