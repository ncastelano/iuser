// PROMOÇÕES de teste (banco LOCAL): dá o "de/por" aos combos antigos da Pizzaria Forno de Ouro (que traziam "De R$ X por R$ Y." só no texto) e cria COMBOS de verdade — itens
// da própria loja, soma e desconto — na pizzaria e em mais algumas lojas, para a seção horizontal do catálogo e a vitrine da home terem o que mostrar.
//   node scripts/local/seed-promocoes.mjs        (idempotente: refaz os combos "seed" sem duplicar)
// Só o banco LOCAL (recusa qualquer outro). Usa o service role (o app comum só cria combo pela função save_store_combo).
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

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
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const money = (n) => Math.round(n * 100) / 100

// ---- 1) combos antigos da pizzaria: "De R$ X por R$ Y." vira compare_at_price
const legacy = await api('GET', `/rest/v1/products?select=id,price,description&category=ilike.Promo*&is_combo=eq.false&compare_at_price=is.null`)
let patched = 0
for (const p of legacy) {
    const m = (p.description || '').match(/^\s*De\s+R\$\s*([\d.]+,\d{2})\s+por/i)
    if (!m) continue
    const old = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
    if (old > Number(p.price)) { await api('PATCH', `/rest/v1/products?id=eq.${p.id}`, { compare_at_price: old }); patched++ }
}
console.log(`combos antigos com "de/por": ${patched}`)

// ---- 2) combos de verdade (apaga os "seed" anteriores e refaz)
const old = await api('GET', `/rest/v1/products?select=id&is_combo=eq.true&slug=like.combo-seed-*`)
for (const o of old) await api('DELETE', `/rest/v1/products?id=eq.${o.id}`)

// loja → combos: cada combo é uma lista de [posição do item na lista de mais caros, quantidade] + % de desconto + nome
const PLANS = {
    'pizzaria-forno-de-ouro': [
        { name: 'Combo Calabresa + Guaraná', pick: [['Pizza Calabresa', 1], ['Guaraná Antarctica 2 L', 1]], pct: 18 },
        { name: 'Dupla de Pizzas + Refri', pick: [['Pizza Margherita', 1], ['Pizza Mussarela', 1], ['Guaraná Antarctica 2 L', 1]], pct: 22 },
        { name: 'Festa das Latinhas', pick: [['Coca-Cola lata', 4], ['Anel de cebola', 1]], pct: 15 },
    ],
    '24h-farmacia-plantao': [{ name: 'Kit Cuidado do Dia', pick: [[null, 1], [null, 1], [null, 2]], pct: 20 }],
    '24h-posto-centro': [{ name: 'Combo Estrada', pick: [[null, 2], [null, 1]], pct: 15 }],
    'pet-amigo': [{ name: 'Kit Banho e Carinho', pick: [[null, 1], [null, 2]], pct: 25 }],
}

let made = 0
for (const [slug, plans] of Object.entries(PLANS)) {
    const [store] = await api('GET', `/rest/v1/stores?select=id,owner_id&storeSlug=eq.${slug}`)
    if (!store) { console.log(`loja ${slug} não existe — pulei`); continue }
    const items = await api('GET', `/rest/v1/products?select=id,name,price,image_url,delivery_units&store_id=eq.${store.id}&type=eq.physical&listing_type=eq.sale&is_combo=eq.false&is_active=eq.true&order=price.desc&limit=40`)
    let n = 0
    for (const plan of plans) {
        const chosen = []
        const used = new Set()
        for (const [needle, q] of plan.pick) {
            const it = needle ? items.find((i) => i.name.toLowerCase().includes(needle.toLowerCase()) && !used.has(i.id)) : items.filter((i) => !used.has(i.id)).sort((a, b) => a.price - b.price)[Math.min(3 + chosen.length * 2, items.length - 1)]
            if (it) { used.add(it.id); chosen.push({ it, q }) }
        }
        if (chosen.length === 0) continue
        const total = money(chosen.reduce((s, c) => s + Number(c.it.price) * c.q, 0))
        const price = money(total * (1 - plan.pct / 100))
        const desc = 'Inclui: ' + chosen.map((c) => `${c.q}× ${c.it.name}`).join(' · ')
        const units = Math.min(50, Math.max(0.25, chosen.reduce((s, c) => s + Number(c.it.delivery_units || 1) * c.q, 0)))
        const [combo] = await api('POST', '/rest/v1/products', {
            name: plan.name, slug: `combo-seed-${slugify(plan.name)}-${crypto.randomBytes(2).toString('hex')}`, description: desc, price, type: 'physical', is_active: true,
            image_url: chosen.find((c) => c.it.image_url)?.it.image_url ?? null, store_id: store.id, owner_id: store.owner_id, price_type: 'fixed', category: 'Promoções', listing_type: 'sale',
            has_addons: false, delivery_units: units, is_combo: true, compare_at_price: total,
        }, { Prefer: 'return=representation' })
        await api('POST', '/rest/v1/product_bundle_items', chosen.map((c) => ({ combo_id: combo.id, item_id: c.it.id, quantity: c.q })))
        n++; made++
    }
    console.log(`${slug}: ${n} combo(s)`)
}
console.log(`pronto: ${made} combos criados`)
