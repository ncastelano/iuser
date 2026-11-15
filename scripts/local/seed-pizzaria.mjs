// Pizzaria da conta admin-teste (banco LOCAL): loja com cardápio completo (pizzas salgadas, especiais e doces com ADICIONAIS/ingredientes extras,
// combos em promoção, refrigerantes, porções e sobremesas), entrega com taxa fixa, e serviços para agendar — rodízios e aluguel do Ambiente VIP
// (com entrada de 30% por Pix). Quem alimenta a loja com pedidos e agendamentos é scripts/local/simulate-pizzaria.py.
//   node scripts/local/seed-pizzaria.mjs            (cria/atualiza tudo; pode rodar de novo sem duplicar)
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
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-pizzaria:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
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

// ---------------------------------------------------------------- dados
const SLUG = 'pizzaria-forno-de-ouro'
const NAME = 'Pizzaria Forno de Ouro'
const ADMIN_SLUG = 'admin-teste'
const HOURS = { weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { isOpen: true, start: '11:00', end: '23:59' }])) }

// Adicionais (ingredientes extras): biblioteca da loja
const LIB = {
    catupiry: ['Catupiry extra', 8], cheddar: ['Cheddar extra', 8], bacon: ['Bacon extra', 9], mussarela: ['Mussarela extra', 7], calabresa: ['Calabresa extra', 7],
    frango: ['Frango desfiado extra', 9], azeitona: ['Azeitona', 4], cebola: ['Cebola', 3], milho: ['Milho', 3], tomateSeco: ['Tomate seco', 8],
    bordaCatupiry: ['Borda recheada de catupiry', 12], bordaCheddar: ['Borda recheada de cheddar', 12], bordaChocolate: ['Borda recheada de chocolate', 12],
    chocolate: ['Chocolate extra', 7], morango: ['Morango extra', 8], leiteCondensado: ['Leite condensado', 5], granulado: ['Granulado', 4], sorvete: ['Bola de sorvete de creme', 7],
}
const SAL = ['bordaCatupiry', 'bordaCheddar', 'catupiry', 'cheddar', 'bacon', 'mussarela', 'calabresa', 'frango', 'azeitona', 'cebola', 'milho', 'tomateSeco']
const DOCE = ['bordaChocolate', 'chocolate', 'morango', 'leiteCondensado', 'granulado', 'sorvete']

// [nome, preço, categoria, descrição, adicionais]
const PRODUCTS = [
    // ---- Promoções (combos; a descrição "De R$ X por R$ Y." vira oferta no catálogo da 3.0)
    ['Combo Família: 2 pizzas grandes + Coca-Cola 2 L', 99.9, 'Promoções', 'De R$ 129,90 por R$ 99,90. Escolha 2 pizzas grandes tradicionais e leve uma Coca-Cola 2 L.', null],
    ['Combo Casal: 1 pizza grande + 2 latas', 54.9, 'Promoções', 'De R$ 69,90 por R$ 54,90. Uma pizza grande tradicional e duas latas de 350 ml.', null],
    ['Combo Doce e Salgada', 89.9, 'Promoções', 'De R$ 114,90 por R$ 89,90. Uma pizza grande salgada e uma doce, a combinação perfeita.', null],
    ['Pizza Calabresa Grande + Borda de Catupiry', 56.9, 'Promoções', 'De R$ 64,90 por R$ 56,90. A campeã de vendas com borda recheada de graça.', null],
    // ---- Pizzas tradicionais (grande, 8 fatias)
    ['Pizza Margherita (grande)', 49.9, 'Pizzas tradicionais', 'Molho de tomate, mussarela, tomate fatiado e manjericão fresco. 8 fatias.', SAL],
    ['Pizza Mussarela (grande)', 47.9, 'Pizzas tradicionais', 'Molho de tomate, muita mussarela e orégano. 8 fatias.', SAL],
    ['Pizza Calabresa (grande)', 52.9, 'Pizzas tradicionais', 'Calabresa fatiada, cebola, mussarela e azeitonas. 8 fatias.', SAL],
    ['Pizza Portuguesa (grande)', 57.9, 'Pizzas tradicionais', 'Presunto, ovos, cebola, ervilha, mussarela e azeitonas. 8 fatias.', SAL],
    ['Pizza Frango com Catupiry (grande)', 58.9, 'Pizzas tradicionais', 'Frango desfiado temperado com catupiry cremoso. 8 fatias.', SAL],
    ['Pizza Quatro Queijos (grande)', 61.9, 'Pizzas tradicionais', 'Mussarela, provolone, parmesão e gorgonzola. 8 fatias.', SAL],
    ['Pizza Bacon com Cheddar (grande)', 59.9, 'Pizzas tradicionais', 'Bacon crocante, cheddar cremoso e mussarela. 8 fatias.', SAL],
    ['Pizza Napolitana (grande)', 54.9, 'Pizzas tradicionais', 'Mussarela, tomate fatiado, parmesão e manjericão. 8 fatias.', SAL],
    // ---- Pizzas especiais
    ['Pizza de Camarão ao Catupiry (grande)', 84.9, 'Pizzas especiais', 'Camarão refogado no alho com catupiry e cebolinha. 8 fatias.', SAL],
    ['Pizza Filé com Cheddar e Bacon (grande)', 76.9, 'Pizzas especiais', 'Tiras de filé mignon, cheddar, bacon e cebola caramelizada. 8 fatias.', SAL],
    ['Pizza Carne Seca com Abóbora (grande)', 72.9, 'Pizzas especiais', 'Carne seca desfiada, purê de abóbora e catupiry. 8 fatias.', SAL],
    ['Pizza Pepperoni Premium (grande)', 68.9, 'Pizzas especiais', 'Pepperoni artesanal, mussarela de búfala e mel picante. 8 fatias.', SAL],
    // ---- Pizzas doces
    ['Pizza Chocolate com Morango (grande)', 56.9, 'Pizzas doces', 'Chocolate ao leite derretido coberto de morangos frescos. 8 fatias.', DOCE],
    ['Pizza Romeu e Julieta (grande)', 54.9, 'Pizzas doces', 'Mussarela com goiabada cremosa. 8 fatias.', DOCE],
    ['Pizza Banana com Canela (grande)', 51.9, 'Pizzas doces', 'Banana caramelizada, açúcar e canela. 8 fatias.', DOCE],
    ['Pizza Brigadeiro Gourmet (grande)', 55.9, 'Pizzas doces', 'Brigadeiro cremoso e granulado de chocolate belga. 8 fatias.', DOCE],
    // ---- Refrigerantes e bebidas
    ['Coca-Cola 2 L', 13.9, 'Refrigerantes e bebidas', 'Gelada, 2 litros.', null],
    ['Guaraná Antarctica 2 L', 11.9, 'Refrigerantes e bebidas', 'Gelado, 2 litros.', null],
    ['Coca-Cola lata 350 ml', 6.5, 'Refrigerantes e bebidas', 'Lata gelada.', null],
    ['Guaraná Antarctica lata 350 ml', 6.5, 'Refrigerantes e bebidas', 'Lata gelada.', null],
    ['Suco de laranja natural 500 ml', 9.9, 'Refrigerantes e bebidas', 'Feito na hora, sem açúcar.', null],
    ['Água mineral 500 ml', 4, 'Refrigerantes e bebidas', 'Sem gás.', null],
    ['Cerveja long neck', 10.9, 'Refrigerantes e bebidas', 'Long neck 330 ml, bem gelada.', null],
    // ---- Entradas e porções
    ['Pão de alho (6 unidades)', 18.9, 'Entradas e porções', 'Pão de alho gratinado com mussarela.', ['mussarela', 'bacon', 'catupiry']],
    ['Batata frita com cheddar e bacon', 32.9, 'Entradas e porções', 'Porção grande, crocante, cheddar cremoso e bacon.', ['cheddar', 'bacon']],
    ['Anel de cebola empanado', 24.9, 'Entradas e porções', 'Porção com 12 anéis e molho barbecue.', null],
    ['Bruschetta (4 unidades)', 22.9, 'Entradas e porções', 'Tomate, manjericão e azeite sobre pão italiano.', null],
    // ---- Sobremesas
    ['Petit gâteau com sorvete', 24.9, 'Sobremesas', 'Bolinho quente de chocolate com sorvete de creme.', ['sorvete', 'morango', 'granulado']],
    ['Sorvete 2 bolas', 14.9, 'Sobremesas', 'Creme, chocolate ou morango.', ['chocolate', 'granulado', 'leiteCondensado']],
]

// Serviços para agendar: [nome, preço, minutos, categoria, descrição]
const SERVICES = [
    ['Rodízio de Pizza — Adulto', 69.9, 120, 'Rodízio', 'Pizzas salgadas e doces à vontade, servidas na mesa, por até 2 horas. Bebidas à parte.'],
    ['Rodízio de Pizza — Criança (4 a 10 anos)', 39.9, 120, 'Rodízio', 'Pizzas à vontade para a criançada, com sobremesa de sorvete.'],
    ['Rodízio Premium com bebida à vontade', 94.9, 120, 'Rodízio', 'Pizzas especiais (camarão, filé, pepperoni), sobremesas e refrigerantes à vontade.'],
    ['Mesa Exclusiva no Mezanino (até 6 pessoas)', 180, 120, 'Ambiente VIP', 'Mesa reservada no mezanino por 2 horas, com atendimento exclusivo. Consumação à parte.'],
    ['Aluguel do Ambiente VIP (3 horas)', 1200, 180, 'Ambiente VIP', 'Salão exclusivo, até 20 pessoas, com som ambiente, garçom dedicado e forno à vista. Consumação à parte.'],
    ['Festa de Aniversário no Ambiente VIP (4 horas)', 2400, 240, 'Ambiente VIP', 'Salão exclusivo com decoração básica, rodízio para até 15 convidados e bolo de pizza doce.'],
    ['Confraternização de Empresa — Ambiente VIP (4 horas)', 1800, 240, 'Ambiente VIP', 'Ambiente VIP para sua equipe, com rodízio premium, bebidas e projetor para apresentações.'],
]

const CAT_COLORS = { 'Promoções': ['#ef4444', '#b91c1c'], 'Pizzas tradicionais': ['#f97316', '#9a3412'], 'Pizzas especiais': ['#b91c1c', '#450a0a'], 'Pizzas doces': ['#a855f7', '#6b21a8'],
    'Refrigerantes e bebidas': ['#0ea5e9', '#075985'], 'Entradas e porções': ['#eab308', '#854d0e'], 'Sobremesas': ['#ec4899', '#9d174d'], 'Rodízio': ['#dc2626', '#7f1d1d'], 'Ambiente VIP': ['#1e293b', '#0f172a'] }

// ---------------------------------------------------------------- admin-teste, plano e loja
const [admin] = await api('GET', `/rest/v1/profiles?select=id,name,profileSlug:%22profileSlug%22&%22profileSlug%22=eq.${ADMIN_SLUG}&limit=1`)
if (!admin) throw new Error('Perfil admin-teste não encontrado no banco local')
const [{ plan_id: planLoja }] = await api('GET', `/rest/v1/subscriptions?select=plan_id,plans!inner(code)&plans.code=eq.loja&limit=1`)
const hasSub = await api('GET', `/rest/v1/subscriptions?select=id&user_id=eq.${admin.id}&limit=1`)
if (!hasSub.length) await api('POST', '/rest/v1/subscriptions', [{ user_id: admin.id, plan_id: planLoja, status: 'active', source: 'admin_grant', starts_at: new Date().toISOString(), current_period_end: new Date(Date.now() + 365 * 86400000).toISOString() }], { Prefer: 'return=minimal' })

await upload('store-logos', 'pizz-forno-de-ouro.png', await sharp(Buffer.from(logoSvg(512))).png().toBuffer(), 'image/png')
await upsert('stores', [{
    name: NAME, storeSlug: SLUG, owner_id: admin.id, is_active: true, category: 'Alimentação',
    description: 'Pizza de forno a lenha, rodízio todos os dias e o Ambiente VIP para a sua festa. Monte a sua com ingredientes extras e receba em casa.',
    address: 'Av. Sete de Setembro, 1500, Nossa Senhora das Graças, Porto Velho - RO', store_lat: -8.7580, store_lng: -63.8995, location: 'SRID=4326;POINT(-63.8995 -8.7580)',
    whatsapp: '5569999990001', show_whatsapp: true, chat_enabled: true,
    accepts_delivery: true, accepts_pickup: true, accepts_pix: true, accepts_card: true, accepts_cash: true,
    delivery_type: 'fixed', delivery_fee: 7, delivery_base_distance: 5, delivery_base_fee: 7,
    allow_scheduling: true, store_model: 'mixed', business_hours: HOURS, logo_url: 'pizz-forno-de-ouro.png',
    deposit_mode: 'percent', deposit_value: 30, deposit_policy: 'Cancelamento até 48 horas antes devolve a entrada. Depois disso a entrada não é devolvida.',
    pix_key: 'pizzaria-forno-de-ouro@staging.iuser.test', pix_key_type: 'email', view_count: 1840, share_count: 37, prep_time_min: 30, prep_time_max: 50,
}], 'storeSlug')
const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.${SLUG}`)

// ---------------------------------------------------------------- produtos, serviços, imagens e adicionais
const rows = []
for (const [name, price, cat, desc, addons] of PRODUCTS) {
    const slug = `${slugify(name)}-pizzaria`
    rows.push({ id: uid(`prod:${name}`), name, slug, description: desc, price, type: 'physical', price_type: 'fixed', listing_type: 'sale', is_active: true, category: cat, has_addons: !!addons,
        image_url: `pizz-${slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: (cat === 'Promoções' ? 700 : 40) + (hash(slug) % 500), show_chat: false, show_whatsapp: true, duration_minutes: 60,
        _colors: CAT_COLORS[cat], _sub: cat === 'Promoções' ? `Oferta · ${NAME}` : NAME, _addons: addons })
}
for (const [name, price, dur, cat, desc] of SERVICES) {
    const slug = `${slugify(name)}-pizzaria`
    rows.push({ id: uid(`svc:${name}`), name, slug, description: desc, price, type: 'service', price_type: 'fixed', listing_type: 'sale', is_active: true, category: cat, has_addons: false,
        image_url: `pizz-${slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: 120 + (hash(slug) % 400), show_chat: true, show_whatsapp: true, duration_minutes: dur,
        _colors: CAT_COLORS[cat], _sub: `${dur / 60} h · ${NAME}`, _addons: null })
}
for (const r of rows) {
    await upload('product-images', r.image_url, await sharp(Buffer.from(cardSvg(r.name, r._sub, r._colors, r.slug))).jpeg({ quality: 80 }).toBuffer(), 'image/jpeg')
}
await upsert('products', rows.map(({ _colors, _sub, _addons, ...r }) => r), 'id')

await api('DELETE', `/rest/v1/store_addon_library?store_id=eq.${store.id}`)
await api('POST', '/rest/v1/store_addon_library', Object.values(LIB).map(([name, price]) => ({ store_id: store.id, name, price })), { Prefer: 'return=minimal' })
await api('DELETE', `/rest/v1/product_addons?store_id=eq.${store.id}`)
const addonRows = []
for (const r of rows.filter((x) => x._addons)) r._addons.forEach((k, i) => addonRows.push({ product_id: r.id, store_id: store.id, name: LIB[k][0], price: LIB[k][1], is_active: true, sort_order: i }))
await api('POST', '/rest/v1/product_addons', addonRows, { Prefer: 'return=minimal' })

console.log(`${NAME} (/${SLUG}) pronta na conta admin-teste: ${PRODUCTS.length} produtos (${addonRows.length} adicionais), ${SERVICES.length} serviços para agendar, entrega R$ 7 e entrada de 30% nos agendamentos.`)
