// Motoboys da Pizzaria Forno de Ouro + contas da "observação em 3 telas" (banco LOCAL).
//  - 4 entregadores (tabela `employees`, cada um com o link "minhas entregas" /entregador/<token>), que o simulador (simulate-pizzaria.py)
//    usa para pegar VÁRIAS entregas de uma vez (até o que cabe na mochila) e sair entregando;
//  - define uma senha de teste (só no banco local) para o dono (admin-teste) e para o cliente em destaque (Gabriela Carvalho, cliente-007),
//    que a página /tres-telas usa para entrar sozinha em cada tela.
//   node scripts/local/seed-motoboys.mjs            (idempotente)
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado (OrbStack?) — este script só roda no banco local')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const api = async (method, p, body, extra = {}) => {
    const r = await fetch(`${API}${p}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`)
    return t ? JSON.parse(t) : null
}
export const TEST_PASSWORD = 'Teste-local-24h'

const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.pizzaria-forno-de-ouro`)
if (!store) throw new Error('Pizzaria não encontrada: rode antes  node scripts/local/seed-pizzaria.mjs')

const MOTOBOYS = [['Léo Motoboy', '5569991110001'], ['Dani Entregadora', '5569991110002'], ['Rafa Veloz', '5569991110003'], ['Tito Expresso', '5569991110004']]
const have = await api('GET', `/rest/v1/employees?select=id,name,access_token&store_id=eq.${store.id}`)
for (const [name, phone] of MOTOBOYS) {
    if (have.some((e) => e.name === name)) continue
    await api('POST', '/rest/v1/employees', [{ store_id: store.id, name, phone, is_active: true, access_token: crypto.randomBytes(18).toString('hex') }], { Prefer: 'return=minimal' })
}
const emps = await api('GET', `/rest/v1/employees?select=name,access_token&store_id=eq.${store.id}&order=created_at`)

// Senha de teste (só local) para as duas contas que a página /tres-telas abre sozinha
const setPassword = async (id) => api('PUT', `/auth/v1/admin/users/${id}`, { password: TEST_PASSWORD })
await setPassword('c86da741-189b-4eab-a347-08166081b31a')   // admin-teste (o dono da pizzaria)
const users = await api('GET', '/auth/v1/admin/users?per_page=200&page=1')
const client = (users.users || []).find((u) => u.email === 'cliente-007@staging.iuser.test')
if (client) await setPassword(client.id)

console.log(`${emps.length} motoboys: ${emps.map((e) => e.name).join(', ')}. Senha de teste definida para admin-teste${client ? ' e cliente-007 (Gabriela Carvalho)' : ''}.`)
