// Motoristas FICTÍCIOS ATIVOS para ver o mapa do /pedir-motorista (v3) no staging: carros, motos e bicicletas espalhados por Porto Velho,
// com modo motorista ligado e localização ao vivo. A posição "ao vivo" vale 10 min (regra da RPC get_active_drivers_map): rode de novo
// (ou com --loop para renovar a cada 4 min e mexer um pouco os pontos) sempre que for testar.
//   node scripts/staging/seed-drivers.mjs            (cria/atualiza e termina)
//   node scripts/staging/seed-drivers.mjs --loop     (renova a cada 4 min, Ctrl+C para parar)
// Só roda no STAGING (recusa a URL da produção). Credenciais em .env.staging.local, como o seed.mjs.
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
const file = path.resolve(import.meta.dirname, '..', '..', '.env.staging.local')
const env = { ...(fs.existsSync(file) ? Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) : {}), ...process.env }
const URL_ = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = env.STAGING_TEST_PASSWORD
if (!URL_ || !KEY || !PASSWORD) { console.error('Faltam STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY e STAGING_TEST_PASSWORD em .env.staging.local'); process.exit(1) }
if (URL_.includes(PROD_REF)) { console.error('RECUSADO: essa URL é a da PRODUÇÃO.'); process.exit(1) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function api(method, p, body, extra = {}) {
    const r = await fetch(`${URL_}${p}`, { method, headers: { ...H, ...extra }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`)
    return t ? JSON.parse(t) : null
}
const upsert = (table, rows, onConflict) => api('POST', `/rest/v1/${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=representation' })
async function ensureUser(email, name) {
    const list = await api('GET', '/auth/v1/admin/users?per_page=200')
    const found = (list.users || []).find((u) => u.email === email)
    if (found) return found.id
    return (await api('POST', '/auth/v1/admin/users', { email, password: PASSWORD, email_confirm: true, user_metadata: { name } })).id
}

// centro de Porto Velho (mesmo ponto do seed do cliente)
const C = { lat: -8.7612, lng: -63.9004 }
const DRIVERS = [
    { slug: 'carro-1', name: 'Motorista Carro 1', kind: 'carro', dLat: 0.012, dLng: -0.010 },
    { slug: 'carro-2', name: 'Motorista Carro 2', kind: 'carro', dLat: -0.018, dLng: 0.021 },
    { slug: 'carro-3', name: 'Motorista Carro 3', kind: 'carro', dLat: 0.030, dLng: 0.012 },
    { slug: 'moto-1', name: 'Motorista Moto 1', kind: 'moto', dLat: -0.006, dLng: -0.019 },
    { slug: 'moto-2', name: 'Motorista Moto 2', kind: 'moto', dLat: 0.004, dLng: 0.006 },
    { slug: 'moto-3', name: 'Motorista Moto 3', kind: 'moto', dLat: -0.025, dLng: -0.004 },
    { slug: 'bike-1', name: 'Motorista Bike 1', kind: 'bicicleta', dLat: 0.009, dLng: 0.018 },
    { slug: 'bike-2', name: 'Motorista Bike 2', kind: 'bicicleta', dLat: -0.012, dLng: -0.012 },
]

const ids = {}
for (const d of DRIVERS) ids[d.slug] = await ensureUser(`${d.slug}@staging.iuser.test`, d.name)
await upsert('profiles', DRIVERS.map((d) => ({ id: ids[d.slug], name: d.name, profileSlug: `motorista-${d.slug}`, email: `${d.slug}@staging.iuser.test`, is_active: true })), 'id')
await upsert('driver_vehicles', DRIVERS.map((d) => ({ driver_id: ids[d.slug], vehicle_kind: d.kind, services: ['pessoa', 'objeto'] })), 'driver_id,vehicle_kind')

let tick = 0
async function refresh() {
    tick++
    const wiggle = (n) => Math.sin(tick + n) * 0.002   // anda um pouquinho a cada renovação
    const now = new Date().toISOString()
    await upsert('driver_pricing', DRIVERS.map((d, i) => ({
        driver_id: ids[d.slug], pricing_mode: 'platform', driver_mode_active: true, live_location_sync: true,
        live_lat: C.lat + d.dLat + wiggle(i), live_lng: C.lng + d.dLng + wiggle(i + 3), live_updated_at: now,
    })), 'driver_id')
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${DRIVERS.length} motoristas ativos (posição ao vivo renovada; vale 10 min)`)
}
await refresh()
if (process.argv.includes('--loop')) setInterval(() => refresh().catch((e) => console.error(e.message)), 4 * 60 * 1000)
