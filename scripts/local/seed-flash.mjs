// Flash (feed de pessoas) com vida (banco LOCAL): ~48 flashes de pessoas diferentes — metade com foto gerada (sharp, sem baixar nada), metade só texto —
// espalhados pelos últimos 3 dias, com curtidas e comentários. Depois disso o simulador do ecossistema (simulate-ecosystem.py) mantém o feed andando.
//   node scripts/local/seed-flash.mjs            (idempotente: roda de novo e refaz só o que é do seed)
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
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`)
    return t ? JSON.parse(t) : null
}
async function upload(path, buf) {
    const r = await fetch(`${API}/storage/v1/object/flash-media/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: buf })
    if (!r.ok) throw new Error(`upload ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const R = (arr) => arr[Math.floor(Math.random() * arr.length)]
const hash = (s) => crypto.createHash('sha1').update(s).digest().readUInt32LE(0)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const wrap = (text, max) => { const lines = []; let cur = ''; for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() } if (cur) lines.push(cur); return lines.slice(0, 5) }
const PALETTES = [['#f97316', '#be123c'], ['#7c3aed', '#1e3a8a'], ['#0ea5e9', '#1d4ed8'], ['#16a34a', '#064e3b'], ['#db2777', '#7c2d12'], ['#eab308', '#9a3412'], ['#14b8a6', '#1e293b'], ['#6366f1', '#831843']]
// Pôster vertical 900x1600 (como um reel): fundo em degradê, formas suaves e o texto grande
const poster = (text, seed) => {
    text = text.replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, '').trim()   // o sharp não desenha emoji
    const h = hash(seed), [c1, c2] = PALETTES[h % PALETTES.length], lines = wrap(text, 16)
    const t = lines.map((l, i) => `<text x="70" y="${760 + i * 96}" font-family="Helvetica, Arial, sans-serif" font-size="84" font-weight="800" fill="#fff">${esc(l)}</text>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="900" height="1600" fill="url(#g)"/><circle cx="${200 + (h % 500)}" cy="${240 + ((h >> 6) % 300)}" r="${230 + ((h >> 12) % 120)}" fill="#fff" fill-opacity=".14"/><circle cx="${700 - ((h >> 4) % 300)}" cy="1320" r="260" fill="#000" fill-opacity=".14"/>${t}</svg>`
}

const CAPTIONS = [
    'Treino de hoje pago 💪', 'Bolo de pote saindo do forno', 'Obra entregue, cliente feliz', 'Domingo de sol em Porto Velho', 'Café da manhã de campeão', 'Corte novo, visual novo',
    'Plantão noturno concluído', 'Feira do bairro lotada hoje', 'Mais um dia no corre', 'Pôr do sol no Madeira', 'Cardápio novo na área!', 'Cachorrinho adotado hoje 🐶',
    'Quem aí já provou o rodízio?', 'Serviço feito com carinho', 'Promoção só até sexta', 'Aula de violão começando', 'Meu cantinho de trabalho', 'Marmita fit da semana',
]
const TEXTS = [
    'Alguém indica um bom eletricista aqui na zona leste?', 'Hoje o trânsito na Jorge Teixeira tá impossível 😅', 'Acabei de fechar um serviço pelo iUser, muito prático!',
    'Pizza de sexta com a família, nada supera.', 'Quem vai no evento da praça no sábado?', 'Dica: peça com antecedência que a entrega chega mais rápido.', 'Bom dia, Porto Velho! ☀️',
    'Terminei a reforma da cozinha, ficou lindo demais.', 'Estudando pra prova, sem tempo pra nada hoje 📚', 'Vendi tudo que fiz hoje, gratidão!', 'Procurando babá de confiança pra sábado à noite.',
    'Quem tem dica de passeio com criança no fim de semana?', 'Abri a agenda da semana que vem, vagas limitadas!', 'O melhor açaí da cidade? Aceito indicações.',
    'Chegou o novo lote, corre que acaba rápido!', 'Pedi o frete pelo iUser e o motorista chegou em 5 minutos.', 'Hoje é dia de feijoada! 🍲', 'Quem mais tá sem sono às 3 da manhã?',
]
const COMMENTS = ['Muito bom!', 'Adorei 😍', 'Parabéns!', 'Onde fica?', 'Quanto custa?', 'Top demais', 'Também quero!', 'Show de bola', 'Verdade!', 'Me chama no privado', 'Que lindo', 'Boa!']

const people = await api('GET', `/rest/v1/profiles?select=id,name&is_active=eq.true&limit=400`)
if (people.length < 20) throw new Error('Poucos perfis no banco local — rode o setup antes')
await api('DELETE', `/rest/v1/flashes?content=like.%E2%80%8B*`)   // limpa só o que o seed marcou (zero-width space no começo)
const rows = []
for (let i = 0; i < 48; i++) {
    const a = R(people)
    const withImage = i % 2 === 0
    const text = withImage ? R(CAPTIONS) : R(TEXTS)
    let media_url = null, media_type = null
    if (withImage) {
        media_url = `${a.id}/seed-${Date.now()}-${i}.jpg`
        await upload(media_url, await sharp(Buffer.from(poster(text, `${a.id}${i}`))).jpeg({ quality: 78 }).toBuffer())
        media_type = 'image'
    }
    const ago = Math.floor(Math.random() * 72 * 3600 * 1000)
    rows.push({ author_id: a.id, content: `​${text}`, media_url, media_type, created_at: new Date(Date.now() - ago).toISOString() })
}
const created = await api('POST', '/rest/v1/flashes', rows, { Prefer: 'return=representation' })
const likes = [], comments = []
for (const f of created) {
    const n = Math.floor(Math.random() * 14)
    for (const p of [...people].sort(() => Math.random() - 0.5).slice(0, n)) likes.push({ flash_id: f.id, profile_id: p.id })
    const c = Math.floor(Math.random() * 4)
    for (let k = 0; k < c; k++) comments.push({ flash_id: f.id, author_id: R(people).id, content: R(COMMENTS) })
}
if (likes.length) await api('POST', '/rest/v1/flash_likes?on_conflict=flash_id,profile_id', likes, { Prefer: 'resolution=ignore-duplicates,return=minimal' })
if (comments.length) await api('POST', '/rest/v1/flash_comments', comments, { Prefer: 'return=minimal' })
console.log(`${created.length} flashes (${created.filter((f) => f.media_url).length} com foto), ${likes.length} curtidas e ${comments.length} comentários.`)
