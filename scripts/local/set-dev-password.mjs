// Define a SENHA DE TESTE local (a mesma do /dev-login) para um perfil do banco LOCAL, para poder entrar na conta dele nos testes.
//   node scripts/local/set-dev-password.mjs <profileSlug> [<profileSlug> ...]
import { execFileSync } from 'node:child_process'
const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado — este script só roda no banco local')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const PASSWORD = 'Teste-local-24h'
for (const slug of process.argv.slice(2)) {
    const r = await fetch(`${API}/rest/v1/profiles?select=id&%22profileSlug%22=eq.${encodeURIComponent(slug)}`, { headers: H })
    const [p] = await r.json()
    if (!p) { console.log(`${slug}: perfil não encontrado`); continue }
    const u = await fetch(`${API}/auth/v1/admin/users/${p.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ password: PASSWORD }) })
    console.log(`${slug}: ${u.ok ? 'senha de teste definida' : 'erro ' + u.status}`)
}
