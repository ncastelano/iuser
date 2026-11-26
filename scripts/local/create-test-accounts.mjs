// Cria contas de TESTE no banco LOCAL (nunca produção/staging). Uso: node scripts/local/create-test-accounts.mjs
// O perfil sai sozinho pelo gatilho on_auth_user_created (nome e @ vêm dos metadados).
import { execFileSync } from 'node:child_process'
const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado — este script só roda no banco local')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// contas de teste (senhas de MODELO, só no banco local)
const CONTAS = [
    { email: 'natan@gmail.com', password: '81146630', name: 'Natan (motorista teste)', profileSlug: 'natan-motorista' },
    { email: 'dog@gmail.com', password: '81146630', name: 'Dog (passageiro teste)', profileSlug: 'dog-passageiro' },
]
for (const c of CONTAS) {
    const r = await fetch(`${API}/auth/v1/admin/users`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ email: c.email, password: c.password, email_confirm: true, user_metadata: { name: c.name, profileSlug: c.profileSlug } }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) console.log(`${c.email}: criada (@${c.profileSlug})`)
    else console.log(`${c.email}: ${j.msg || j.error_description || 'erro ' + r.status}`)
}
