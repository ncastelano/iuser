// MÚSICA de teste na Pizzaria Forno de Ouro (conta admin-teste, banco LOCAL): um ÁLBUM GRÁTIS (3 faixas) e um SINGLE PAGO com prévia de 25 s — para ver a Fase 1 do digital funcionando
// (pegar grátis, player de música, prévia, declaração de autoria). Os áudios são tons gerados aqui em WAV (nada de música de verdade); vão para o bucket PRIVADO digital-files.
//   node scripts/local/seed-musica.mjs        (idempotente)
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
async function upload(bucket, objectPath, buf, contentType) {
    const r = await fetch(`${API}/storage/v1/object/${bucket}/${objectPath}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: buf })
    if (!r.ok) throw new Error(`upload ${bucket}/${objectPath} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-musica:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }

/** WAV mono 16 bits com uma melodia simples (notas em sequência, com um fade para não estalar) */
function wav(seconds, notes, rate = 22050) {
    const n = Math.floor(seconds * rate), data = Buffer.alloc(n * 2), per = Math.floor(rate * 0.45)
    for (let i = 0; i < n; i++) {
        const f = notes[Math.floor(i / per) % notes.length], t = (i % per) / per, env = Math.min(1, t * 12) * Math.min(1, (1 - t) * 6)
        data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f * (i / rate)) * 0.35 * env * 32767), i * 2)
    }
    const h = Buffer.alloc(44)
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
    return Buffer.concat([h, data])
}
const C = (f) => f   // só para ler melhor as notas
const SCALE = { a: [C(261.6), C(329.6), C(392), C(329.6)], b: [C(293.7), C(349.2), C(440), C(349.2)], c: [C(329.6), C(392), C(493.9), C(392)], d: [C(220), C(277.2), C(329.6), C(277.2)] }

const [admin] = await api('GET', `/rest/v1/profiles?select=id&%22profileSlug%22=eq.admin-teste&limit=1`)
if (!admin) throw new Error('Perfil admin-teste não encontrado no banco local')
const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.pizzaria-forno-de-ouro`)
if (!store) throw new Error('Pizzaria não encontrada: rode scripts/local/seed-pizzaria.mjs antes')

const cover = (a, b, tag, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1000" height="1000" fill="url(#g)"/><circle cx="780" cy="220" r="260" fill="#fff" opacity=".12"/><circle cx="200" cy="820" r="220" fill="#000" opacity=".12"/><text x="70" y="120" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" opacity=".9">${tag}</text><text x="70" y="860" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="800" fill="#fff">${title}</text><text x="70" y="930" font-family="Helvetica, Arial, sans-serif" font-size="38" fill="#fff" opacity=".9">Pizzaria Forno de Ouro</text></svg>`

const PRODUCTS = [
    { id: uid('album'), slug: 'trilha-do-forno-album', name: 'Trilha do Forno (álbum grátis)', price: 0, colors: ['#7c2d12', '#f59e0b'], tag: 'ÁLBUM · GRÁTIS', title: 'Trilha do Forno', views: 320,
      desc: 'A trilha que toca na pizzaria, de graça: 3 faixas para fazer a massa ao som do forno.',
      tracks: [{ title: 'Massa ao amanhecer', seconds: 40, notes: SCALE.a }, { title: 'Forno aceso', seconds: 35, notes: SCALE.b }, { title: 'Última fornada', seconds: 45, notes: SCALE.c }] },
    { id: uid('single'), slug: 'noite-de-verao-single', name: 'Noite de Verão (single)', price: 4.9, colors: ['#1e3a8a', '#7c3aed'], tag: 'SINGLE', title: 'Noite de Verão', views: 150,
      desc: 'O single da pizzaria. Ouça a prévia de 25 segundos e compre para ter a música inteira na sua biblioteca.',
      tracks: [{ title: 'Noite de Verão', seconds: 60, notes: SCALE.d }], teaser: { seconds: 25, notes: SCALE.d } },
]

for (const p of PRODUCTS) await api('DELETE', `/rest/v1/products?id=eq.${p.id}`, undefined, { Prefer: 'return=minimal' })
for (const p of PRODUCTS) {
    await upload('product-images', `musica-${p.slug}.jpg`, await sharp(Buffer.from(cover(p.colors[0], p.colors[1], p.tag, p.title))).jpeg({ quality: 82 }).toBuffer(), 'image/jpeg')
}
await api('POST', '/rest/v1/products', PRODUCTS.map((p) => ({
    id: p.id, name: p.name, slug: p.slug, description: p.desc, price: p.price, type: 'digital', price_type: 'fixed', listing_type: 'sale', is_active: true, category: 'Músicas', has_addons: false,
    image_url: `musica-${p.slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: p.views, show_chat: false, show_whatsapp: false, duration_minutes: 5,
})), { Prefer: 'return=minimal' })
await api('POST', '/rest/v1/digital_rights', PRODUCTS.map((p) => ({ product_id: p.id, owner_id: admin.id })), { Prefer: 'resolution=merge-duplicates,return=minimal' })

const rows = []
for (const p of PRODUCTS) {
    let pos = 0
    for (const t of p.tracks) {
        const buf = wav(t.seconds, t.notes), sp = `${admin.id}/${p.id}/${Date.now()}-faixa-${pos + 1}.wav`
        await upload('digital-files', sp, buf, 'audio/wav')
        rows.push({ product_id: p.id, owner_id: admin.id, title: t.title, kind: 'audio', storage_path: sp, mime_type: 'audio/wav', size_bytes: buf.length, duration_seconds: t.seconds, position: pos++, is_preview: false, is_teaser: false })
    }
    if (p.teaser) {
        const buf = wav(p.teaser.seconds, p.teaser.notes), sp = `${admin.id}/${p.id}/${Date.now()}-previa.wav`
        await upload('digital-files', sp, buf, 'audio/wav')
        rows.push({ product_id: p.id, owner_id: admin.id, title: 'Prévia', kind: 'audio', storage_path: sp, mime_type: 'audio/wav', size_bytes: buf.length, duration_seconds: p.teaser.seconds, position: 0, is_preview: false, is_teaser: true })
    }
}
await api('POST', '/rest/v1/digital_contents', rows, { Prefer: 'return=minimal' })
console.log(`ok: ${PRODUCTS.length} produtos de música em /pizzaria-forno-de-ouro (${PRODUCTS.map((p) => p.slug).join(', ')})`)
