// Dá um bairro (endereço) às pessoas que já aparecem no Radar (banco LOCAL), para a página /pessoas ter "locais com mais pessoas" de verdade.
// Só mexe em quem tem "Visível no Radar" ligado e ainda NÃO tem endereço. Idempotente.
//   node scripts/local/seed-pessoas.mjs
import { execFileSync } from 'node:child_process'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado (OrbStack?) — este script só roda no banco local')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const api = async (method, p, body) => {
    const r = await fetch(`${API}${p}`, { method, headers: { ...H, Prefer: 'return=minimal' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 200)}`)
    return t ? JSON.parse(t) : null
}
// bairro → peso (o Centro e a Zona Leste concentram mais gente)
const BAIRROS = [['Centro', 9], ['Olaria', 6], ['São Cristóvão', 6], ['Embratel', 5], ['Liberdade', 5], ['Industrial', 4], ['Caiari', 4], ['Mato Grosso', 3], ['Pedrinhas', 3], ['Arigolândia', 3], ['Nova Porto Velho', 2], ['Tancredo Neves', 2]]
const RUAS = ['Rua das Palmeiras', 'Av. Sete de Setembro', 'Rua Dom Pedro II', 'Av. Calama', 'Rua Rafael Vaz e Silva', 'Av. Campos Sales', 'Rua Almirante Barroso', 'Av. Jorge Teixeira', 'Rua José Bonifácio']
const pool = BAIRROS.flatMap(([b, w]) => Array(w).fill(b))
const R = (a) => a[Math.floor(Math.random() * a.length)]

const rows = await api('GET', `/rest/v1/profiles?select=id&show_on_map=eq.true&is_active=eq.true&address=is.null&limit=400`)
let n = 0
for (const r of rows) {
    await api('PATCH', `/rest/v1/profiles?id=eq.${r.id}`, { address: `${R(RUAS)}, ${100 + Math.floor(Math.random() * 1900)}, ${R(pool)}, Porto Velho - RO`, show_location: true })
    n++
}
console.log(`${n} pessoas ganharam um bairro.`)
