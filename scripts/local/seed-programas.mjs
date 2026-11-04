// PROGRAMAS E APLICATIVOS de teste na Pizzaria Forno de Ouro (conta admin-teste, banco LOCAL): um app GRÁTIS em 3 plataformas com 2 versões no Windows (Cronômetro do Forno)
// e um programa PAGO com uma versão de demonstração (Calculadora de Custos Pro). Os "instaladores" são arquivos FALSOS (um texto de teste + bytes aleatórios): servem só para ver a
// plataforma funcionando — baixar, versões, SHA-256, atualizações e contador. Vão para o bucket PRIVADO digital-files.
//   node scripts/local/seed-programas.mjs        (idempotente)
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
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-programas:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
const fake = (label, kb) => Buffer.concat([Buffer.from(`ARQUIVO FALSO DE TESTE DO iUSER — ${label} — não é um programa de verdade.\n`), crypto.randomBytes(kb * 1024)])
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString()

const [admin] = await api('GET', `/rest/v1/profiles?select=id&%22profileSlug%22=eq.admin-teste&limit=1`)
if (!admin) throw new Error('Perfil admin-teste não encontrado no banco local')
const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.pizzaria-forno-de-ouro`)
if (!store) throw new Error('Pizzaria não encontrada: rode scripts/local/seed-pizzaria.mjs antes')

const cover = (a, b, tag, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="1050" cy="140" r="260" fill="#fff" opacity=".1"/><rect x="64" y="60" width="${tag.length * 20 + 44}" height="48" rx="24" fill="#000" opacity=".28"/><text x="86" y="93" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#fff">${tag}</text><text x="64" y="620" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="800" fill="#fff">${title}</text><text x="64" y="684" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#fff" opacity=".9">Pizzaria Forno de Ouro</text></svg>`

const PRODUCTS = [
    { id: uid('cronometro'), slug: 'cronometro-do-forno-app', name: 'Cronômetro do Forno (app grátis)', price: 0, colors: ['#0f766e', '#22c55e'], tag: 'APP · GRÁTIS', title: 'Cronômetro do Forno', views: 410,
      desc: 'Um cronômetro simples de cozinha com alarme por etapa (massa, forno, descanso). Grátis, para celular e computador.',
      files: [
          { name: 'cronometro-1.2.apk', platform: 'android', version: '1.2', notes: 'Alarme por etapa e modo escuro.', kb: 80, age: 2 },
          { name: 'cronometro-setup-1.2.exe', platform: 'windows', version: '1.2', notes: 'Alarme por etapa e modo escuro. Corrige um travamento ao minimizar.', kb: 120, age: 2 },
          { name: 'cronometro-setup-1.1.exe', platform: 'windows', version: '1.1', notes: 'Primeira versão pública.', kb: 110, age: 30 },
          { name: 'cronometro-1.0.dmg', platform: 'macos', version: '1.0', notes: null, kb: 140, age: 15 },
      ] },
    { id: uid('calculadora'), slug: 'calculadora-de-custos-pro', name: 'Calculadora de Custos Pro (programa)', price: 39.9, colors: ['#1e3a8a', '#6366f1'], tag: 'PROGRAMA', title: 'Calculadora de Custos Pro', views: 220,
      desc: 'Calcule o custo de cada pizza e o preço de venda ideal. Versão de demonstração grátis; a completa é para quem compra, com todas as atualizações.',
      files: [
          { name: 'calculadora-pro-2.0.msi', platform: 'windows', version: '2.0', notes: 'Cadastro de fornecedores e relatório mensal em PDF.', kb: 200, age: 3 },
          { name: 'calculadora-demo-1.0.msi', platform: 'windows', version: '1.0 (demonstração)', notes: 'Versão limitada a 5 receitas.', kb: 90, age: 40, demo: true },
      ] },
]

for (const p of PRODUCTS) await api('DELETE', `/rest/v1/products?id=eq.${p.id}`, undefined, { Prefer: 'return=minimal' })
for (const p of PRODUCTS) await upload('product-images', `programa-${p.slug}.jpg`, await sharp(Buffer.from(cover(p.colors[0], p.colors[1], p.tag, p.title))).jpeg({ quality: 82 }).toBuffer(), 'image/jpeg')
await api('POST', '/rest/v1/products', PRODUCTS.map((p) => ({
    id: p.id, name: p.name, slug: p.slug, description: p.desc, price: p.price, type: 'digital', price_type: 'fixed', listing_type: 'sale', is_active: true, category: 'Programas', has_addons: false,
    image_url: `programa-${p.slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: p.views, show_chat: false, show_whatsapp: false, duration_minutes: 5,
})), { Prefer: 'return=minimal' })
await api('POST', '/rest/v1/digital_rights', PRODUCTS.map((p) => ({ product_id: p.id, owner_id: admin.id })), { Prefer: 'resolution=merge-duplicates,return=minimal' })

const rows = []
let pos = 0
for (const p of PRODUCTS) for (const f of p.files) {
    const buf = fake(`${p.name} ${f.version}`, f.kb), sp = `${admin.id}/${p.id}/${Date.now()}-${f.name}`
    await upload('digital-files', sp, buf, 'application/octet-stream')
    rows.push({ product_id: p.id, owner_id: admin.id, title: `${f.version} · ${f.name}`.slice(0, 140), kind: 'app', storage_path: sp, mime_type: 'application/octet-stream', size_bytes: buf.length,
        platform: f.platform, version: f.version, release_notes: f.notes, sha256: crypto.createHash('sha256').update(buf).digest('hex'), position: pos++, is_preview: !!f.demo, created_at: daysAgo(f.age) })
}
await api('POST', '/rest/v1/digital_contents', rows, { Prefer: 'return=minimal' })
console.log(`ok: ${PRODUCTS.length} programas em /pizzaria-forno-de-ouro (${PRODUCTS.map((p) => p.slug).join(', ')})`)
