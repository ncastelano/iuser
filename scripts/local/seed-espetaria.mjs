// ESPETARIA BRASA VIVA (banco LOCAL, 22/11/2026): o caso "pessoa começando um negócio" — vende com CPF (sem CNPJ), entrega com os
// PRÓPRIOS motoboys (Equipe/employees, entrega "Eu entrego" com taxa fixa, Entregador do iUser DESLIGADO), Pix na chave da loja.
// Dona = admin-teste (para entrar fácil pelo /dev-login). Movimento: SIM_STORE=espetaria-brasa-viva python3 -u scripts/local/simulate-pizzaria.py --employees
//   node scripts/local/seed-espetaria.mjs            (idempotente)
// Só o banco LOCAL (recusa qualquer outro).
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import sharp from 'sharp'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado (OrbStack?) — este script só roda no banco local')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function api(method, p, body, extra = {}) {
    const r = await fetch(`${API}${p}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 400)}`)
    return t ? JSON.parse(t) : null
}
const upsert = (table, rows, onConflict) => api('POST', `/rest/v1/${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' })
async function upload(bucket, objectPath, buf, contentType) {
    const r = await fetch(`${API}/storage/v1/object/${bucket}/${objectPath}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: buf })
    if (!r.ok) throw new Error(`upload ${bucket}/${objectPath} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const hash = (s) => crypto.createHash('sha1').update(s).digest().readUInt32LE(0)
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-espetaria:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const FONT = 'Helvetica, Arial, sans-serif'
const wrap = (text, max) => { const lines = []; let cur = ''; for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() } if (cur) lines.push(cur); return lines.slice(0, 3) }
const cardSvg = (title, sub, [c1, c2], seed, size = 640) => {
    const h = hash(seed), lines = wrap(title, 16), f = lines.length > 2 ? 46 : 54, baseY = size - 150 - (lines.length - 1) * (f + 8)
    const t = lines.map((l, i) => `<text x="48" y="${baseY + i * (f + 8)}" font-family="${FONT}" font-size="${f}" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')
    const cx = 120 + (h % 380), cy = 90 + ((h >> 8) % 150), r1 = 110 + ((h >> 16) % 80)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="${h % 2}" y1="0" x2="${1 - (h % 2)}" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="${r1}" fill="#fff" fill-opacity=".13"/><circle cx="${size - cx / 2}" cy="${size - 60}" r="${r1 / 2}" fill="#000" fill-opacity=".10"/>${t}<text x="48" y="${size - 62}" font-family="${FONT}" font-size="26" fill="#fff" fill-opacity=".85">${esc(sub)}</text></svg>`
}
const logoSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dc2626"/><stop offset="1" stop-color="#7f1d1d"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.34}" fill="#fbbf24"/><circle cx="${size * 0.42}" cy="${size * 0.44}" r="${size * 0.05}" fill="#b91c1c"/><circle cx="${size * 0.58}" cy="${size * 0.5}" r="${size * 0.05}" fill="#b91c1c"/><circle cx="${size * 0.48}" cy="${size * 0.62}" r="${size * 0.05}" fill="#b91c1c"/><path d="M${size / 2} ${size / 2} L${size * 0.84} ${size * 0.5}" stroke="#7f1d1d" stroke-width="4"/></svg>`


const SLUG = 'espetaria-brasa-viva'
const NAME = 'Espetaria Brasa Viva'
const HOURS = { weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { isOpen: true, start: '00:00', end: '00:00' }])) }
const LIB = { farofa: ['Farofa da casa', 4], vinagrete: ['Vinagrete', 4], mandioca: ['Mandioca cozida', 7], pao: ['Pão de alho', 5], queijo: ['Queijo coalho extra', 8], molho: ['Molho de alho', 3] }
const ACOMP = ['farofa', 'vinagrete', 'mandioca', 'pao', 'molho']
const PRODUCTS = [
    ['Combo Brasa: 6 espetos + farofa + 2 latas', 59.9, 'Promoções', 'De R$ 74,90 por R$ 59,90. Seis espetos variados, farofa e duas latas.', null],
    ['Espeto de picanha', 14.9, 'Espetos', 'Picanha suculenta, no ponto que você pedir.', ACOMP],
    ['Espeto de alcatra', 11.9, 'Espetos', 'Alcatra temperada com sal grosso.', ACOMP],
    ['Espeto de frango com bacon', 9.9, 'Espetos', 'Frango envolto em bacon crocante.', ACOMP],
    ['Espeto de linguiça toscana', 8.9, 'Espetos', 'Linguiça toscana na brasa.', ACOMP],
    ['Espeto de coração de frango', 8.9, 'Espetos', 'Corações temperados no alho.', ACOMP],
    ['Espeto de queijo coalho', 9.9, 'Espetos', 'Queijo coalho dourado, com melaço opcional.', ['queijo', 'molho']],
    ['Espeto de kafta', 10.9, 'Espetos', 'Kafta de carne com hortelã.', ACOMP],
    ['Jantinha completa', 24.9, 'Espetos', 'Espeto à escolha, arroz, feijão tropeiro, mandioca e vinagrete.', ACOMP],
    ['Coca-Cola lata 350 ml', 6.5, 'Refrigerantes e bebidas', 'Lata gelada.', null],
    ['Guaraná Antarctica 2 L', 11.9, 'Refrigerantes e bebidas', 'Gelado, 2 litros.', null],
    ['Cerveja long neck', 10.9, 'Refrigerantes e bebidas', 'Long neck bem gelada.', null],
    ['Porção de mandioca frita', 22.9, 'Entradas e porções', 'Mandioca crocante, porção para 2.', null],
    ['Porção de pão de alho (6)', 18.9, 'Entradas e porções', 'Pão de alho na brasa.', null],
]
const CAT_COLORS = { 'Promoções': ['#ef4444', '#b91c1c'], 'Espetos': ['#b45309', '#451a03'], 'Refrigerantes e bebidas': ['#0ea5e9', '#075985'], 'Entradas e porções': ['#eab308', '#854d0e'] }

const [admin] = await api('GET', `/rest/v1/profiles?select=id&%22profileSlug%22=eq.admin-teste&limit=1`)
if (!admin) throw new Error('Perfil admin-teste não encontrado no banco local')
await upload('store-logos', 'espetaria-brasa-viva.png', await sharp(Buffer.from(logoSvg(512))).png().toBuffer(), 'image/png')
await upsert('stores', [{
    name: NAME, storeSlug: SLUG, owner_id: admin.id, is_active: true, category: 'Alimentação',
    description: 'Espetinhos na brasa todo dia, jantinha completa e entrega com os nossos próprios motoboys.',
    address: 'Rua Dom Pedro II, 800, Centro, Porto Velho - RO', store_lat: -8.7612, store_lng: -63.9039, location: 'SRID=4326;POINT(-63.9039 -8.7612)',
    chat_enabled: true, accepts_delivery: true, accepts_pickup: true, accepts_pix: true, accepts_card: true, accepts_cash: true,
    delivery_type: 'fixed', delivery_fee: 6, delivery_base_distance: 6, delivery_base_fee: 6, iuser_delivery_enabled: false,
    allow_scheduling: false, store_model: 'products', business_hours: HOURS, logo_url: 'espetaria-brasa-viva.png',
    pix_key: 'espetaria-brasa-viva@staging.iuser.test', pix_key_type: 'email', prep_time_min: 20, prep_time_max: 35,
    seller_name: 'João Batista Ferreira (Espetaria Brasa Viva)', seller_doc_type: 'cpf', seller_doc: '52998224725', seller_address: 'Rua Dom Pedro II, 800, Centro, Porto Velho - RO',
}], 'storeSlug')
const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.${SLUG}`)

const rows = PRODUCTS.map(([name, price, cat, desc, addons]) => {
    const slug = `${slugify(name)}-espetaria`
    return { id: uid(`prod:${name}`), name, slug, description: desc, price, type: 'physical', price_type: 'fixed', listing_type: 'sale', is_active: true, category: cat, has_addons: !!addons,
        image_url: `esp-${slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: 30 + (hash(slug) % 300), show_chat: false, show_whatsapp: false, _colors: CAT_COLORS[cat], _addons: addons }
})
for (const r of rows) await upload('product-images', r.image_url, await sharp(Buffer.from(cardSvg(r.name, NAME, r._colors, r.slug))).jpeg({ quality: 80 }).toBuffer(), 'image/jpeg')
await upsert('products', rows.map(({ _colors, _addons, ...r }) => r), 'id')
await api('DELETE', `/rest/v1/store_addon_library?store_id=eq.${store.id}`)
await api('POST', '/rest/v1/store_addon_library', Object.values(LIB).map(([name, price]) => ({ store_id: store.id, name, price })), { Prefer: 'return=minimal' })
await api('DELETE', `/rest/v1/product_addons?store_id=eq.${store.id}`)
const addonRows = []
for (const r of rows.filter((x) => x._addons)) r._addons.forEach((k, i) => addonRows.push({ product_id: r.id, store_id: store.id, name: LIB[k][0], price: LIB[k][1], is_active: true, sort_order: i }))
await api('POST', '/rest/v1/product_addons', addonRows, { Prefer: 'return=minimal' })

// Motoboys PRÓPRIOS da loja (Equipe): cada um com o link /entregador/<token>
const have = await api('GET', `/rest/v1/employees?select=name&store_id=eq.${store.id}`)
for (const [name, phone] of [['Zé do Espeto', '5569992220001'], ['Carla Moto', '5569992220002'], ['Bruno Entregas', '5569992220003']])
    if (!have.some((e) => e.name === name)) await api('POST', '/rest/v1/employees', [{ store_id: store.id, name, phone, is_active: true, access_token: crypto.randomBytes(18).toString('hex') }], { Prefer: 'return=minimal' })
const emps = await api('GET', `/rest/v1/employees?select=name,access_token&store_id=eq.${store.id}&order=created_at`)
console.log(`${NAME} (/${SLUG}) pronta: ${rows.length} produtos, ${addonRows.length} adicionais, vende com CPF, entrega própria R$ 6.`)
for (const e of emps) console.log(`  motoboy ${e.name}: /entregador/${e.access_token}`)
