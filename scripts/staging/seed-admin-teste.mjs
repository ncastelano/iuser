// O ADMIN TESTE do STAGING com tudo para testar (23/11/2026, pedido do dono): duas LOJAS — uma clínica de saúde (serviços com agenda e
// entrada por Pix) e um espetinho (cardápio com combos, espetos, porções e bebidas, com Entregador do iUser) — e os TRÊS tipos de
// veículo (carro, moto e bicicleta) com fotos, comodidades e porta-malas, e a tarifa (Tarifa iUser).
//   node scripts/staging/seed-admin-teste.mjs              (cria/atualiza; pode rodar de novo sem duplicar)
//   node scripts/staging/seed-admin-teste.mjs --no-images
// Só roda no STAGING (recusa a URL da produção). Usa o service role: é massa de teste.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'

const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
const file = path.resolve(import.meta.dirname, '..', '..', '.env.staging.local')
const env = { ...(fs.existsSync(file) ? Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) : {}), ...process.env }
const URL_ = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('Faltam STAGING_SUPABASE_URL e STAGING_SUPABASE_SERVICE_ROLE_KEY em .env.staging.local'); process.exit(1) }
if (URL_.includes(PROD_REF)) { console.error('RECUSADO: essa URL é a da PRODUÇÃO.'); process.exit(1) }
const NO_IMAGES = process.argv.includes('--no-images')

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function api(method, p, body, extra = {}) {
    const r = await fetch(`${URL_}${p}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 400)}`)
    return t ? JSON.parse(t) : null
}
const upsert = (table, rows, onConflict) => rows.length ? api('POST', `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' }) : null
async function upload(bucket, objectPath, buf, contentType) {
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${objectPath}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: buf })
    if (!r.ok) throw new Error(`upload ${bucket}/${objectPath} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-admin:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const hash = (s) => crypto.createHash('sha1').update(s).digest().readUInt32LE(0)
const FONT = 'Helvetica, Arial, sans-serif'
function wrap(text, max) { const out = []; let cur = ''; for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w } else cur = (cur + ' ' + w).trim() } if (cur) out.push(cur); return out.slice(0, 3) }
function cardSvg(title, sub, [c1, c2], seed, size = 640) {
    const h = hash(seed); const lines = wrap(title, 16); const f = lines.length > 2 ? 46 : 54; const y0 = size - 150 - (lines.length - 1) * (f + 8)
    const t = lines.map((l, i) => `<text x="48" y="${y0 + i * (f + 8)}" font-family="${FONT}" font-size="${f}" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')
    const cx = 120 + (h % 380), cy = 90 + ((h >> 8) % 150), r1 = 110 + ((h >> 16) % 80)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="${r1}" fill="#fff" fill-opacity=".13"/>${t}<text x="48" y="${size - 62}" font-family="${FONT}" font-size="26" fill="#fff" fill-opacity=".85">${esc(sub)}</text></svg>`
}
function badgeSvg(text, [c1, c2], size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><text x="50%" y="${size * 0.62}" text-anchor="middle" font-family="${FONT}" font-size="${size * 0.36}" font-weight="700" fill="#fff">${esc(text)}</text></svg>`
}
const week = (open, close, days = [1, 2, 3, 4, 5, 6], lunch) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), days.includes(d) ? { isOpen: true, start: open, end: close, ...(lunch ? { lunchStart: lunch[0], lunchEnd: lunch[1] } : {}) } : { isOpen: false, start: '', end: '' }]))

console.log('Alvo (STAGING):', URL_.replace('https://', '').split('.')[0])
const [admin] = await api('GET', '/rest/v1/profiles?select=id,profileSlug&profileSlug=eq.admin-teste')
if (!admin) { console.error('admin-teste não existe no staging (rode scripts/staging/seed.mjs antes).'); process.exit(1) }
const ME = admin.id

// ===================== LOJAS =====================
const STORES = [
    {
        key: 'clinica', slug: 'clinica-vida-plena', name: 'Clínica Vida Plena', category: 'Saúde e Bem-estar', colors: ['#0ea5e9', '#0369a1'], model: 'services',
        description: 'Clínica multiprofissional: clínico geral, psicologia, nutrição, fisioterapia e exames de rotina. Atendimento humanizado, presencial e online, com agendamento pelo iUser.',
        address: 'Av. Carlos Gomes, 1500, Centro, Porto Velho - RO', lat: -8.7619, lng: -63.9006, hours: week('07:00', '19:00', [1, 2, 3, 4, 5, 6], ['12:00', '13:00']),
        scheduling: true, delivery: false,
        products: [
            ['Kit Primeiros Socorros', 79.9, 'Gaze, esparadrapo, antisséptico, luvas e termômetro.', 'Produtos de saúde'],
            ['Termômetro Digital', 34.9, 'Leitura em 10 segundos, com alarme de febre.', 'Produtos de saúde'],
            ['Medidor de Pressão de Pulso', 149.9, 'Automático, com memória para 60 medições.', 'Produtos de saúde'],
            ['Óleo de Massagem Relaxante', 39.9, 'Usado nas sessões de fisioterapia. 120 ml.', 'Bem-estar'],
            ['Faixa Elástica de Exercícios (3 níveis)', 59.9, 'Para os exercícios de casa da fisioterapia.', 'Bem-estar'],
        ],
        services: [
            ['Consulta com Clínico Geral', 180, 'Consulta completa com solicitação de exames quando necessário.', 30, 'Consultas'],
            ['Retorno com Clínico Geral', 0, 'Retorno em até 30 dias da consulta, sem custo.', 20, 'Consultas'],
            ['Teleconsulta', 140, 'Consulta por vídeo, com receita digital.', 30, 'Consultas'],
            ['Sessão de Psicoterapia', 200, 'Atendimento individual de 50 minutos, presencial ou online.', 50, 'Psicologia'],
            ['Avaliação Psicológica', 450, 'Testes, entrevista e devolutiva por escrito.', 90, 'Psicologia'],
            ['Consulta com Nutricionista', 220, 'Avaliação corporal e plano alimentar personalizado.', 60, 'Nutrição'],
            ['Retorno com Nutricionista', 120, 'Acompanhamento e ajuste do plano alimentar.', 40, 'Nutrição'],
            ['Sessão de Fisioterapia', 130, 'Fisioterapia ortopédica e postural.', 50, 'Fisioterapia'],
            ['Pacote 10 Sessões de Fisioterapia', 1100, '10 sessões com 15% de desconto, para usar em até 3 meses.', 50, 'Fisioterapia'],
            ['Exame de Glicemia', 25, 'Resultado na hora. Jejum de 8 horas.', 10, 'Exames'],
            ['Aferição de Pressão', 15, 'Aferição com orientação da enfermeira.', 10, 'Exames'],
            ['Eletrocardiograma', 120, 'Com laudo do cardiologista em até 24 horas.', 30, 'Exames'],
        ],
        pubs: [
            ['Novos horários de fisioterapia', 'Agora atendemos também aos sábados pela manhã. Agende pelo iUser!'],
            ['Campanha de vacinação', 'Vacina da gripe disponível a partir de segunda. Traga sua carteirinha.'],
            ['Dica da nutricionista', 'Beba água ao longo do dia: o corpo pede antes de você sentir sede.'],
        ],
    },
    {
        key: 'espeto', slug: 'espetinho-do-admin', name: 'Espetinho do Admin', category: 'Alimentação', colors: ['#ef4444', '#991b1b'], model: 'products',
        description: 'Espetinhos na brasa, porções, caldos e bebidas geladas. Entrega com o Entregador do iUser ou retirada no balcão.',
        address: 'Rua Dom Pedro II, 950, Centro, Porto Velho - RO', lat: -8.7605, lng: -63.9035, hours: week('17:00', '23:59', [0, 2, 3, 4, 5, 6]),
        scheduling: false, delivery: true,
        products: [
            ['Combo Casal: 6 espetos + 2 refris', 79.9, 'Escolha 6 espetos tradicionais e 2 refrigerantes lata.', 'Promoções'],
            ['Combo Família: 12 espetos + farofa + 1 refri 2L', 139.9, 'Para 4 pessoas, com farofa e vinagrete.', 'Promoções'],
            ['Espeto de Carne', 12, 'Alcatra temperada na brasa, 150 g.', 'Espetos'],
            ['Espeto de Frango', 10, 'Sobrecoxa marinada no limão e alho.', 'Espetos'],
            ['Espeto de Frango com Bacon', 13, 'Frango envolto em bacon crocante.', 'Espetos'],
            ['Espeto de Linguiça Toscana', 10, 'Linguiça artesanal levemente apimentada.', 'Espetos'],
            ['Espeto de Coração', 11, 'Coração de frango temperado na cerveja.', 'Espetos'],
            ['Espeto de Queijo Coalho', 11, 'Com melaço de cana e orégano.', 'Espetos'],
            ['Espeto de Kafta', 13, 'Carne moída com hortelã e especiarias.', 'Espetos'],
            ['Espeto de Picanha', 22, 'Picanha bovina, 180 g, no ponto que você pedir.', 'Espetos'],
            ['Espeto de Tambaqui', 24, 'Peixe da região, com limão e ervas.', 'Espetos'],
            ['Espeto Vegetariano', 12, 'Abobrinha, pimentão, cebola, tomate e cogumelo.', 'Espetos'],
            ['Porção de Mandioca Frita', 22, 'Crocante por fora, macia por dentro. 500 g.', 'Porções'],
            ['Porção de Batata Frita', 24, 'Com cheddar e bacon (+R$ 8 pedindo na observação).', 'Porções'],
            ['Farofa da Casa', 8, 'Farofa de bacon com banana.', 'Porções'],
            ['Vinagrete', 6, 'Tomate, cebola, pimentão e cheiro-verde.', 'Porções'],
            ['Caldo de Feijão', 14, 'Com torresmo e cebolinha. 400 ml.', 'Caldos'],
            ['Caldo de Mocotó', 18, 'O clássico da madrugada. 400 ml.', 'Caldos'],
            ['Refrigerante Lata', 6, 'Coca-Cola, Guaraná ou Fanta, 350 ml.', 'Bebidas'],
            ['Refrigerante 2 Litros', 14, 'Coca-Cola ou Guaraná.', 'Bebidas'],
            ['Suco Natural', 9, 'Cupuaçu, acerola, maracujá ou laranja. 500 ml.', 'Bebidas'],
            ['Água Mineral', 4, 'Com ou sem gás, 500 ml.', 'Bebidas'],
            ['Pudim de Leite', 10, 'Fatia generosa, feito na casa.', 'Sobremesas'],
        ],
        services: [
            ['Reserva de Mesa (até 6 pessoas)', 0, 'Reserve a mesa para o seu grupo. Chegue até 15 min depois do horário.', 120, 'Reservas'],
            ['Espetinho para Festa (por pessoa)', 45, 'Churrasqueiro e espetos à vontade no seu evento. Mínimo 20 pessoas.', 240, 'Eventos'],
        ],
        pubs: [
            ['Quarta do Espeto em Dobro', 'Toda quarta: pediu um espeto de carne, ganha outro de frango.'],
            ['Chegou o espeto de tambaqui', 'Peixe da região na brasa. Peça já!'],
        ],
    },
]

if (!NO_IMAGES) {
    console.log('Gerando logos...')
    for (const s of STORES) await upload('store-logos', `admin-${s.slug}.png`, await sharp(Buffer.from(badgeSvg(s.key === 'clinica' ? 'VP' : 'EA', s.colors, 512))).png().toBuffer(), 'image/png')
}
await upsert('stores', STORES.map((s) => ({
    name: s.name, storeSlug: s.slug, owner_id: ME, is_active: true, category: s.category, description: s.description,
    address: s.address, store_lat: s.lat, store_lng: s.lng, location: `SRID=4326;POINT(${s.lng} ${s.lat})`, chat_enabled: true, show_whatsapp: false,
    accepts_delivery: s.delivery, accepts_pickup: true, accepts_pix: true, accepts_card: true, accepts_cash: true, delivery_type: 'fixed', delivery_fee: s.delivery ? 7 : 0,
    allow_scheduling: s.scheduling, business_hours: { weekly: s.hours }, logo_url: `admin-${s.slug}.png`, store_model: s.model,
    pix_key: `${s.slug}@staging.iuser.test`, pix_key_type: 'email',
    ...(s.key === 'clinica' ? { deposit_mode: 'percent', deposit_value: 30, deposit_policy: 'Cancelamentos com até 24 h de antecedência têm a entrada devolvida.' } : { deposit_mode: 'none', deposit_value: 0, deposit_policy: null }),
})), 'storeSlug')
const stores = await api('GET', `/rest/v1/stores?select=id,storeSlug&storeSlug=in.(${STORES.map((s) => s.slug).join(',')})`)
for (const s of STORES) s.id = stores.find((x) => x.storeSlug === s.slug).id
// o Entregador do iUser no espetinho (o banco ajusta o frete pela Tarifa iUser)
try { await api('PATCH', `/rest/v1/stores?id=eq.${STORES[1].id}`, { iuser_delivery_enabled: true }, { Prefer: 'return=minimal' }) } catch (e) { console.warn('Entregador do iUser não ligado:', e.message.slice(0, 160)) }

const rows = []
for (const s of STORES) {
    const add = (name, price, desc, type, dur, category, listing = 'sale') => {
        const slug = `${slugify(name)}-${s.key}`
        rows.push({
            id: uid(`${s.key}:${listing}:${name}`), name, slug, description: desc, price, type, price_type: 'fixed', listing_type: listing, is_active: true,
            image_url: `admin-${slug}.jpg`, store_id: s.id, owner_id: ME, duration_minutes: dur ?? 60, category: category || null,
            show_chat: true, show_whatsapp: false, view_count: 20 + (hash(slug) % 400),
        })
    }
    s.products.forEach(([n, p, d, c]) => add(n, p, d, 'physical', null, c))
    s.services.forEach(([n, p, d, dur, c]) => add(n, p, d, 'service', dur, c))
    s.pubs.forEach(([t, d]) => add(t, 0, d, 'physical', null, null, 'publication'))
}
if (!NO_IMAGES) {
    console.log(`Gerando ${rows.length} imagens...`)
    for (const row of rows) {
        const s = STORES.find((x) => x.id === row.store_id)
        const sub = row.listing_type === 'publication' ? `Publicação · ${s.name}` : row.type === 'service' ? `Serviço · ${s.name}` : s.name
        await upload('product-images', row.image_url, await sharp(Buffer.from(cardSvg(row.name, sub, s.colors, row.slug))).jpeg({ quality: 80 }).toBuffer(), 'image/jpeg')
    }
}
for (let i = 0; i < rows.length; i += 50) await upsert('products', rows.slice(i, i + 50), 'id')
console.log(`Lojas: ${STORES.map((s) => `/${s.slug}`).join(' e ')} · ${rows.length} itens (produtos, serviços e publicações)`)

// ===================== VEÍCULOS (carro, moto e bicicleta) =====================
const VEHICLES = [
    { kind: 'carro', model: 'Honda Fit', color: 'Prata', plate: 'ADM-1A23', colors: ['#64748b', '#1e293b'], seats: 4, baby: true, services: ['ar_condicionado', 'wifi', 'carregador', 'som', 'pet_friendly'], bags: [6, 3, 2], cases: [2, 1, 1] },
    { kind: 'moto', model: 'Honda CG 160', color: 'Vermelha', plate: 'ADM-2B34', colors: ['#dc2626', '#7f1d1d'], seats: 1, baby: null, services: [], bags: [1, 0, 0], cases: [0, 0, 0] },
    { kind: 'bicicleta', model: 'Caloi Elite', color: 'Azul', plate: null, colors: ['#2563eb', '#1e3a8a'], seats: 1, baby: null, services: [], bags: [1, 0, 0], cases: [0, 0, 0] },
]
if (!NO_IMAGES) {
    console.log('Gerando fotos dos veículos e a selfie...')
    await upload('driver-selfie-photos', `${ME}/admin-selfie.png`, await sharp(Buffer.from(badgeSvg('AT', ['#f97316', '#c2410c'], 512))).png().toBuffer(), 'image/png')
    for (const v of VEHICLES) await upload('driver-car-photos', `${ME}/admin-${v.kind}.jpg`, await sharp(Buffer.from(cardSvg(v.model, `${v.color}${v.plate ? ` · ${v.plate}` : ''}`, v.colors, v.kind))).jpeg({ quality: 80 }).toBuffer(), 'image/jpeg')
}
await upsert('driver_vehicles', VEHICLES.map((v) => ({
    driver_id: ME, vehicle_kind: v.kind, car_model: v.model, car_color: v.color, car_plate: v.plate, car_photo_url: `${ME}/admin-${v.kind}.jpg`,
    driver_photo_url: `${ME}/admin-selfie.png`, passenger_capacity: v.seats, has_baby_seat: v.baby, services: v.services,
    trunk_bags_pequena: v.bags[0], trunk_bags_media: v.bags[1], trunk_bags_grande: v.bags[2],
    trunk_suitcases_pequena: v.cases[0], trunk_suitcases_media: v.cases[1], trunk_suitcases_grande: v.cases[2],
    delivery_capacity: v.kind === 'moto' ? 4 : v.kind === 'bicicleta' ? 2 : 3,
})), 'driver_id,vehicle_kind')
// tarifa: começa na Tarifa iUser (o admin muda pelo app para testar por km e por tempo); modo motorista desligado
await upsert('driver_pricing', [{ driver_id: ME, pricing_mode: 'platform', driver_mode_active: false }], 'driver_id')
const vs = await api('GET', `/rest/v1/driver_vehicles?select=vehicle_kind,vehicle_slug&driver_id=eq.${ME}`)
console.log('Veículos:', vs.map((v) => `${v.vehicle_kind} /${v.vehicle_slug}`).join(' · '))
console.log('Pronto. Entre no staging como admin-teste.')
