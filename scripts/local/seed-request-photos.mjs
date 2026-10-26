// Fotos de teste para os pedidos de serviço (banco LOCAL): gera uma imagem por tipo de serviço (2 variações), sobe no Storage local
// (bucket service-request-photos, pasta sim/) e põe fotos em ~60% dos pedidos em aberto, combinando com o tipo. O simulador usa as
// mesmas fotos nos pedidos novos. Rodar: node scripts/local/seed-request-photos.mjs
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY) throw new Error('Supabase local desligado (OrbStack?)')

const TYPES = {
    eletricista: ['Eletricista', '#f59e0b', '#b45309'], encanador: ['Encanador', '#0ea5e9', '#075985'], pintor: ['Pintor', '#a855f7', '#6b21a8'], diarista: ['Diarista', '#10b981', '#065f46'],
    jardineiro: ['Jardineiro', '#22c55e', '#166534'], montador: ['Montador de móveis', '#f97316', '#9a3412'], instrutor: ['Aulas', '#6366f1', '#3730a3'], personal: ['Personal trainer', '#ef4444', '#991b1b'],
    veterinario: ['Veterinário', '#14b8a6', '#115e59'], dentista: ['Dentista', '#38bdf8', '#0c4a6e'], cabeleireiro: ['Cabeleireiro', '#ec4899', '#9d174d'], massageador: ['Massagem', '#84cc16', '#3f6212'], psicologa: ['Psicóloga', '#8b5cf6', '#5b21b6'],
}
const svg = (label, a, b, n) => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="900" height="675" fill="url(#g)"/><circle cx="${n === 1 ? 720 : 180}" cy="150" r="170" fill="rgba(255,255,255,0.14)"/><circle cx="${n === 1 ? 160 : 760}" cy="560" r="120" fill="rgba(255,255,255,0.10)"/>
<text x="450" y="360" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="800" fill="#fff">${label}</text><text x="450" y="420" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="rgba(255,255,255,0.85)">foto do pedido · teste</text></svg>`

const base = `${API}/storage/v1`
for (const [type, [label, a, b]] of Object.entries(TYPES)) {
    for (const n of [1, 2]) {
        const body = await sharp(Buffer.from(svg(label, a, b, n))).jpeg({ quality: 82 }).toBuffer()
        const res = await fetch(`${base}/object/service-request-photos/sim/${type}-${n}.jpg`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body })
        if (!res.ok) throw new Error(`upload ${type}-${n}: ${res.status} ${await res.text()}`)
    }
}
console.log(`${Object.keys(TYPES).length * 2} fotos enviadas`)
