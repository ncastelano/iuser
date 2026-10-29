// CURSOS ONLINE de pizza dentro da Pizzaria Forno de Ouro (conta admin-teste, banco LOCAL): produtos DIGITAIS com vídeo-aulas de verdade tocando — aulas únicas (1 vídeo),
// cursos com vários vídeos em módulos, uma playlist e um e-book — mais apostilas em PDF e uma planilha. Os vídeos são cartões animados gerados aqui (scripts/local/media-gen.swift,
// H.264) só para ver a plataforma funcionando; os arquivos vão para o bucket PRIVADO digital-files e a loja libera o acesso quando confirma o Pix.
//   node scripts/local/seed-digital-pizzaria.mjs        (idempotente: refaz os cursos sem duplicar)
// Só o banco LOCAL (recusa qualquer outro). Precisa do macOS com swiftc (Xcode) para gerar os vídeos.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
const uid = (key) => { const h = crypto.createHash('sha1').update(`iuser-digital:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const wrap = (text, max) => { const lines = []; let cur = ''; for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim() } if (cur) lines.push(cur); return lines }

const SLUG = 'pizzaria-forno-de-ouro', ADMIN_SLUG = 'admin-teste', CAT = 'Cursos online'

// ---------------------------------------------------------------- os cursos
const V = (title, seconds, preview = false) => ({ kind: 'video', title, seconds, preview })
const DOC = (title, pages, preview = false) => ({ kind: 'pdf', title, pages, preview })
const COURSES = [
    { name: 'Aula Única: Massa Napolitana de 72 horas', price: 29.9, colors: ['#b91c1c', '#f97316'], emoji: '🍕', views: 640,
      desc: 'Uma aula completa e direta ao ponto: hidratação, fermentação em 3 dias e o ponto certo de abrir a massa. Acesso para sempre, no celular ou no computador.',
      modules: [{ title: null, items: [V('Massa napolitana: do preparo ao ponto de abrir', 14)] }] },
    { name: 'Aula Única: Molho de Tomate da Nonna', price: 19.9, colors: ['#991b1b', '#ef4444'], emoji: '🍅', views: 410,
      desc: 'O molho simples de 4 ingredientes que sustenta a pizzaria: tomate pelado, sal, azeite e manjericão. Uma aula e um segredo de cozimento.',
      modules: [{ title: null, items: [V('Molho de tomate da Nonna, passo a passo', 12)] }] },
    { name: 'Curso Pizzaiolo Iniciante', price: 97, colors: ['#9a3412', '#f59e0b'], emoji: '👨‍🍳', views: 1220,
      desc: 'Do zero ao primeiro forno: ingredientes, fermentação, abertura, montagem e forno. 8 vídeo-aulas em 3 módulos, com apostila de receitas em PDF. A primeira aula é grátis.',
      modules: [
        { title: 'Módulo 1 · Primeiros passos', items: [V('Boas-vindas ao curso', 9, true), V('Ingredientes e equipamentos', 11), V('Fermentação sem mistério', 12)] },
        { title: 'Módulo 2 · Massa e montagem', items: [V('Abrindo a massa na mão', 11), V('Montagem: o que vai primeiro', 10), V('Forno a lenha e forno elétrico', 12)] },
        { title: 'Módulo 3 · Rotina de pizzaiolo', items: [V('Erros comuns e como corrigir', 10), V('Cardápio enxuto e custo por pizza', 11)] },
        { title: 'Materiais', items: [DOC('Apostila de receitas (PDF)', [
            { heading: 'Massa básica', lines: ['1 kg de farinha 00 · 650 ml de água · 25 g de sal · 2 g de fermento fresco.', 'Misture a água com o fermento, junte a farinha aos poucos e, por último, o sal. Sove até a massa soltar da mão.', 'Descanse 2 horas em temperatura ambiente e leve à geladeira por 24 a 72 horas.'] },
            { heading: 'Molho simples', lines: ['400 g de tomate pelado amassado · 1 pitada de sal · fio de azeite · folhas de manjericão.', 'Sem cozinhar: o molho cozinha no forno junto com a pizza.'] },
            { heading: 'Montagem', lines: ['Molho, mussarela, ingredientes e, depois do forno, azeite e manjericão fresco.', 'Menos é mais: três ingredientes no máximo para a massa respirar.'] }])] },
      ] },
    { name: 'Curso Pizzaiolo Profissional', price: 197, colors: ['#1e293b', '#b91c1c'], emoji: '🔥', views: 880,
      desc: 'O curso completo para quem quer viver de pizza: massas e fermentação, forno e finalização, e a parte de negócio — cardápio, precificação, delivery e atendimento. 12 vídeo-aulas, apostila e planilha de custos.',
      modules: [
        { title: 'Módulo 1 · Massas e fermentação', items: [V('Aula inaugural: o que faz uma pizza ser profissional', 10, true), V('Farinhas, hidratação e sal', 12), V('Fermentação longa e geladeira', 13), V('Massa de pizza em fatia e romana', 12)] },
        { title: 'Módulo 2 · Forno e finalização', items: [V('Temperatura e tempo de forno', 11), V('Pizzas salgadas clássicas', 12), V('Pizzas especiais e gourmet', 12), V('Pizzas doces e bordas recheadas', 11)] },
        { title: 'Módulo 3 · Negócio de pizzaria', items: [V('Cardápio que vende', 11), V('Precificação sem prejuízo', 13), V('Delivery: embalagem e tempo', 10), V('Atendimento e fidelização', 10)] },
        { title: 'Materiais', items: [DOC('Apostila completa do pizzaiolo (PDF)', [
            { heading: 'Fermentação', lines: ['Quanto mais tempo na geladeira, mais sabor e leveza. Trabalhe de 24 a 72 horas, sempre tampado.', 'Tire a massa 1 hora antes de abrir.'] },
            { heading: 'Forno', lines: ['Forno a lenha: 400 a 450 °C, 90 segundos. Forno elétrico: 280 a 300 °C, 6 a 8 minutos, com pedra aquecida.'] },
            { heading: 'Custo por pizza', lines: ['Some farinha, molho, queijo, cobertura e embalagem. Multiplique por 3 a 3,5 para chegar ao preço de venda.', 'Revise o custo todo mês: o queijo muda de preço.'] }]),
            { kind: 'csv', title: 'Planilha de custo por pizza (CSV)', csv: 'Ingrediente;Quantidade;Unidade;Custo unitário;Custo na pizza\nFarinha 00;0,16;kg;8,50;1,36\nMolho de tomate;0,08;kg;12,00;0,96\nMussarela;0,18;kg;38,00;6,84\nCobertura;0,10;kg;30,00;3,00\nEmbalagem (caixa);1;un;2,20;2,20\nTOTAL;;;;14,36\nPreço de venda sugerido (x3,2);;;;45,95\n' }] },
      ] },
    { name: 'Playlist: Pizzas Doces e Sobremesas', price: 39.9, colors: ['#9d174d', '#ec4899'], emoji: '🍫', views: 530,
      desc: 'Cinco vídeos para fechar a refeição: pizza de chocolate, banana com canela, romeu e julieta, borda recheada doce e calzone de doce de leite. A primeira é grátis.',
      modules: [{ title: null, items: [V('Pizza de chocolate com morango', 9, true), V('Banana com canela e açúcar', 10), V('Romeu e Julieta no forno', 10), V('Borda recheada doce', 11), V('Calzone de doce de leite', 10)] }] },
    { name: 'E-book: 30 molhos e coberturas', price: 24.9, colors: ['#065f46', '#16a34a'], emoji: '📘', views: 295,
      desc: 'Um e-book em PDF com 30 ideias de molhos e coberturas para variar o cardápio sem complicar a cozinha. Receitas curtas e custo estimado.',
      modules: [{ title: null, items: [DOC('E-book: 30 molhos e coberturas (PDF)', [
          { heading: 'Molhos de tomate', lines: ['Clássico · Rústico com alho · Picante com pimenta calabresa · Agridoce.', 'Todos partem de tomate pelado, sal e azeite; só muda o tempero final.'] },
          { heading: 'Molhos brancos', lines: ['Catupiry cremoso · Quatro queijos · Alho assado · Pesto de manjericão.', 'Aqueça em banho-maria para não talhar.'] },
          { heading: 'Coberturas doces', lines: ['Brigadeiro · Doce de leite · Banana caramelada · Frutas vermelhas.', 'Adicione depois de sair do forno para manter o brilho.'] },
          { heading: 'Dica de ouro', lines: ['Teste cada molho em meia pizza antes de colocar no cardápio.'] }])] }] },
]

// ---------------------------------------------------------------- gerar vídeos e PDFs
const bin = path.join(os.tmpdir(), 'iuser-media-gen')
const src = 'scripts/local/media-gen.swift'
if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
    console.log('compilando o gerador de mídia (swiftc)…')
    execFileSync('swiftc', ['-O', '-swift-version', '5', src, '-o', bin], { stdio: 'inherit' })
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'iuser-digital-'))
const jobs = [], plan = []
for (const c of COURSES) {
    c.id = uid(`prod:${c.name}`); c.slug = `${slugify(c.name)}-pizzaria`
    let n = 0, lesson = 0
    const totalLessons = c.modules.flatMap((m) => m.items).filter((i) => i.kind === 'video').length
    for (const m of c.modules) for (const it of m.items) {
        n += 1
        const base = `${String(n).padStart(2, '0')}-${slugify(it.title).slice(0, 40)}`
        if (it.kind === 'video') {
            lesson += 1
            const out = path.join(work, `${c.slug}-${base}.mp4`)
            jobs.push({ kind: 'video', out, title: it.title, subtitle: m.title || c.name, badge: totalLessons === 1 ? 'AULA ÚNICA' : `AULA ${lesson}`, c1: c.colors[0], c2: c.colors[1], emoji: c.emoji, seconds: it.seconds })
            plan.push({ c, m, it, n, base, out, mime: 'video/mp4', ext: 'mp4', kind: 'video' })
        } else if (it.kind === 'pdf') {
            const out = path.join(work, `${c.slug}-${base}.pdf`)
            jobs.push({ kind: 'pdf', out, title: c.name, c1: c.colors[0], c2: c.colors[1], pages: it.pages })
            plan.push({ c, m, it, n, base, out, mime: 'application/pdf', ext: 'pdf', kind: 'document' })
        } else {
            const out = path.join(work, `${c.slug}-${base}.csv`)
            fs.writeFileSync(out, '﻿' + it.csv)
            plan.push({ c, m, it, n, base, out, mime: 'text/csv', ext: 'csv', kind: 'document' })
        }
    }
}
fs.writeFileSync(path.join(work, 'jobs.json'), JSON.stringify(jobs))
console.log(`gerando ${jobs.filter((j) => j.kind === 'video').length} vídeos e ${jobs.filter((j) => j.kind === 'pdf').length} PDFs…`)
execFileSync(bin, [path.join(work, 'jobs.json')], { stdio: ['ignore', 'ignore', 'inherit'] })

// ---------------------------------------------------------------- banco: loja, produtos, conteúdo
const [admin] = await api('GET', `/rest/v1/profiles?select=id&%22profileSlug%22=eq.${ADMIN_SLUG}&limit=1`)
if (!admin) throw new Error('Perfil admin-teste não encontrado no banco local')
const [store] = await api('GET', `/rest/v1/stores?select=id&storeSlug=eq.${SLUG}`)
if (!store) throw new Error('Pizzaria não encontrada: rode scripts/local/seed-pizzaria.mjs antes')

const cover = (c) => {
    const lines = wrap(c.name.replace(/^(Aula Única|Playlist|E-book): /, ''), 16), f = lines.length > 2 ? 46 : 54, baseY = 540 - 90 - (lines.length - 1) * (f + 8)
    const t = lines.map((l, i) => `<text x="44" y="${baseY + i * (f + 8)}" font-family="Helvetica, Arial, sans-serif" font-size="${f}" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')
    const tag = c.name.startsWith('Aula Única') ? 'AULA ÚNICA' : c.name.startsWith('Playlist') ? 'PLAYLIST' : c.name.startsWith('E-book') ? 'E-BOOK' : 'CURSO ONLINE'
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.colors[0]}"/><stop offset="1" stop-color="${c.colors[1]}"/></linearGradient></defs><rect width="640" height="640" fill="url(#g)"/><circle cx="520" cy="120" r="170" fill="#fff" opacity=".1"/><circle cx="90" cy="560" r="130" fill="#fff" opacity=".08"/><rect x="44" y="44" width="${tag.length * 15 + 36}" height="38" rx="19" fill="#000" opacity=".28"/><text x="62" y="70" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#fff">${tag}</text>${t}<text x="44" y="610" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#fff" opacity=".9">Pizzaria Forno de Ouro</text></svg>`
}
for (const c of COURSES) {
    await upload('product-images', `digital-${c.slug}.jpg`, await sharp(Buffer.from(cover(c))).jpeg({ quality: 82 }).toBuffer(), 'image/jpeg')
}

await api('POST', '/rest/v1/products?on_conflict=id', COURSES.map((c) => ({
    id: c.id, name: c.name, slug: c.slug, description: c.desc, price: c.price, type: 'digital', price_type: 'fixed', listing_type: 'sale', is_active: true, category: CAT, has_addons: false,
    image_url: `digital-${c.slug}.jpg`, store_id: store.id, owner_id: admin.id, view_count: c.views, show_chat: false, show_whatsapp: false, duration_minutes: 60,
})), { Prefer: 'resolution=merge-duplicates,return=minimal' })

for (const c of COURSES) await api('DELETE', `/rest/v1/digital_contents?product_id=eq.${c.id}`, undefined, { Prefer: 'return=minimal' })
const rows = []
for (const p of plan) {
    const buf = fs.readFileSync(p.out)
    const storagePath = `${admin.id}/${p.c.id}/${p.base}.${p.ext}`
    await upload('digital-files', storagePath, buf, p.mime)
    rows.push({ product_id: p.c.id, owner_id: admin.id, module_title: p.m.title, title: p.it.title, kind: p.kind, storage_path: storagePath, mime_type: p.mime, size_bytes: buf.length,
        duration_seconds: p.it.kind === 'video' ? p.it.seconds : null, position: p.n, is_preview: !!p.it.preview })
}
await api('POST', '/rest/v1/digital_contents', rows, { Prefer: 'return=minimal' })
fs.rmSync(work, { recursive: true, force: true })

console.log(`${COURSES.length} produtos digitais na ${SLUG} (categoria "${CAT}"): ${COURSES.map((c) => `${c.name} — R$ ${c.price.toFixed(2)}`).join(' | ')}`)
console.log(`${rows.length} itens de conteúdo (${rows.filter((r) => r.kind === 'video').length} vídeos). Acesso: dono (admin-teste) abre tudo; cliente abre depois que a loja liberar o pedido.`)
console.log(`Área do curso Iniciante: /minhas-compras-digitais/${COURSES[2].id}`)
