// ENTREGADORES iUser da Pizzaria Forno de Ouro (banco LOCAL): a pizzaria passa a usar o ENTREGADOR iUser (iuser_delivery_enabled) e quatro pessoas comuns do
// iUser — Dani Entregadora, Léo Motoboy, Rafa Veloz e Tito Expresso — viram motoristas de moto, com modo motorista ligado, localização ao vivo perto da pizzaria,
// plano ativo e uma CAPACIDADE de entregas ao mesmo tempo (a "mochila"): 4, 3, 5 e 2. Quando a loja aceita um pedido, a entrega aparece para eles, que aceitam
// as que quiserem, dentro do que cabe (o banco recusa o que passar da capacidade). A Dani é a entregadora em destaque da página /tres-telas.
//   node scripts/local/seed-entregadores.mjs        (idempotente)
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
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
const PASSWORD = 'Teste-local-24h'
const PIZZARIA = { lat: -8.7580, lng: -63.8995 }

const DRIVERS = [
    { key: 'dani', name: 'Dani Entregadora', slug: 'dani-entregadora', model: 'Honda CG 160', color: 'Vermelha', plate: 'NDA-4D12', cap: 4, units: 6, dx: 0.004, dy: -0.003, colors: ['#f97316', '#be123c'], bio: 'Entregadora de moto, rápida e cuidadosa. Levo até 4 pedidos por saída.' },
    { key: 'leo', name: 'Léo Motoboy', slug: 'leo-motoboy', model: 'Yamaha Factor 150', color: 'Preta', plate: 'NLE-0L30', cap: 3, units: 4, dx: -0.006, dy: 0.004, colors: ['#3b82f6', '#1e3a8a'], bio: 'Motoboy há 6 anos, conheço a cidade toda.' },
    { key: 'rafa', name: 'Rafa Veloz', slug: 'rafa-veloz', model: 'Honda Biz 125', color: 'Branca', plate: 'NRF-5R77', cap: 5, units: 8, dx: 0.009, dy: 0.006, colors: ['#16a34a', '#064e3b'], bio: 'Baú grande: cabem até 5 pedidos.' },
    { key: 'tito', name: 'Tito Expresso', slug: 'tito-expresso', model: 'Honda Pop 110', color: 'Azul', plate: 'NTI-2T08', cap: 2, units: 3, dx: -0.002, dy: -0.011, colors: ['#a855f7', '#581c87'], bio: 'Entrego rápido, até 2 pedidos por vez.' },
]
const badge = (name, [c1, c2]) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><text x="50%" y="62%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="700" fill="#fff">${name.split(' ').slice(0, 2).map((w) => w[0]).join('')}</text></svg>`

const moto = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d.colors[0]}" stop-opacity=".25"/><stop offset="1" stop-color="${d.colors[1]}" stop-opacity=".55"/></linearGradient></defs><rect width="640" height="420" fill="url(#bg)"/><rect y="330" width="640" height="90" fill="#0f172a" opacity=".18"/><g transform="translate(120 120)" stroke="#111827" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="70" cy="170" r="62"/><circle cx="330" cy="170" r="62"/><path d="M70 170 L170 70 L250 70 L330 170 M170 70 L150 30 L110 30 M250 70 L290 20 L330 20 M150 160 L250 160 L290 110"/><path d="M165 120 H255" stroke="${d.colors[0]}" stroke-width="30"/></g><text x="320" y="395" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">${d.model} · ${d.plate}</text></svg>`

const existing = new Map()
for (let page = 1; ; page++) {
    const list = await api('GET', `/auth/v1/admin/users?per_page=200&page=${page}`)
    for (const u of list.users || []) existing.set(u.email, u.id)
    if ((list.users || []).length < 200) break
}
const [{ id: planId }] = await api('GET', `/rest/v1/plans?select=id&code=eq.pre_pago&limit=1`)

for (const d of DRIVERS) {
    const email = `entregador-${d.key}@staging.iuser.test`
    let id = existing.get(email)
    if (!id) id = (await api('POST', '/auth/v1/admin/users', { email, password: PASSWORD, email_confirm: true, user_metadata: { name: d.name } })).id
    else await api('PUT', `/auth/v1/admin/users/${id}`, { password: PASSWORD })
    d.id = id; d.email = email
    const avatar = `entregador-${d.key}.png`
    const r = await fetch(`${API}/storage/v1/object/avatars/${avatar}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: await sharp(Buffer.from(badge(d.name, d.colors))).png().toBuffer() })
    if (!r.ok) throw new Error(`avatar ${d.key}: ${r.status}`)
    await upsert('profiles', [{ id, name: d.name, profileSlug: d.slug, email, is_active: true, avatar_url: avatar, description: d.bio }], 'id')
    // Fotos do cadastro (sem elas o painel do motorista fica "incompleto" e não deixa ligar o Modo motorista): a selfie e a foto da moto, geradas aqui
    const put = async (bucket, path, svg) => {
        const r = await fetch(`${API}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: await sharp(Buffer.from(svg)).png().toBuffer() })
        if (!r.ok) throw new Error(`${bucket}/${path}: ${r.status} ${await r.text()}`)
        return path
    }
    const selfiePath = await put('driver-selfie-photos', `${id}/selfie.png`, badge(d.name, d.colors))
    const motoPath = await put('driver-car-photos', `${id}/moto.png`, moto(d))
    await upsert('driver_vehicles', [{ driver_id: id, vehicle_kind: 'moto', car_model: d.model, car_color: d.color, car_plate: d.plate, services: ['objeto', 'pessoa'], passenger_capacity: 1, delivery_capacity: d.cap, delivery_capacity_units: d.units, vehicle_slug: `moto-${d.key}-pizza`, car_photo_url: motoPath, driver_photo_url: selfiePath }], 'driver_id,vehicle_kind')
    await upsert('driver_pricing', [{ driver_id: id, pricing_mode: 'platform', driver_mode_active: true, live_location_sync: true, live_lat: PIZZARIA.lat + d.dx, live_lng: PIZZARIA.lng + d.dy, live_updated_at: new Date().toISOString(), alert_sound_enabled: true, voice_navigation_enabled: true, delivery_radius_km: 12 }], 'driver_id')
    const has = await api('GET', `/rest/v1/subscriptions?select=id&user_id=eq.${id}&limit=1`)
    if (!has.length) await api('POST', '/rest/v1/subscriptions', [{ user_id: id, plan_id: planId, status: 'active', source: 'free_trial', starts_at: new Date().toISOString(), current_period_end: new Date(Date.now() + 365 * 86400000).toISOString() }], { Prefer: 'return=minimal' })
}

// Volume de cada produto da pizzaria na mochila (pizza/combo = 1, porção/sobremesa = ½, bebida = ¼): é o que o motorista vê e o que o banco confere ao aceitar
for (const [cat, u] of [['Pizzas tradicionais', 1], ['Pizzas especiais', 1], ['Pizzas doces', 1], ['Promoções', 1], ['Entradas e porções', 0.5], ['Sobremesas', 0.5], ['Refrigerantes e bebidas', 0.25]]) {
    const [st] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.pizzaria-forno-de-ouro&limit=1`)
    if (st) await api('PATCH', `/rest/v1/products?store_id=eq.${st.id}&type=eq.physical&category=eq.${encodeURIComponent(cat)}`, { delivery_units: u }, { Prefer: 'return=minimal' })
}

// A pizzaria passa a usar o entregador iUser (o banco recalcula o frete pela tarifa da plataforma)
await api('PATCH', `/rest/v1/stores?storeSlug=eq.pizzaria-forno-de-ouro`, { iuser_delivery_enabled: true }, { Prefer: 'return=minimal' })
console.log(`${DRIVERS.length} entregadores iUser: ${DRIVERS.map((d) => `${d.name} (cabem ${d.cap} entregas / ${d.units} un.)`).join(', ')}. A pizzaria usa o entregador iUser.`)
