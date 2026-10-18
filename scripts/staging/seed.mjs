// Dados FICTÍCIOS para o staging: algumas pessoas, uma loja com produtos, um motorista, seguidores.
// Só roda se o banco de destino NÃO for o de produção. Lê as credenciais de .env.staging.local (não versionado):
//   STAGING_SUPABASE_URL=https://<ref-do-staging>.supabase.co
//   STAGING_SUPABASE_SERVICE_ROLE_KEY=...
//   STAGING_TEST_PASSWORD=...   (a senha de TODAS as contas de teste; escolha uma qualquer, é só do staging)
// Uso: node scripts/staging/seed.mjs
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
const upsert = (table, rows, onConflict) => api('POST', `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, rows, { Prefer: 'resolution=merge-duplicates,return=representation' })

async function ensureUser(email, name) {
    const list = await api('GET', `/auth/v1/admin/users?per_page=200`)
    const found = (list.users || []).find((u) => u.email === email)
    if (found) return found.id
    const u = await api('POST', '/auth/v1/admin/users', { email, password: PASSWORD, email_confirm: true, user_metadata: { name } })
    return u.id
}

const PEOPLE = [
    // o admin do iUser é reconhecido pelo e-mail dentro de várias funções do banco: aqui ele também é ncastelano@gmail.com
    // (só no banco de teste; a senha é a do STAGING_TEST_PASSWORD)
    { key: 'admin', email: 'ncastelano@gmail.com', name: 'Admin Teste', slug: 'admin-teste' },
    { key: 'cliente', email: 'cliente@staging.iuser.test', name: 'Cliente Teste', slug: 'cliente-teste' },
    { key: 'lojista', email: 'lojista@staging.iuser.test', name: 'Lojista Teste', slug: 'lojista-teste' },
    { key: 'motorista', email: 'motorista@staging.iuser.test', name: 'Motorista Teste', slug: 'motorista-teste' },
    { key: 'prestador', email: 'prestador@staging.iuser.test', name: 'Prestador Teste', slug: 'prestador-teste' },
    { key: 'indicado', email: 'indicado@staging.iuser.test', name: 'Indicado Teste', slug: 'indicado-teste' },
]

const ids = {}
for (const p of PEOPLE) ids[p.key] = await ensureUser(p.email, p.name)
console.log('Contas criadas:', Object.keys(ids).join(', '))

await upsert('profiles', PEOPLE.map((p) => ({
    id: ids[p.key], name: p.name, profileSlug: p.slug, email: p.email, is_active: true,
    // "indicado" entra pelo convite do cliente (para testar graduação/pontos sem mexer em ninguém real)
    upline_id: p.key === 'indicado' ? ids.cliente : null,
    address: p.key === 'cliente' ? 'Rua Teste, 100, Centro, Porto Velho - RO, 76801-000, Brasil' : null,
    store_lat: p.key === 'cliente' ? -8.7612 : null, store_lng: p.key === 'cliente' ? -63.9004 : null,
})), 'id')

const [store] = await upsert('stores', [{
    name: 'Loja de Teste', storeSlug: 'loja-teste', owner_id: ids.lojista, is_active: true, category: 'Alimentação',
    description: 'Loja fictícia do ambiente de teste', accepts_delivery: true, accepts_pickup: true, accepts_pix: true, accepts_card: true,
    address: 'Av. Teste, 200, Centro, Porto Velho - RO, 76801-000, Brasil', store_lat: -8.7619, store_lng: -63.9039,
    pix_key: 'loja@staging.iuser.test', pix_key_type: 'email', whatsapp: '5569999990001', show_whatsapp: true,
}], 'storeSlug')

const products = [
    { name: 'Produto Teste 1', slug: 'produto-teste-1', price: 10, type: 'physical', store_id: store.id, owner_id: ids.lojista, listing_type: 'sale', is_active: true },
    { name: 'Produto Teste 2', slug: 'produto-teste-2', price: 25.5, type: 'physical', store_id: store.id, owner_id: ids.lojista, listing_type: 'sale', is_active: true },
    { name: 'Serviço de Teste', slug: 'servico-de-teste', price: 80, type: 'service', owner_id: ids.prestador, listing_type: 'service_offer', is_active: true },
]
// products não tem unicidade só por slug: confere se já existe antes de inserir
for (const p of products) {
    const exists = await api('GET', `/rest/v1/products?select=id&slug=eq.${p.slug}`)
    if (exists.length === 0) await api('POST', '/rest/v1/products', [p]).catch((e) => console.warn('produto:', p.slug, e.message))
}

await upsert('driver_pricing', [{ driver_id: ids.motorista, pricing_mode: 'platform', driver_mode_active: true }], 'driver_id').catch((e) => console.warn('driver_pricing:', e.message))
await upsert('driver_vehicles', [{ driver_id: ids.motorista, vehicle_kind: 'moto', services: ['pessoa', 'objeto'] }], 'driver_id,vehicle_kind').catch((e) => console.warn('driver_vehicles:', e.message))
await api('POST', '/rest/v1/follows', [{ follower_id: ids.cliente, following_id: ids.prestador }], { Prefer: 'resolution=ignore-duplicates' }).catch(() => {})

console.log(`Pronto. Entre no app de staging com qualquer e-mail acima e a senha do STAGING_TEST_PASSWORD. Loja: /loja-teste`)
