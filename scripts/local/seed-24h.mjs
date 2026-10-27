// Comércio que NUNCA fecha e gente que trabalha à noite (banco LOCAL): 13 lojas abertas 24 horas (postos com conveniência, adegas, mini mercados,
// farmácia, padaria, lanchonete, distribuidora de gás e água) e 11 pessoas que oferecem serviços noturnos (vigilante, babá, cuidadora, segurança,
// plantão de enfermagem, chaveiro, guincho, eletricista de emergência, pet sitter, motoboy, técnico de TI). Assim sempre há alguém vendendo
// produto ou serviço a qualquer hora, e o simulador (scripts/local/simulate-ecosystem.py) tem com quem negociar de madrugada.
//   node scripts/local/seed-24h.mjs            (cria/atualiza tudo; pode rodar de novo sem duplicar)
// Contas: owner-24h-<chave>@staging.iuser.test e owner-noite-<chave>@staging.iuser.test (o simulador as trata como donos). Só o banco LOCAL.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import sharp from 'sharp'

const env = Object.fromEntries(execFileSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', '.local-supabase'], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' } })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, KEY = env.SERVICE_ROLE_KEY
if (!API || !KEY || !/127\.0\.0\.1|localhost/.test(API)) throw new Error('Supabase LOCAL desligado (OrbStack?) — este script só roda no banco local')
const PASSWORD = 'Teste-local-24h'
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
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-24h:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
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
const initials = (name) => name.split(' ').filter((w) => /^[A-Za-zÀ-ú]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
const badgeSvg = (name, [c1, c2], size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><text x="50%" y="${size * 0.62}" text-anchor="middle" font-family="${FONT}" font-size="${size * 0.42}" font-weight="700" fill="#fff">${esc(initials(name))}</text></svg>`
const AV = [['#f97316', '#c2410c'], ['#3b82f6', '#1d4ed8'], ['#10b981', '#047857'], ['#a855f7', '#6d28d9'], ['#ec4899', '#be185d'], ['#eab308', '#a16207'], ['#06b6d4', '#0e7490'], ['#ef4444', '#b91c1c']]
const jit = (seed, base, spread = 0.012) => Math.round((base + (((hash(seed) % 2000) / 1000) - 1) * spread) * 10000) / 10000

// ---------------------------------------------------------------- lojas 24 horas
const HOURS_24 = { weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { isOpen: true, start: '00:00', end: '00:00' }])) }
const POSTO = [['Água mineral 500 ml', 3.5], ['Energético 269 ml', 8.9], ['Café expresso', 5], ['Salgado assado', 7.5], ['Pão na chapa', 8], ['Gelo em cubos 5 kg', 12], ['Óleo de motor 1 L', 39.9], ['Carvão 3 kg', 18.9]]
const BEBIDAS = [['Cerveja lata 350 ml', 4.5], ['Cerveja long neck', 8.9], ['Refrigerante 2 L', 9.9], ['Vodka 1 L', 49.9], ['Gelo em cubos 5 kg', 12], ['Energético 269 ml', 8.9], ['Vinho tinto 750 ml', 42.9], ['Carvão 3 kg', 18.9]]
const MERCADO = [['Arroz 5 kg', 28.9], ['Feijão 1 kg', 8.5], ['Leite integral 1 L', 5.99], ['Pão de forma', 8.9], ['Ovos (dúzia)', 14.9], ['Macarrão 500 g', 4.5], ['Papel higiênico 12 un', 22.9], ['Detergente 500 ml', 2.99]]
const STORES = [
    { key: 'posto-centro', name: 'Posto Ipiranga Centro 24h', cat: 'Transporte e Logística', desc: 'Posto com loja de conveniência aberta 24 horas: combustível, café, salgados, gelo e o que você precisar de madrugada.', addr: 'Av. Sete de Setembro, 1200, Centro, Porto Velho - RO', lat: -8.7625, lng: -63.9030, colors: ['#0ea5e9', '#075985'], items: POSTO },
    { key: 'posto-calama', name: 'Posto Calama 24h Conveniência', cat: 'Transporte e Logística', desc: 'Conveniência 24 horas na Av. Calama. Lanches, bebidas, lubrificantes e troca de óleo.', addr: 'Av. Calama, 3100, Embratel, Porto Velho - RO', lat: -8.7510, lng: -63.9150, colors: ['#ef4444', '#991b1b'], items: POSTO },
    { key: 'posto-jorge', name: 'Posto BR Jorge Teixeira 24h', cat: 'Transporte e Logística', desc: 'Posto de estrada com conveniência aberta a noite toda, ideal para caminhoneiros e motoristas de aplicativo.', addr: 'Av. Jorge Teixeira, 5000, Industrial, Porto Velho - RO', lat: -8.7480, lng: -63.8900, colors: ['#22c55e', '#166534'], items: POSTO },
    { key: 'adega-ze', name: 'Adega do Zé 24h', cat: 'Alimentação', desc: 'Bebidas geladas a qualquer hora: cervejas, destilados, vinhos, gelo e carvão. Retire ou peça entrega.', addr: 'Rua Dom Pedro II, 640, Centro, Porto Velho - RO', lat: -8.7640, lng: -63.9050, colors: ['#f59e0b', '#92400e'], items: BEBIDAS },
    { key: 'disk-gelada', name: 'Disk Gelada Madrugada', cat: 'Alimentação', desc: 'Distribuidora de bebidas que não fecha: gelada na porta de casa de dia e de madrugada.', addr: 'Av. Presidente Dutra, 2400, Olaria, Porto Velho - RO', lat: -8.7635, lng: -63.9035, colors: ['#3b82f6', '#1e3a8a'], items: BEBIDAS },
    { key: 'conveniencia-estrela', name: 'Conveniência Estrela 24h', cat: 'Alimentação', desc: 'Bebidas, lanches e itens de mercado 24 horas por dia, 7 dias por semana.', addr: 'Av. Carlos Gomes, 1800, São Cristóvão, Porto Velho - RO', lat: -8.7630, lng: -63.9060, colors: ['#a855f7', '#581c87'], items: [...BEBIDAS.slice(0, 4), ...MERCADO.slice(2, 6)] },
    { key: 'mini-nova-porto', name: 'Mini Mercado Nova Porto 24h', cat: 'Alimentação', desc: 'Mini mercado aberto o tempo todo: básicos da casa, bebidas, higiene e limpeza.', addr: 'Rua Júlio de Castilho, 410, Arigolândia, Porto Velho - RO', lat: -8.7650, lng: -63.9020, colors: ['#10b981', '#065f46'], items: MERCADO },
    { key: 'mini-tudo-aqui', name: 'Mini Mercado Tudo Aqui 24h', cat: 'Alimentação', desc: 'Tudo aqui, a qualquer hora. Compras rápidas para o dia a dia e para a madrugada.', addr: 'Av. Campos Sales, 900, Liberdade, Porto Velho - RO', lat: -8.7610, lng: -63.9080, colors: ['#f97316', '#9a3412'], items: MERCADO },
    { key: 'mercadinho-sc', name: 'Mercadinho São Cristóvão 24h', cat: 'Alimentação', desc: 'Mercadinho de bairro que funciona 24 horas: pão, leite, ovos, bebidas e produtos de limpeza.', addr: 'Rua Rafael Vaz e Silva, 305, São Cristóvão, Porto Velho - RO', lat: -8.7655, lng: -63.9065, colors: ['#ec4899', '#9d174d'], items: [...MERCADO.slice(0, 6), ['Refrigerante 2 L', 9.9], ['Cerveja lata 350 ml', 4.5]] },
    { key: 'farmacia-plantao', name: 'Farmácia Plantão 24h', cat: 'Saúde e Bem-estar', desc: 'Farmácia de plantão 24 horas: medicamentos, fraldas, curativos e itens de primeiros socorros.', addr: 'Av. Sete de Setembro, 850, Centro, Porto Velho - RO', lat: -8.7615, lng: -63.9040, colors: ['#14b8a6', '#115e59'], items: [['Dipirona 10 comprimidos', 6.9], ['Paracetamol 750 mg', 9.9], ['Soro fisiológico 500 ml', 8.5], ['Fralda descartável M', 39.9], ['Curativo adesivo (20 un)', 7.9], ['Termômetro digital', 29.9], ['Antialérgico 10 comprimidos', 14.9], ['Álcool em gel 500 ml', 12.9]] },
    { key: 'padaria-pao-quente', name: 'Padaria Pão Quente 24h', cat: 'Alimentação', desc: 'Pão saindo toda hora, inclusive de madrugada. Café, salgados, bolos e sanduíches.', addr: 'Rua Almirante Barroso, 220, Centro, Porto Velho - RO', lat: -8.7620, lng: -63.9000, colors: ['#eab308', '#854d0e'], items: [['Pão francês (10 un)', 7], ['Café coado', 4.5], ['Bolo de milho (fatia)', 6.5], ['Pão de queijo (10 un)', 12], ['Sanduíche natural', 12.9], ['Cuscuz com ovo', 9]] },
    { key: 'lanchonete-madrugada', name: 'Lanchonete Madrugada 24h', cat: 'Alimentação', desc: 'Lanches, porções e açaí a qualquer hora. A cozinha não fecha.', addr: 'Av. Farquar, 700, Pedrinhas, Porto Velho - RO', lat: -8.7600, lng: -63.9000, colors: ['#dc2626', '#7f1d1d'], items: [['X-burguer', 18], ['X-tudo', 26], ['Cachorro-quente', 12], ['Batata frita', 16], ['Suco natural 500 ml', 9], ['Açaí 500 ml', 18]] },
    { key: 'disk-gas-agua', name: 'Disk Gás e Água 24h', cat: 'Casa e Decoração', desc: 'Gás de cozinha e água mineral entregues 24 horas por dia.', addr: 'Av. Jorge Teixeira, 2200, Industrial, Porto Velho - RO', lat: -8.7490, lng: -63.8950, colors: ['#0284c7', '#0c4a6e'], items: [['Gás de cozinha P13', 112], ['Galão de água 20 L', 14], ['Água mineral 1,5 L (fardo c/ 6)', 18], ['Mangueira e regulador', 39.9]] },
]
const OWNER_NAMES = ['Edson Matos', 'Neide Prado', 'Gilberto Souza', 'Zeca Albuquerque', 'Tânia Lima', 'Marcos Vilela', 'Rita Nogueira', 'Osvaldo Cunha', 'Beatriz Maia', 'Ivan Rocha', 'Luzia Moreira', 'Heitor Campos', 'Carla Bessa']

// ---------------------------------------------------------------- pessoas que trabalham à noite
const NIGHT = [
    { key: 'vigilante', name: 'Cláudio Ferraz', desc: 'Vigilante com 12 anos de experiência. Atendo à noite e de madrugada.', lat: -8.7625, lng: -63.9040, bairro: 'Centro',
        services: [['Vigilante noturno para obras e comércio', 'Ronda e vigilância das 19h às 7h, com registro de ocorrências.'], ['Ronda em condomínios e lojas', 'Rondas programadas durante a madrugada, com relatório.']] },
    { key: 'baba', name: 'Marta Albuquerque', desc: 'Babá com pernoite, referências e curso de primeiros socorros.', lat: -8.7635, lng: -63.9060, bairro: 'São Cristóvão',
        services: [['Babá noturna (pernoite)', 'Fico com seus filhos à noite, com banho, jantar e hora de dormir.'], ['Babá para festas e eventos', 'Cuidado das crianças durante festas e casamentos.']] },
    { key: 'cuidadora', name: 'Sandra Nogueira', desc: 'Cuidadora de idosos, plantão noturno e acompanhamento hospitalar.', lat: -8.7605, lng: -63.9025, bairro: 'Olaria',
        services: [['Cuidadora de idosos — plantão noturno', 'Acompanhamento do idoso à noite, medicação no horário e higiene.'], ['Acompanhante hospitalar noturna', 'Fico com seu familiar internado durante a noite.']] },
    { key: 'seguranca', name: 'Wellington Duarte', desc: 'Segurança particular para eventos, portarias e escolta.', lat: -8.7650, lng: -63.9010, bairro: 'Arigolândia',
        services: [['Segurança particular para eventos e festas', 'Equipe uniformizada para controle de acesso e segurança.'], ['Portaria noturna', 'Controle de entrada e saída em condomínios e empresas à noite.']] },
    { key: 'enfermagem', name: 'Joana Pinheiro', desc: 'Técnica de enfermagem. Plantões noturnos e atendimento em domicílio.', lat: -8.7600, lng: -63.9070, bairro: 'Liberdade',
        services: [['Técnica de enfermagem plantonista (noite)', 'Plantão de 12 horas em casa: curativos, medicação e monitoramento.'], ['Aplicação de injetáveis a domicílio 24h', 'Aplicação de medicação e soro a qualquer hora, com receita.']] },
    { key: 'chaveiro', name: 'Rogério Tavares', desc: 'Chaveiro 24 horas, residencial e automotivo.', lat: -8.7660, lng: -63.9020, bairro: 'Caiari',
        services: [['Chaveiro 24 horas', 'Abertura de portas, troca de fechaduras e cópia de chaves a qualquer hora.'], ['Abertura de veículos', 'Abertura de carros e motos sem danos, atendimento rápido.']] },
    { key: 'guincho', name: 'Ademir Bastos', desc: 'Guincho e socorro mecânico 24 horas.', lat: -8.7480, lng: -63.8920, bairro: 'Industrial',
        services: [['Guincho e socorro mecânico 24h', 'Reboque de carros e motos na cidade e na BR, a qualquer hora.'], ['Troca de pneu e carga de bateria', 'Atendimento no local: pneu furado, bateria arriada e pane seca.']] },
    { key: 'eletricista', name: 'Paulo Henrique Lobo', desc: 'Eletricista de emergência. Queda de energia, curto e disjuntor.', lat: -8.7510, lng: -63.9140, bairro: 'Embratel',
        services: [['Eletricista de emergência 24h', 'Curto-circuito, falta de energia e quadro de luz, de dia ou de madrugada.']] },
    { key: 'petsitter', name: 'Cida Rezende', desc: 'Pet sitter com pernoite e passeios noturnos.', lat: -8.7595, lng: -63.9095, bairro: 'Mato Grosso',
        services: [['Pet sitter com pernoite', 'Fico com seu pet na sua casa ou na minha, com fotos e atualizações.'], ['Passeio noturno de cães', 'Passeio seguro à noite, com coleira reflexiva.']] },
    { key: 'motoboy', name: 'Leonardo Siqueira', desc: 'Entregas noturnas e urgentes de moto.', lat: -8.7570, lng: -63.9010, bairro: 'Pedrinhas',
        services: [['Entregas noturnas (motoboy)', 'Entrego o que você precisar de noite e de madrugada, na cidade toda.'], ['Entrega urgente de documentos 24h', 'Documentos e encomendas pequenas com retirada imediata.']] },
    { key: 'ti', name: 'Diego Albuquerque', desc: 'Técnico de informática em plantão noturno, empresas e residências.', lat: -8.7630, lng: -63.9005, bairro: 'Centro',
        services: [['Técnico de TI — plantão noturno', 'Suporte urgente a computadores, rede e servidores fora do horário comercial.']] },
]

// ---------------------------------------------------------------- contas
const existing = new Map()
for (let page = 1; ; page++) {
    const list = await api('GET', `/auth/v1/admin/users?per_page=200&page=${page}`)
    for (const u of list.users || []) existing.set(u.email, u.id)
    if ((list.users || []).length < 200) break
}
async function ensureUser(email, name) {
    if (existing.has(email)) return existing.get(email)
    const u = await api('POST', '/auth/v1/admin/users', { email, password: PASSWORD, email_confirm: true, user_metadata: { name } })
    existing.set(email, u.id)
    return u.id
}
const loja = await api('GET', `/rest/v1/subscriptions?select=plan_id,plans!inner(code)&plans.code=eq.loja&limit=1`)
const planLoja = loja[0]?.plan_id
if (!planLoja) throw new Error('Nenhuma assinatura de loja de referência no banco local (rode o setup antes).')

STORES.forEach((s, i) => { s.owner = { name: OWNER_NAMES[i % OWNER_NAMES.length], email: `owner-24h-${s.key}@staging.iuser.test`, slug: `${slugify(OWNER_NAMES[i % OWNER_NAMES.length])}-24h` } })
NIGHT.forEach((p) => { p.email = `owner-noite-${p.key}@staging.iuser.test`; p.slug = `noite-${slugify(p.name)}` })
for (const p of [...STORES.map((s) => s.owner), ...NIGHT]) p.id = await ensureUser(p.email, p.name)

// ---------------------------------------------------------------- perfis, assinaturas e imagens
const people = [...STORES.map((s) => ({ ...s.owner, desc: `Dono da ${s.name}.`, lat: null })), ...NIGHT.map((p) => ({ id: p.id, name: p.name, slug: p.slug, email: p.email, desc: p.desc, lat: p.lat, lng: p.lng, bairro: p.bairro, night: true }))]
for (const p of people) {
    await upload('avatars', `eco24-${p.slug}.png`, await sharp(Buffer.from(badgeSvg(p.name, AV[hash(p.slug) % AV.length], 256))).png().toBuffer(), 'image/png')
}
const base = (p) => ({ id: p.id, name: p.name, profileSlug: p.slug, email: p.email, is_active: true, avatar_url: `eco24-${p.slug}.png`, description: p.desc })
await upsert('profiles', people.filter((p) => !p.night).map(base), 'id')
await upsert('profiles', people.filter((p) => p.night).map((p) => ({ ...base(p), service_mode_active: true, show_on_map: true, show_location: true, store_lat: p.lat, store_lng: p.lng, address: `${p.bairro}, Porto Velho - RO` })), 'id')
for (const p of people) {
    const has = await api('GET', `/rest/v1/subscriptions?select=id&user_id=eq.${p.id}&limit=1`)
    if (!has.length) await api('POST', '/rest/v1/subscriptions', [{ user_id: p.id, plan_id: planLoja, status: 'active', source: 'admin_grant', starts_at: new Date().toISOString(), current_period_end: new Date(Date.now() + 365 * 86400000).toISOString() }], { Prefer: 'return=minimal' })
}

// ---------------------------------------------------------------- lojas
for (const s of STORES) {
    await upload('store-logos', `eco24-${s.key}.png`, await sharp(Buffer.from(badgeSvg(s.name, s.colors, 512))).png().toBuffer(), 'image/png')
}
await upsert('stores', STORES.map((s, i) => ({
    name: s.name, storeSlug: `24h-${s.key}`, owner_id: s.owner.id, is_active: true, category: s.cat, description: s.desc, address: s.addr,
    store_lat: s.lat, store_lng: s.lng, location: `SRID=4326;POINT(${s.lng} ${s.lat})`, whatsapp: `55699999${String(7000 + i)}`, show_whatsapp: true, chat_enabled: true,
    accepts_delivery: true, accepts_pickup: true, accepts_pix: true, accepts_card: true, accepts_cash: true, delivery_type: 'fixed', delivery_fee: 6, delivery_base_distance: 5, delivery_base_fee: 6,
    allow_scheduling: false, business_hours: HOURS_24, logo_url: `eco24-${s.key}.png`, store_model: 'products', view_count: 300 + (hash(s.key) % 2500), share_count: 5 + (hash(s.key) % 60),
    pix_key: `24h-${s.key}@staging.iuser.test`, pix_key_type: 'email',
})), 'storeSlug')
const dbStores = await api('GET', `/rest/v1/stores?select=id,storeSlug&storeSlug=in.(${STORES.map((s) => `24h-${s.key}`).join(',')})`)
for (const s of STORES) s.id = dbStores.find((x) => x.storeSlug === `24h-${s.key}`).id

// ---------------------------------------------------------------- produtos das lojas e serviços das pessoas
const rows = []
for (const s of STORES) {
    s.items.forEach(([name, price], i) => {
        const slug = `${slugify(name)}-${s.key}`
        rows.push({ id: uid(`prod:${s.key}:${name}`), name, slug, description: `${name} — ${s.name}. Aberto 24 horas.`, price, type: 'physical', price_type: 'fixed', listing_type: 'sale', is_active: true,
            image_url: `eco24-${slug}.jpg`, store_id: s.id, owner_id: s.owner.id, view_count: 20 + (hash(slug) % 400), show_chat: false, show_whatsapp: true, duration_minutes: 60, _colors: [s.colors, [s.colors[1], s.colors[0]], [s.colors[0], '#111827']][i % 3], _sub: s.name })
    })
}
for (const p of NIGHT) {
    p.services.forEach(([name, description], i) => {
        const slug = `${slugify(name)}-${p.key}`
        rows.push({ id: uid(`svc:${p.key}:${name}`), name, slug, description, price: 0, type: 'service', price_type: 'fixed', listing_type: 'service_offer', is_active: true, image_url: `eco24-${slug}.jpg`,
            store_id: null, owner_id: p.id, view_count: 30 + (hash(slug) % 500), show_chat: true, show_whatsapp: true, duration_minutes: 60, _colors: AV[(hash(p.key) + i) % AV.length], _sub: `${p.name} · à noite` })
    })
}
for (const r of rows) {
    const buf = await sharp(Buffer.from(cardSvg(r.name, r._sub, r._colors, r.slug))).jpeg({ quality: 80 }).toBuffer()
    await upload('product-images', r.image_url, buf, 'image/jpeg')
}
await upsert('products', rows.map(({ _colors, _sub, ...r }) => r), 'id')
console.log(`${STORES.length} lojas 24h (${rows.filter((r) => r.listing_type === 'sale').length} produtos) e ${NIGHT.length} pessoas com serviços noturnos (${rows.filter((r) => r.listing_type === 'service_offer').length} serviços) prontos.`)
