// "Ecossistema" de lojas FICTÍCIAS no staging: 8 lojas de segmentos diferentes (padaria, mecânica, psicologia, odontologia, salão,
// contabilidade, pet shop, elétrica), cada uma com produtos, serviços, publicações, ~120 clientes avaliando e seguindo, pedidos e
// agendamentos, e os donos comprando/agendando uns nos outros. A "Loja de Teste" (/loja-teste) é a mais badalada.
//   node scripts/staging/seed-ecosystem.mjs              (cria/atualiza tudo; pode rodar de novo sem duplicar)
//   node scripts/staging/seed-ecosystem.mjs --no-images  (não gera/envia imagens de novo)
// Só roda no STAGING (recusa a URL da produção). Credenciais em .env.staging.local, como o seed.mjs. Tudo é determinístico (mesmos ids,
// mesmas notas) e usa o service role: nenhuma regra do app é contornada para dado real, é só massa de teste.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { STORES, LINKS, FIRST, LAST, COMMENTS, PRAISE, REPLY_PEERS, THANKS, QA } from './ecosystem-data.mjs'

const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
const file = path.resolve(import.meta.dirname, '..', '..', '.env.staging.local')
const env = { ...(fs.existsSync(file) ? Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) : {}), ...process.env }
const URL_ = (env.STAGING_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = env.STAGING_TEST_PASSWORD
if (!URL_ || !KEY || !PASSWORD) { console.error('Faltam STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY e STAGING_TEST_PASSWORD em .env.staging.local'); process.exit(1) }
if (URL_.includes(PROD_REF)) { console.error('RECUSADO: essa URL é a da PRODUÇÃO.'); process.exit(1) }
const NO_IMAGES = process.argv.includes('--no-images')
const N_CUSTOMERS = 120

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function api(method, p, body, extra = {}) {
    const r = await fetch(`${URL_}${p}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text()
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 400)}`)
    return t ? JSON.parse(t) : null
}
const upsert = (table, rows, onConflict, prefer = 'resolution=merge-duplicates,return=minimal') =>
    rows.length ? api('POST', `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, rows, { Prefer: prefer }) : null
async function upsertBatched(table, rows, onConflict, prefer, size = 100) {
    for (let i = 0; i < rows.length; i += size) await upsert(table, rows.slice(i, i + size), onConflict, prefer)
}
async function pmap(items, n, fn) {
    const out = new Array(items.length)
    let i = 0
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
    return out
}

// ---------- utilidades determinísticas ----------
const uid = (key) => {
    const h = crypto.createHash('sha1').update(`iuser-eco:${key}`).digest('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
function rng(seed) {   // mulberry32
    let a = crypto.createHash('sha1').update(String(seed)).digest().readUInt32LE(0)
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const daysAgo = (n, r = null) => new Date(Date.now() - (n + (r ? r() : 0)) * 86400000).toISOString()
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---------- imagens geradas (sem baixar nada) ----------
async function upload(bucket, objectPath, buf, contentType) {
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${objectPath}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: buf })
    if (!r.ok) throw new Error(`upload ${bucket}/${objectPath} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const FONT = 'Helvetica, Arial, sans-serif'
function wrap(text, max) {
    const words = text.split(' ')
    const lines = []
    let cur = ''
    for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() }
    if (cur) lines.push(cur)
    return lines.slice(0, 3)
}
const hash = (s) => crypto.createHash('sha1').update(s).digest().readUInt32LE(0)
function cardSvg(title, sub, [c1, c2], seed, size = 640) {
    const h = hash(seed)
    const lines = wrap(title, 16)
    const fs_ = lines.length > 2 ? 46 : 54
    const baseY = size - 150 - (lines.length - 1) * (fs_ + 8)
    const tspans = lines.map((l, i) => `<text x="48" y="${baseY + i * (fs_ + 8)}" font-family="${FONT}" font-size="${fs_}" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')
    const cx = 120 + (h % 380), cy = 90 + ((h >> 8) % 150), r1 = 110 + ((h >> 16) % 80)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="${(h % 2)}" y1="0" x2="${1 - (h % 2)}" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="${size}" height="${size}" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="${r1}" fill="#fff" fill-opacity=".13"/><circle cx="${size - cx / 2}" cy="${size - 60}" r="${r1 / 2}" fill="#000" fill-opacity=".10"/>
${tspans}<text x="48" y="${size - 62}" font-family="${FONT}" font-size="26" fill="#fff" fill-opacity=".85">${esc(sub)}</text></svg>`
}
const initials = (name) => name.split(' ').filter((w) => /^[A-Za-zÀ-ú]/.test(w) && !/^(Dra?\.|de|da|do)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
function badgeSvg(name, [c1, c2], size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><text x="50%" y="${size * 0.62}" text-anchor="middle" font-family="${FONT}" font-size="${size * 0.42}" font-weight="700" fill="#fff">${esc(initials(name))}</text></svg>`
}
const AVATAR_COLORS = [['#f97316', '#c2410c'], ['#3b82f6', '#1d4ed8'], ['#10b981', '#047857'], ['#a855f7', '#6d28d9'], ['#ec4899', '#be185d'], ['#eab308', '#a16207'], ['#06b6d4', '#0e7490'], ['#ef4444', '#b91c1c']]

// ---------- 1) pessoas ----------
console.log('Alvo (STAGING):', URL_.replace('https://', '').split('.')[0])
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

const customers = Array.from({ length: N_CUSTOMERS }, (_, i) => {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`
    return { key: `c${i}`, name, slug: `${slugify(name)}-${i + 1}`, email: `cliente-${String(i + 1).padStart(3, '0')}@staging.iuser.test` }
})
const owners = STORES.map((s) => ({ ...s.owner, key: s.key }))
console.log(`Criando contas (${owners.length} donos + ${customers.length} clientes)...`)
const lojistaId = await ensureUser(owners[0].email, owners[0].name)
await pmap([...owners, ...customers], 6, async (p) => { p.id = await ensureUser(p.email, p.name) })

const people = [...owners, ...customers]
if (!NO_IMAGES) {
    console.log('Gerando avatares...')
    await pmap(people, 6, async (p, i) => {
        const buf = await sharp(Buffer.from(badgeSvg(p.name, AVATAR_COLORS[hash(p.slug) % AVATAR_COLORS.length], 256))).png().toBuffer()
        await upload('avatars', `eco-${p.slug}.png`, buf, 'image/png')
    })
}
const ownerBio = { padaria: 'Dona da padaria mais querida de Porto Velho.' }
await upsertBatched('profiles', people.map((p) => ({
    id: p.id, name: p.name, profileSlug: p.slug, email: p.email, is_active: true, avatar_url: `eco-${p.slug}.png`,
    description: p.existing ? ownerBio.padaria : null,
})), 'id')
// o dono da padaria mantém o nome do seed original; só os demais ganham nome "de gente"
await api('PATCH', `/rest/v1/profiles?id=eq.${lojistaId}`, { avatar_url: 'eco-lojista-teste.png' }, { Prefer: 'return=minimal' })
const byKey = Object.fromEntries(owners.map((o) => [o.key, o]))

// ---------- 2) lojas, assinatura, logos ----------
const sub = await api('GET', `/rest/v1/subscriptions?select=plan_id&user_id=eq.${lojistaId}&limit=1`)
const planId = sub[0]?.plan_id
if (!planId) throw new Error('A conta do lojista não tem assinatura de loja de referência (rode seed.mjs/seed de assinatura antes).')
for (const o of owners) {
    const has = await api('GET', `/rest/v1/subscriptions?select=id&user_id=eq.${o.id}&limit=1`)
    if (!has.length) await api('POST', '/rest/v1/subscriptions', [{ user_id: o.id, plan_id: planId, status: 'active', source: 'admin_grant', starts_at: new Date().toISOString(), current_period_end: new Date(Date.now() + 120 * 86400000).toISOString() }], { Prefer: 'return=minimal' })
}
if (!NO_IMAGES) {
    console.log('Gerando logos...')
    for (const s of STORES) await upload('store-logos', `eco-${s.slug}.png`, await sharp(Buffer.from(badgeSvg(s.name, s.colors, 512))).png().toBuffer(), 'image/png')
}
const storeRows = STORES.map((s) => {
    const r = rng(`store:${s.key}`)
    const flagship = s.key === 'padaria'
    return {
        name: s.name, storeSlug: s.slug, owner_id: byKey[s.key].id, is_active: true, category: s.category, description: s.description,
        address: s.address, store_lat: s.lat, store_lng: s.lng, whatsapp: s.whatsapp, show_whatsapp: true, chat_enabled: true,
        accepts_delivery: ['padaria', 'pet'].includes(s.key), accepts_pickup: true, accepts_pix: true, accepts_card: true, accepts_cash: true,
        delivery_type: 'fixed', delivery_fee: 8, allow_scheduling: s.scheduling, business_hours: { weekly: s.hours },
        logo_url: `eco-${s.slug}.png`, instagram: s.social.instagram ?? null, youtube: s.social.youtube ?? null, facebook: s.social.facebook ?? null, x: s.social.x ?? null,
        view_count: flagship ? 12840 : Math.floor(600 + r() * 4200), share_count: flagship ? 318 : Math.floor(10 + r() * 90),
        pix_key: `${s.slug}@staging.iuser.test`, pix_key_type: 'email',
    }
})
await upsert('stores', storeRows, 'storeSlug')
const stores = await api('GET', `/rest/v1/stores?select=id,storeSlug&storeSlug=in.(${STORES.map((s) => s.slug).join(',')})`)
for (const s of STORES) s.id = stores.find((x) => x.storeSlug === s.slug).id

// ---------- 3) produtos, serviços e publicações ----------
// "Produto Teste 1/2" (do seed.mjs) ficam de fora da loja badalada
await api('DELETE', `/rest/v1/products?slug=in.(produto-teste-1,produto-teste-2)&store_id=eq.${STORES[0].id}`, undefined, { Prefer: 'return=minimal' })
const productRows = []
const pubRows = []
const usedSlugs = new Set()
const uniqueSlug = (base) => { let s = base, n = 2; while (usedSlugs.has(s)) s = `${base}-${n++}`; usedSlugs.add(s); return s }
for (const s of STORES) {
    const r = rng(`prod:${s.key}`)
    const ownerId = byKey[s.key].id
    s.items = []
    const add = (name, price, desc, type, dur, listing = 'sale', ageDays = null) => {
        const id = uid(`prod:${s.key}:${listing}:${name}`)
        const slug = uniqueSlug(slugify(name))
        const row = {
            id, name, slug, description: desc, price, type, price_type: 'fixed', listing_type: listing, is_active: true,
            image_url: `eco-${slug}.jpg`, store_id: s.id, owner_id: ownerId, duration_minutes: dur ?? 60,
            view_count: Math.floor(40 + r() * (s.key === 'padaria' ? 2400 : 600)), show_chat: type === 'service', show_whatsapp: true,
            created_at: daysAgo(ageDays ?? 20 + r() * 200),
        }
        productRows.push(row)
        s.items.push({ ...row, kind: listing })
        return row
    }
    s.products.forEach(([name, price, desc, kind]) => add(name, price, desc, kind === 'digital' ? 'digital' : 'physical'))
    s.services.forEach(([name, price, desc, dur]) => add(name, price, desc, 'service', dur))
    s.pubs.forEach(([title, text], i) => add(title, 0, text, 'physical', null, 'publication', 3 + i * 6 + r() * 4))
}
if (!NO_IMAGES) {
    console.log(`Gerando ${productRows.length} imagens de produto, serviço e publicação...`)
    await pmap(productRows, 6, async (row) => {
        const s = STORES.find((x) => x.id === row.store_id)
        const idx = s.items.findIndex((i) => i.id === row.id)
        const variant = [s.colors, [s.colors[1], s.colors[0]], [s.colors[0], '#111827']][idx % 3]
        const sub = row.listing_type === 'publication' ? `Publicação · ${s.name}` : row.type === 'service' ? `Serviço · ${s.name}` : s.name
        const buf = await sharp(Buffer.from(cardSvg(row.name, sub, variant, row.slug))).jpeg({ quality: 80 }).toBuffer()
        await upload('product-images', row.image_url, buf, 'image/jpeg')
    })
}
await upsertBatched('products', productRows, 'id')
for (const s of STORES) {
    s.goodsAndServices = s.items.filter((i) => i.kind === 'sale')
    s.pubItems = s.items.filter((i) => i.kind === 'publication')
}

// ---------- 4) avaliações (≥ 100 pessoas na loja badalada) ----------
const reviewerPool = (s) => [...customers, ...owners.filter((o) => o.key !== s.key)]
const WEIGHTS = { padaria: [64, 24, 8, 3, 1], mecanica: [58, 26, 9, 5, 2], psicologia: [78, 16, 4, 1, 1], odonto: [70, 22, 5, 2, 1], studio: [68, 22, 7, 2, 1], contabil: [62, 25, 9, 3, 1], pet: [66, 24, 7, 2, 1], eletrica: [60, 26, 9, 4, 1] }
function rating(r, w) { let x = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < 5; i++) { x -= w[i]; if (x < 0) return 5 - i } return 5 }
const reviewRows = []
for (const s of STORES) {
    const r = rng(`rev:${s.key}`)
    const pool = reviewerPool(s).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.p).slice(0, s.reviews)
    s.ratingSum = 0
    s.productRatings = new Map()
    for (const p of pool) {
        const stars = rating(r, WEIGHTS[s.key])
        const item = pick(r, s.goodsAndServices)
        let comment = null
        if (r() < 0.72) {
            const bucket = stars >= 4 ? COMMENTS.good : stars === 3 ? COMMENTS.ok : COMMENTS.bad
            comment = stars >= 4 && r() < 0.4 ? pick(r, COMMENTS.byStore[s.key]) : pick(r, bucket)
        }
        reviewRows.push({ id: uid(`rev:${s.key}:${p.id}`), store_id: s.id, product_id: item.id, profile_id: p.id, order_id: null, rating: stars, comment, is_anonymous: r() < 0.08, created_at: daysAgo(3 + r() * 300) })
        s.ratingSum += stars
        const pr = s.productRatings.get(item.id) || { sum: 0, n: 0 }
        pr.sum += stars; pr.n++
        s.productRatings.set(item.id, pr)
    }
    s.reviewCount = pool.length
}
// sem duplicar a rodada anterior: limpa as avaliações das lojas do ecossistema e recria
await api('DELETE', `/rest/v1/product_reviews?store_id=in.(${STORES.map((s) => s.id).join(',')})`, undefined, { Prefer: 'return=minimal' })
await upsertBatched('product_reviews', reviewRows, 'id')
// curtidas nas avaliações: avaliações boas e com texto são mais curtidas; poucas viralizam (a lista "mais curtidas" varia de verdade)
const reviewLikeRows = []
{
    const r = rng('reviewlikes')
    const pool = [...customers, ...owners]
    for (const rv of reviewRows) {
        const w = (rv.rating >= 4 ? 1 : 0.25) * (rv.comment ? 1 : 0.15)
        const n = Math.floor(Math.pow(r(), 3) * 26 * w)
        pool.filter((p) => p.id !== rv.profile_id).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).slice(0, n)
            .forEach(({ p }) => reviewLikeRows.push({ review_id: rv.id, profile_id: p.id, created_at: new Date(Math.min(Date.now() - 1000, new Date(rv.created_at).getTime() + (0.2 + r() * 200) * 3600000)).toISOString() }))
    }
}
await upsertBatched('product_review_likes', reviewLikeRows, 'review_id,profile_id', 'resolution=ignore-duplicates,return=minimal', 300)
for (const s of STORES) {
    await api('PATCH', `/rest/v1/stores?id=eq.${s.id}`, { ratings_avg: Math.round((s.ratingSum / s.reviewCount) * 10) / 10, ratings_count: s.reviewCount }, { Prefer: 'return=minimal' })
    for (const [pid, pr] of s.productRatings) await api('PATCH', `/rest/v1/products?id=eq.${pid}`, { ratings_avg: Math.round((pr.sum / pr.n) * 10) / 10, ratings_count: pr.n }, { Prefer: 'return=minimal' })
}

// ---------- 5) seguidores, curtidas e comentários ----------
const followRows = []
for (const s of STORES) {
    const r = rng(`fol:${s.key}`)
    const pool = reviewerPool(s).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.p)
    pool.slice(0, s.followers).forEach((p) => followRows.push({ follower_id: p.id, following_id: s.id, created_at: daysAgo(2 + r() * 280) }))
}
await upsertBatched('follows', followRows, 'follower_id,following_id', 'resolution=ignore-duplicates,return=minimal')
const likeRows = []
const commentRows = []
const commentLikeRows = []
// conversa de cada publicação: comentários, respostas e respostas de respostas (3 níveis), com curtidas nos comentários.
// A 1ª publicação da loja badalada passa de 100 comentários; as demais têm menos.
const THREAD_SIZE = (s, i) => (s.key === 'padaria' ? (i === 0 ? 118 : i < 4 ? 42 : 14) : 3 + (i % 3) * 3)
for (const s of STORES) {
    const r = rng(`likes:${s.key}`)
    const owner_ = byKey[s.key]
    s.pubItems.forEach((pub, pi) => {
        const pool = reviewerPool(s).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.p)
        const nLikes = s.key === 'padaria' ? 18 + Math.floor(r() * 70) : 4 + Math.floor(r() * 30)
        pool.slice(0, nLikes).forEach((p) => likeRows.push({ profile_id: p.id, publication_id: pub.id, created_at: new Date(new Date(pub.created_at).getTime() + (1 + r() * 5) * 3600000).toISOString() }))

        const total = THREAD_SIZE(s, pi)
        const t0 = new Date(pub.created_at).getTime()
        const when = (after, maxH) => new Date(Math.min(Date.now() - 60000, after + (0.2 + r() * maxH) * 3600000)).toISOString()
        const everyone = reviewerPool(s)
        const qa = QA[s.key]
        let n = 0
        const mk = (parent, author, content, created) => {
            const c = { id: uid(`com:${pub.id}:${n++}`), content, profile_id: author.id, comment_type: 'publication', publication_id: pub.id, parent_comment_id: parent ? parent.id : null, created_at: created, _depth: parent ? parent._depth + 1 : 0 }
            commentRows.push(c)
            return c
        }
        const tops = []
        const topCount = Math.round(total * 0.55)
        let qi = 0
        for (let i = 0; i < topCount; i++) {
            const asker = pick(r, everyone)
            if (i % 4 === 1 && qi < qa.length * 2) {   // pergunta com resposta do dono
                const [q, a] = qa[qi++ % qa.length]
                const top = mk(null, asker, q, when(t0, 30))
                tops.push(top)
                const ans = mk(top, owner_, a, when(new Date(top.created_at).getTime(), 6))
                if (r() < 0.7) mk(ans, asker, pick(r, THANKS), when(new Date(ans.created_at).getTime(), 8))
            } else {
                tops.push(mk(null, asker, pick(r, PRAISE), when(t0, 72)))
            }
        }
        // respostas entre clientes e do dono, até completar o total
        const pickable = () => commentRows.filter((c) => c.publication_id === pub.id)
        let guard = 0
        while (n < total && guard++ < total * 20) {
            const list = pickable()
            const parent = pick(r, list)
            if (parent._depth >= 2) continue
            const author = r() < 0.18 ? owner_ : pick(r, everyone)
            if (author.id === parent.profile_id && author.id !== owner_.id) continue
            const text = author.id === owner_.id ? pick(r, ['Obrigado pelo carinho! 💛', 'Esperamos você! 😊', 'Muito obrigado pelo comentário!', 'Ficamos felizes em saber 🙏']) : pick(r, REPLY_PEERS)
            mk(parent, author, text, when(new Date(parent.created_at).getTime(), 24))
        }
        // curtidas nos comentários: poucos viralizam, muitos têm 0–3
        const mine = commentRows.filter((c) => c.publication_id === pub.id)
        const cap = s.key === 'padaria' && pi === 0 ? 64 : 14
        for (const c of mine) {
            const base = Math.floor(Math.pow(r(), 3) * cap) + (c.profile_id === owner_.id ? 4 : 0)
            const likers = everyone.filter((p) => p.id !== c.profile_id).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).slice(0, base)
            likers.forEach(({ p }) => commentLikeRows.push({ profile_id: p.id, comment_id: c.id, created_at: new Date(Math.min(Date.now() - 1000, new Date(c.created_at).getTime() + (0.1 + r() * 20) * 3600000)).toISOString() }))
        }
    })
}
// recria as conversas das publicações do ecossistema (curtidas dos comentários saem junto, por cascata)
const pubIds = STORES.flatMap((s) => s.pubItems.map((p) => p.id))
for (let i = 0; i < pubIds.length; i += 20) await api('DELETE', `/rest/v1/comments?publication_id=in.(${pubIds.slice(i, i + 20).join(',')})`, undefined, { Prefer: 'return=minimal' })
await upsertBatched('likes', likeRows, 'profile_id,publication_id', 'resolution=ignore-duplicates,return=minimal', 300)
for (const depth of [0, 1, 2]) await upsertBatched('comments', commentRows.filter((c) => c._depth === depth).map(({ _depth, ...c }) => c), 'id')
await upsertBatched('comment_likes', commentLikeRows, 'profile_id,comment_id', 'resolution=ignore-duplicates,return=minimal', 300)

// ---------- 6) pedidos e agendamentos (clientes e donos entre si) ----------
const orderRows = []
const itemRows = []
const apptRows = []
const storeByKey = Object.fromEntries(STORES.map((s) => [s.key, s]))
const owner = (key) => byKey[key]
function addOrder(id, s, buyer, items, status, createdAt, r, delivery) {
    const total = items.reduce((a, it) => a + it.qty * Number(it.item.price), 0)
    const fee = delivery ? 8 : 0
    orderRows.push({
        id: uid(`ord:${id}`), store_id: s.id, buyer_id: buyer.id, buyer_name: buyer.name, buyer_profile_slug: buyer.slug, total_amount: Math.round((total + fee) * 100) / 100,
        delivery_fee: fee, delivery_option: delivery ? 'entrega' : 'retirada', payment_method: pick(r, ['pix', 'pix', 'cartao', 'dinheiro']), delivery_address: delivery ? `Rua das Palmeiras, ${100 + Math.floor(r() * 800)}, Porto Velho - RO` : null,
        status, checkout_id: uid(`chk:${id}`), created_at: createdAt, channel: 'web', delivery_flow_version: 1,
    })
    items.forEach((it, i) => itemRows.push({ id: uid(`oit:${id}:${i}`), order_id: uid(`ord:${id}`), product_id: it.item.id, product_name: it.item.name, quantity: it.qty, unit_price: it.item.price, total_price: Math.round(it.qty * Number(it.item.price) * 100) / 100, addons: [] }))
}
for (const s of STORES) {
    const r = rng(`ord:${s.key}`)
    const goods = s.goodsAndServices.filter((i) => i.type !== 'service')
    const pool = customers
    for (let i = 0; i < s.orders; i++) {
        const buyer = pick(r, pool)
        const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ item: pick(r, goods), qty: 1 + Math.floor(r() * 3) }))
        const x = r()
        const status = x < 0.84 ? 'paid' : x < 0.92 ? 'rejected' : 'pending'
        addOrder(`${s.key}:c${i}`, s, buyer, items, status, daysAgo(status === 'pending' ? r() * 2 : 1 + r() * 110), r, s.key === 'padaria' || s.key === 'pet' ? r() < 0.4 : false)
    }
}
LINKS.forEach((l, i) => {
    const r = rng(`link:${i}`)
    const s = storeByKey[l.store]
    const who = owner(l.who)
    if (l.order) {
        const items = l.order.map((n) => ({ item: s.goodsAndServices.find((it) => it.name === n), qty: 1 + Math.floor(r() * 2) }))
        if (items.some((it) => !it.item)) throw new Error(`LINKS[${i}]: produto não encontrado em ${l.store}: ${l.order}`)
        addOrder(`link:${i}`, s, who, items, 'paid', daysAgo(2 + r() * 50), r, false)
    } else {
        const svc = s.goodsAndServices.find((it) => it.name === l.booking)
        if (!svc) throw new Error(`LINKS[${i}]: serviço não encontrado em ${l.store}: ${l.booking}`)
        pushAppt(`link:${i}`, s, who, svc, l.status, l.daysAhead ? -l.daysAhead : l.daysAgo, r)
    }
})
function pushAppt(id, s, who, svc, status, ago, r) {
    const d = new Date(Date.now() - ago * 86400000)
    const hour = 9 + Math.floor(r() * 8)
    apptRows.push({
        id: uid(`apt:${id}`), store_id: s.id, store_slug: s.slug, store_name: s.name, store_logo_url: `eco-${s.slug}.png`, customer_id: who.id, customer_slug: who.slug,
        customer_avatar_url: `eco-${who.slug}.png`, owner_id: byKey[s.key].id, owner_slug: byKey[s.key].slug, date: d.toISOString().slice(0, 10), time: `${String(hour).padStart(2, '0')}:00:00`,
        duration_minutes: svc.duration_minutes, service_name: svc.name, service_type: 'service', people_count: 1, status, direction: 'outgoing', is_public: false,
    })
}
for (const s of STORES.filter((x) => x.scheduling)) {
    const r = rng(`apt:${s.key}`)
    const svcs = s.goodsAndServices.filter((i) => i.type === 'service')
    for (let i = 0; i < 9; i++) {
        const who = pick(r, customers)
        const x = r()
        const status = x < 0.62 ? 'completed' : x < 0.85 ? 'confirmed' : x < 0.95 ? 'pending' : 'cancelled'
        const ago = status === 'completed' || status === 'cancelled' ? 1 + Math.floor(r() * 60) : -(1 + Math.floor(r() * 14))
        pushAppt(`${s.key}:c${i}`, s, who, pick(r, svcs), status, ago, r)
    }
}
for (let i = 0; i < orderRows.length; i += 40) await api('DELETE', `/rest/v1/order_items?order_id=in.(${orderRows.slice(i, i + 40).map((o) => o.id).join(',')})`, undefined, { Prefer: 'return=minimal' })
await upsertBatched('orders', orderRows, 'id')
await upsertBatched('order_items', itemRows, 'id')
await upsertBatched('appointments', apptRows, 'id')

console.log(`
Pronto.
  ${STORES.length} lojas | ${productRows.filter((p) => p.listing_type === 'sale' && p.type !== 'service').length} produtos | ${productRows.filter((p) => p.type === 'service').length} serviços | ${productRows.filter((p) => p.listing_type === 'publication').length} publicações
  ${reviewRows.length} avaliações (${reviewLikeRows.length} curtidas) | ${followRows.length} seguidores | ${likeRows.length} curtidas | ${commentRows.length} comentários (${commentLikeRows.length} curtidas neles) | ${orderRows.length} pedidos | ${apptRows.length} agendamentos
  Lojas: ${STORES.map((s) => '/' + s.slug).join('  ')}
  Contas: donos owner-<segmento>@staging.iuser.test (lojista@staging.iuser.test na padaria) e clientes cliente-001..${String(N_CUSTOMERS).padStart(3, '0')}@staging.iuser.test; senha = STAGING_TEST_PASSWORD`)
