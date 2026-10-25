// Sobe o app (next dev) apontando para o Supabase LOCAL (Docker), não para a produção nem para o staging.
//   npm run dev:local        (precisa de: python3 scripts/local/setup.py)
import { spawnSync, spawn } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..', '..')
const env = { ...process.env }
env.PATH = `${process.env.HOME}/.orbstack/bin:${env.PATH}`
delete env.SUPABASE_ACCESS_TOKEN
const r = spawnSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', path.join(root, '.local-supabase')], { encoding: 'utf8', env, cwd: root })
const kv = Object.fromEntries(r.stdout.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
if (!kv.API_URL) { console.error('Supabase local desligado. Rode: python3 scripts/local/setup.py'); process.exit(1) }
const appEnv = {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: kv.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: kv.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: kv.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_ENV: 'staging',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
    NEXT_PUBLIC_IMAGE_BASE: '',
}
console.log(`App em http://localhost:3100  ·  banco LOCAL ${kv.API_URL}  ·  Studio ${kv.STUDIO_URL}`)
spawn('npx', ['next', 'dev', '-p', '3100'], { stdio: 'inherit', env: appEnv, cwd: root }).on('exit', (c) => process.exit(c ?? 0))
