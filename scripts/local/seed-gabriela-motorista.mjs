// A GABRIELA CARVALHO (cliente-007, a cliente em destaque dos simuladores) se CADASTRA como motorista iUser de moto (banco LOCAL): veículo, selfie, foto da moto,
// capacidade da mochila e plano — o mesmo cadastro dos entregadores de `seed-entregadores.mjs`, só que na conta dela. Ela fica OFFLINE (o modo motorista é ela quem
// liga, em /entregas), com a posição perto da pizzaria.
//   node scripts/local/seed-gabriela-motorista.mjs            cadastra a Gabriela (idempotente)
//   node scripts/local/seed-gabriela-motorista.mjs --solo     deixa Dani, Léo, Rafa e Tito OFFLINE (só ela recebe as entregas)
//   node scripts/local/seed-gabriela-motorista.mjs --restore  religa os quatro
//   node scripts/local/seed-gabriela-motorista.mjs --reset    desfaz: tira a Gabriela dos favoritos e do modo motorista
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

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
const upsert = (table, rows, onConflict) => api('POST', `/rest/v1/${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' })
const PIZZARIA = { lat: -8.7580, lng: -63.8995 }
const OTHERS = ['dani', 'leo', 'rafa', 'tito'].map((k) => `entregador-${k}@staging.iuser.test`)

const [gab] = await api('GET', `/rest/v1/profiles?select=id,name&profileSlug=eq.gabriela-carvalho-7&limit=1`)
if (!gab) throw new Error('Gabriela (gabriela-carvalho-7) não encontrada — rode o seed do ecossistema')

const idsOf = async (emails) => {
    const out = []
    for (let page = 1; ; page++) {
        const list = await api('GET', `/auth/v1/admin/users?per_page=200&page=${page}`)
        for (const u of list.users || []) if (emails.includes(u.email)) out.push(u.id)
        if ((list.users || []).length < 200) break
    }
    return out
}

const flag = process.argv[2]
if (flag === '--solo' || flag === '--restore') {
    const ids = await idsOf(OTHERS)
    for (const id of ids) await api('PATCH', `/rest/v1/driver_pricing?driver_id=eq.${id}`, flag === '--solo' ? { driver_mode_active: false, live_location_sync: false } : { driver_mode_active: true, live_location_sync: true, live_updated_at: new Date().toISOString() }, { Prefer: 'return=minimal' })
    console.log(flag === '--solo' ? `${ids.length} motoristas offline: só a Gabriela recebe entregas.` : `${ids.length} motoristas online de novo.`)
    process.exit(0)
}
if (flag === '--reset') {
    const [st] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.pizzaria-forno-de-ouro&limit=1`)
    if (st) await api('DELETE', `/rest/v1/store_favorite_drivers?store_id=eq.${st.id}&driver_id=eq.${gab.id}`, undefined, { Prefer: 'return=minimal' })
    await api('PATCH', `/rest/v1/driver_pricing?driver_id=eq.${gab.id}`, { driver_mode_active: false, live_location_sync: false }, { Prefer: 'return=minimal' })
    console.log('Gabriela fora dos favoritos e offline.')
    process.exit(0)
}

const colors = ['#ec4899', '#9d174d']
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><text x="50%" y="62%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="700" fill="#fff">GC</text></svg>`
const moto = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}" stop-opacity=".25"/><stop offset="1" stop-color="${colors[1]}" stop-opacity=".55"/></linearGradient></defs><rect width="640" height="420" fill="url(#bg)"/><rect y="330" width="640" height="90" fill="#0f172a" opacity=".18"/><g transform="translate(120 120)" stroke="#111827" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="70" cy="170" r="62"/><circle cx="330" cy="170" r="62"/><path d="M70 170 L170 70 L250 70 L330 170 M170 70 L150 30 L110 30 M250 70 L290 20 L330 20 M150 160 L250 160 L290 110"/><path d="M165 120 H255" stroke="${colors[0]}" stroke-width="30"/></g><text x="320" y="395" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">Honda CG 160 · NGC-7G07</text></svg>`
const put = async (bucket, path, svg) => {
    const r = await fetch(`${API}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: await sharp(Buffer.from(svg)).png().toBuffer() })
    if (!r.ok) throw new Error(`${bucket}/${path}: ${r.status} ${await r.text()}`)
    return path
}
const selfiePath = await put('driver-selfie-photos', `${gab.id}/selfie.png`, badge)
const motoPath = await put('driver-car-photos', `${gab.id}/moto.png`, moto)
await upsert('driver_vehicles', [{ driver_id: gab.id, vehicle_kind: 'moto', car_model: 'Honda CG 160', car_color: 'Rosa', car_plate: 'NGC-7G07', services: ['objeto', 'pessoa'], passenger_capacity: 1, delivery_capacity: 3, delivery_capacity_units: 4, vehicle_slug: 'moto-gabriela-pizza', car_photo_url: motoPath, driver_photo_url: selfiePath }], 'driver_id,vehicle_kind')
// Offline: o modo motorista é ela quem liga em /entregas (a posição fica perto da pizzaria para a entrega aparecer dentro do raio)
await upsert('driver_pricing', [{ driver_id: gab.id, pricing_mode: 'platform', driver_mode_active: false, live_location_sync: false, live_lat: PIZZARIA.lat + 0.003, live_lng: PIZZARIA.lng + 0.002, live_updated_at: new Date().toISOString(), alert_sound_enabled: true, voice_navigation_enabled: false, delivery_radius_km: 12 }], 'driver_id')
const [{ id: planId }] = await api('GET', `/rest/v1/plans?select=id&code=eq.pre_pago&limit=1`)
const has = await api('GET', `/rest/v1/subscriptions?select=id&user_id=eq.${gab.id}&limit=1`)
if (!has.length) await api('POST', '/rest/v1/subscriptions', [{ user_id: gab.id, plan_id: planId, status: 'active', source: 'free_trial', starts_at: new Date().toISOString(), current_period_end: new Date(Date.now() + 365 * 86400000).toISOString() }], { Prefer: 'return=minimal' })
console.log('Gabriela cadastrada como motorista de moto (Honda CG 160, cabem 3 entregas / 4 un.), offline. Ela liga o modo motorista em /entregas.')
