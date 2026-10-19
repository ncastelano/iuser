// Prova, no banco REAL de STAGING, que o cadastro e o "Definir local" funcionam com a trava de colunas privadas (saveOwnProfile).
// Cria um usuário novo, faz o que o app faz (signUp -> saveOwnProfile do cadastro -> saveOwnProfile do endereço), lê de volta pela
// view my_profile e apaga o usuário. Também confirma que o UPSERT antigo continua dando 403 (por isso ele é proibido no app).
//   npm run test:profile-writes:staging
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { saveOwnProfile } from '../../src/lib/saveOwnProfile.ts'

const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
const root = path.resolve(import.meta.dirname, '..', '..')
const env = { ...Object.fromEntries(fs.readFileSync(path.join(root, '.env.staging.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])), ...process.env }
const URL_ = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
if (!URL_ || URL_.includes(PROD_REF)) { console.error('RECUSADO: URL de staging ausente ou é a da produção'); process.exit(1) }
const ref = new URL(URL_).hostname.split('.')[0]
const e2 = { ...process.env }; delete e2.SUPABASE_ACCESS_TOKEN
const ANON = env.STAGING_SUPABASE_ANON_KEY || JSON.parse(execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { env: e2, cwd: root }).toString()).find((k) => k.name === 'anon').api_key
const SERVICE = env.STAGING_SUPABASE_SERVICE_ROLE_KEY

let passes = 0, fails = 0
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FALHOU:', m) } }
const stamp = Date.now()
const email = `perfil${stamp}@staging.iuser.test`
const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: su, error: suErr } = await client.auth.signUp({ email, password: env.STAGING_TEST_PASSWORD, options: { data: { name: 'Perfil Teste' } } })
if (suErr || !su.user || !su.session) { console.error('signUp falhou:', suErr?.message); process.exit(1) }
const uid = su.user.id
try {
    // 1) o cadastro (mesmos campos do app, inclusive e-mail e CPF, que são privados)
    let r = await saveOwnProfile(client, uid, { id: uid, name: 'Perfil Teste', profileSlug: `perfil-${stamp}`, upline_id: null, email, cpf_cnpj: String(stamp).slice(-11), avatar_url: null, updated_at: new Date().toISOString() })
    ok(!r.error, `cadastro: ${r.error?.message}`)
    // 2) "Definir local" (/radar, home, comunidade, aceitar corridas): endereço e coordenadas
    r = await saveOwnProfile(client, uid, { address: 'Av. Teste, 100', address_number: '100', address_complement: null, store_lat: -8.7612, store_lng: -63.9004 })
    ok(!r.error, `definir local: ${r.error?.message}`)
    // 3) o dono lê de volta pela view my_profile
    const { data: mine, error: mErr } = await client.from('my_profile').select('profileSlug, email, address, address_number, store_lat, store_lng').eq('id', uid).single()
    ok(!mErr && mine?.address === 'Av. Teste, 100' && mine?.store_lat === -8.7612 && mine?.profileSlug === `perfil-${stamp}` && mine?.email === email, `leitura pela my_profile: ${mErr?.message} ${JSON.stringify(mine)}`)
    // 4) a leitura da tabela não deixa pedir de volta coluna privada, e o upsert antigo segue proibido
    const back = await client.from('profiles').update({ address: 'x' }).eq('id', uid).select('address')
    ok(!!back.error, 'update(...).select(coluna privada) devia dar erro')
    const old = await client.from('profiles').upsert({ id: uid, address: 'y', store_lat: 1, store_lng: 1 })
    ok(!!old.error && String(old.error.code) === '42501', `upsert antigo devia dar 42501, deu: ${old.error?.code}`)
    // 5) CPF repetido volta como 23505 (o cadastro mostra a mensagem certa)
    const dupe = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: su2 } = await dupe.auth.signUp({ email: `perfil2${stamp}@staging.iuser.test`, password: env.STAGING_TEST_PASSWORD })
    const d = await saveOwnProfile(dupe, su2.user.id, { cpf_cnpj: String(stamp).slice(-11) })
    ok(d.error?.code === '23505', `CPF repetido devia dar 23505, deu: ${d.error?.code}`)
    await fetch(`${URL_}/auth/v1/admin/users/${su2.user.id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
} finally {
    await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
}
console.log(`RESULTADO: ${fails === 0 ? 'OK' : 'FALHAS'} passes=${passes} fails=${fails}`)
process.exit(fails === 0 ? 0 : 1)
