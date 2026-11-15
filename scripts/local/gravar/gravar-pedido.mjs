#!/usr/bin/env node
// scripts/local/gravar/gravar-pedido.mjs — GRAVA em vídeo um pedido do começo ao fim, do ponto de vista de quem pede (SÓ no app e no banco LOCAIS).
//
// A Helena Prado (conta de teste `helena-prado`) procura a Pizzaria Forno de Ouro, monta o pedido, escolhe "receber em casa" (o endereço dela no perfil), paga no Pix e
// acompanha tudo: o pedido RETIDO procurando entregador, a sugestão de retirar na loja, o entregador aceitando, a loja aceitando e preparando, o entregador buscando, o
// CÓDIGO de entrega, o entregador na porta e o pedido entregue. O que acontece do lado da loja e do motorista é feito pelo banco como eles mesmos (JWT + RPC, o caminho do app).
//
//   node scripts/local/gravar/gravar-pedido.mjs [--rapido] [--sem-video]
//
// Como funciona: abre o Chrome do Mac (headless, sem instalar nada), guia o app com cursor/rolagem/toques e guarda cada quadro; depois monta o MP4 com o AVFoundation
// (montar-video.swift): câmera que se aproxima do que importa, passo e legenda em cada momento. Saída: .local-supabase/gravacoes/pedido-helena-<data>/video.mp4
// Requisitos: app local em http://localhost:3100 (npm run dev:local), banco local no Docker, seed-pizzaria + seed-entregadores já rodados, Chrome instalado.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirChrome } from './cdp.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..', '..')
const APP = process.env.APP_URL || 'http://localhost:3100'
const SEM_VIDEO = process.argv.includes('--sem-video')
const RAPIDO = process.argv.includes('--rapido')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const agora = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const SAIDA = join(RAIZ, '.local-supabase', 'gravacoes', `pedido-helena-${agora}`)
mkdirSync(join(SAIDA, 'quadros'), { recursive: true })

// ---------- banco local ----------
const DB = 'supabase_db_iuser-local'
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'"
function psql(sql) {
    const r = spawnSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-X'], { input: sql, encoding: 'utf8' })
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(0, 500))
    return r.stdout.trim()
}
const linhas = (sql) => psql(sql).split('\n').filter(Boolean).map((l) => l.split('|'))
function como(uid, sql) {   // age como a própria pessoa: papel authenticated + JWT (RLS, gatilhos e RPCs valem)
    const claims = JSON.stringify({ sub: uid, role: 'authenticated' })
    return psql(`begin;\nselect set_config('request.jwt.claim.sub', ${esc(uid)}, true), set_config('request.jwt.claims', ${esc(claims)}, true);\nset local role authenticated;\n${sql}\ncommit;\n`)
}
const um = (sql) => (linhas(sql)[0] || [])[0]

const HELENA = um(`select id from profiles where "profileSlug"='helena-prado'`)
const LOJA = linhas(`select id, owner_id, "storeSlug", store_lat, store_lng from stores where "storeSlug"='pizzaria-forno-de-ouro'`)[0]
const DANI = um(`select p.id from profiles p join auth.users u on u.id=p.id where u.email='entregador-dani@staging.iuser.test'`)
if (!HELENA || !LOJA || !DANI) throw new Error('Faltam dados de teste: helena-prado, a Pizzaria Forno de Ouro (seed-pizzaria.mjs) e o entregador Dani (seed-entregadores.mjs)')
const [LOJA_ID, DONO_ID] = LOJA

// ---------- quadros, câmera e legenda ----------
const chrome = await abrirChrome({ largura: 390, altura: 844, escala: 2, porta: 9333 + Math.floor(Math.random() * 300) })
const W = chrome.largura * chrome.escala, H = chrome.altura * chrome.escala   // pixels do quadro gravado
const linha = []
let tVideo = 0, nQuadro = 0
let legenda = '', passo = '', destaque = false
const cam = { cx: W / 2, cy: H / 2, z: 1 }, alvo = { cx: W / 2, cy: H / 2, z: 1 }
const dedo = { x: 195, y: 700, p: 0, onda: 0, ox: 0, oy: 0 }   // p: 0 solto … 1 apertado; onda: 0 … 1 (anel que se abre)

const OVERLAY = `(() => {
  if (window.__dedo) return;
  const d = document.createElement('div'); d.id='__dedo';
  d.style.cssText='position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(20,20,28,.42);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;will-change:transform';
  const o = document.createElement('div'); o.id='__onda';
  o.style.cssText='position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #f97316;z-index:2147483646;pointer-events:none;opacity:0';
  document.documentElement.appendChild(o); document.documentElement.appendChild(d);
  window.__dedo = (x,y,p,onda,ox,oy) => { d.style.transform='translate('+x+'px,'+y+'px) scale('+(1-0.28*p)+')'; d.style.background = p>0.5 ? 'rgba(249,115,22,.55)' : 'rgba(20,20,28,.42)';
    if (onda>0) { o.style.opacity=String(1-onda); o.style.transform='translate('+ox+'px,'+oy+'px) scale('+(1+2.2*onda)+')' } else { o.style.opacity='0' } };
  window.__f = (s) => {
    const els=[...document.querySelectorAll(s.sel||'button, a, [role=button], input, textarea')];
    let m=els.filter(e=>{ if(e.disabled) return false; const r=e.getBoundingClientRect(); if(r.width<4||r.height<4) return false; const st=getComputedStyle(e); if(st.visibility==='hidden'||st.display==='none') return false;
      const al=(e.getAttribute('aria-label')||'').toLowerCase(), tx=(e.innerText||e.value||'').trim(), ph=(e.placeholder||'').toLowerCase(); const q=s.t.toLowerCase();
      if (s.exato) return tx===s.t || al===q; if (s.inicio) return tx.toLowerCase().startsWith(q) || al.startsWith(q);
      return al.includes(q) || tx.toLowerCase().includes(q) || ph.includes(q) });
    if (s.ultimo) m=m.reverse(); let e=m[0]; if(!e) return null; if (s.pai) e=e.parentElement; const r=e.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height};
  };
  window.__modais = () => { let n=0; for (const b of document.querySelectorAll('button')) { if (/^avaliar depois$/i.test(b.textContent.trim())) { b.click(); n++ } } return n };
})()`

async function garantirOverlay() { await chrome.js(OVERLAY).catch(() => { }) }
async function quadro(dt = 1 / 8) {
    await garantirOverlay()
    // câmera: aproxima do alvo aos poucos (suavização)
    const k = 0.2
    cam.cx += (alvo.cx - cam.cx) * k; cam.cy += (alvo.cy - cam.cy) * k; cam.z += (alvo.z - cam.z) * k
    await chrome.js(`window.__dedo && window.__dedo(${dedo.x},${dedo.y},${dedo.p},${dedo.onda},${dedo.ox},${dedo.oy})`).catch(() => { })
    const jpg = await chrome.foto(80)
    const nome = String(++nQuadro).padStart(5, '0') + '.jpg'
    writeFileSync(join(SAIDA, 'quadros', nome), jpg)
    linha.push({ f: nome, t: +tVideo.toFixed(3), cx: +cam.cx.toFixed(1), cy: +cam.cy.toFixed(1), z: +cam.z.toFixed(3), legenda, passo, destaque })
    tVideo += dt
}
const dizer = (texto, p, forte = false) => { legenda = texto; if (p !== undefined) passo = p; destaque = forte }
/** segura a imagem `seg` segundos de VÍDEO (a tela pode estar mudando de verdade) */
async function segurar(seg, fps = 8) { const n = Math.max(1, Math.round(seg * fps)); for (let i = 0; i < n; i++) await quadro(1 / fps) }
/** espera algo acontecer de verdade (em tempo real), gravando; `rapido`: acelera o vídeo (poucos quadros por segundo real) */
async function esperarReal(seg, { rapido = false, ate = null } = {}) {
    const fim = Date.now() + seg * 1000
    let ultimo = Date.now()
    while (Date.now() < fim) {
        if (ate && await chrome.js(ate).catch(() => false)) break
        const t0 = Date.now()
        await quadro(rapido ? 0.2 : Math.min(0.4, Math.max(0.06, (t0 - ultimo) / 1000)))
        ultimo = t0
        if (rapido) await sleep(650)
    }
}
function mirar(rect, z = 1.6, desloc = 0) {
    if (!rect) { alvo.cx = W / 2; alvo.cy = H / 2; alvo.z = 1; return }
    const e = chrome.escala
    alvo.cx = (rect.x + rect.w / 2) * e; alvo.cy = (rect.y + rect.h / 2 + desloc) * e; alvo.z = z
}
const achar = (spec) => chrome.js(`window.__f(${JSON.stringify(spec)})`)
async function mover(x, y, seg = 0.55) {
    const n = Math.max(2, Math.round(seg * 8)), x0 = dedo.x, y0 = dedo.y
    for (let i = 1; i <= n; i++) {
        const e = 1 - Math.pow(1 - i / n, 3)
        dedo.x = x0 + (x - x0) * e; dedo.y = y0 + (y - y0) * e
        await quadro(seg / n)
    }
}
async function apertar(x, y) {
    dedo.ox = x; dedo.oy = y
    for (const [p, on] of [[0.5, 0], [1, 0.0], [1, 0.25], [0.4, 0.55], [0, 0.85]]) { dedo.p = p; dedo.onda = on; if (on === 0 && p === 1) await chrome.toque(x, y); await quadro(0.07) }
    dedo.p = 0; dedo.onda = 0
}
/** acha, rola até aparecer, leva o dedo e toca */
async function tocar(spec, { z = 0, esperar = 0.9, opcional = false } = {}) {
    let r = null
    for (let i = 0; i < 14; i++) {
        r = await achar(spec)
        if (r && r.y > 60 && r.y + r.h < chrome.altura - 150) break
        if (!r) { await segurar(0.4); continue }
        await rolar(r.y < 60 ? -240 : 240)
    }
    if (!r) { if (opcional) return false; throw new Error('não achei: ' + JSON.stringify(spec)) }
    if (z) mirar(r, z)
    await mover(r.x + r.w / 2, r.y + r.h / 2)
    await apertar(r.x + r.w / 2, r.y + r.h / 2)
    await segurar(esperar)
    return true
}
async function rolar(dy, x = 195, y = 420) {
    const n = 5
    for (let i = 0; i < n; i++) { await chrome.roda(x, y, dy / n); await quadro(1 / 10) }
    await segurar(0.15)
}
async function ir(url, { limpar = true } = {}) {
    await chrome.ir(url)
    for (let i = 0; i < 24; i++) { await sleep(250); if (await chrome.js('document.readyState').catch(() => '') === 'complete') break }
    await sleep(900)
    await garantirOverlay()
    if (limpar) { for (let i = 0; i < 6; i++) { await sleep(500); if (!(await chrome.js('window.__modais()').catch(() => 0))) { if (i > 2) break } } }
    dedo.x = 195; dedo.y = 760
}
async function digitar(texto) { for (const ch of texto) { await chrome.enviar('Input.insertText', { text: ch }); await quadro(0.09); await sleep(40) } }
const passoN = (n, total, t) => `${n}/${total} · ${t}`
const TOTAL = 10

// ---------- preparação (não aparece no vídeo) ----------
psql(`delete from carts where user_id = ${esc(HELENA)}::uuid;`)
// um pedido de entrega que a Helena já tenha em aberto de execuções anteriores atrapalharia a cena
psql(`update orders set status='rejected', closed_reason='customer_cancelled' where buyer_id=${esc(HELENA)}::uuid and status in ('pending','preparing','ready');`)
await chrome.enviar('Network.setCookie', { name: 'iuser_ui', value: 'v3', url: APP })
await ir(`${APP}/dev-login?as=profile-helena-prado&to=/`)
await sleep(2500)
await ir(`${APP}/`)

// ---------- título ----------
linha.push({ f: null, t: 0, titulo: 'Helena pede uma pizza', legenda: 'Do pedido até receber em casa, passo a passo, no celular dela.' }); tVideo = 3.2

// ===== 1. abre o app =====
dizer('Helena Prado abre o iUser. Ela quer pedir uma pizza da Pizzaria Forno de Ouro e receber em casa.', passoN(1, TOTAL, 'Abrir o app'))
await segurar(2.4)

// ===== 2. procura a loja =====
dizer('Ela procura pela pizzaria na busca da página inicial.', passoN(2, TOTAL, 'Procurar a loja'))
const campo = await achar({ t: 'O que você procura' })
if (campo) {
    mirar(campo, 1.5)
    await mover(campo.x + campo.w / 2, campo.y + campo.h / 2); await apertar(campo.x + campo.w / 2, campo.y + campo.h / 2)
    await digitar('pizzaria forno')
    await segurar(1.4)
    mirar(null)
    await esperarReal(3, { ate: `!![...document.querySelectorAll('a')].find(a => /pizzaria-forno-de-ouro/.test(a.href))` })
    await segurar(0.8)
    const link = await achar({ sel: 'a[href*="pizzaria-forno-de-ouro"]', t: '' })
    if (link) { await tocar({ sel: 'a[href*="pizzaria-forno-de-ouro"]', t: '' }, { z: 1.2, esperar: 1.4 }) } else await ir(`${APP}/pizzaria-forno-de-ouro`)
} else await ir(`${APP}/pizzaria-forno-de-ouro`)
mirar(null)
await esperarReal(2.5)

// ===== 3. loja -> catálogo =====
dizer('Na página da loja ela toca em Comprar para ver o catálogo.', passoN(3, TOTAL, 'Entrar na loja'))
await segurar(1.2)
const comprou = await tocar({ t: 'Comprar', exato: true }, { z: 1.3, esperar: 1.5, opcional: true })
if (!comprou) await ir(`${APP}/pizzaria-forno-de-ouro/catalogo`)
await esperarReal(2.2)
mirar(null)

// ===== 4. monta o pedido =====
dizer('Ela escolhe a Pizza Margherita e uma bebida.', passoN(4, TOTAL, 'Montar o pedido'))
await segurar(1)
async function adicionar(label) {
    await tocar({ t: label }, { esperar: 1.3 })
    await tocar({ t: 'Adicionar ao carrinho' }, { esperar: 1.2 })
    for (let i = 0; i < 3; i++) {
        if (await tocar({ t: 'Continuar', exato: true }, { esperar: 1, opcional: true })) continue
        if (await tocar({ t: 'Adicionar', exato: true }, { esperar: 1.2, opcional: true })) continue
        break
    }
    // fecha a janela de detalhes, se continuar aberta
    const x = await achar({ sel: 'button:has(svg.lucide-x)', t: '' })
    if (x) { await tocar({ sel: 'button:has(svg.lucide-x)', t: '' }, { esperar: 0.8 }) }
}
await adicionar('Adicionar Pizza Margherita (grande)')
await adicionar('Adicionar Guaraná Antarctica 2 L')
dizer('Dois itens na sacola. Agora é só finalizar.', passoN(4, TOTAL, 'Montar o pedido'))
const sac = await achar({ t: 'na sacola' })
if (sac) mirar(sac, 1.4)
await segurar(1.6)
mirar(null)

// ===== 5. como receber =====
dizer('Ela escolhe Receber em casa. O endereço do perfil dela já vem pronto.', passoN(5, TOTAL, 'Receber em casa'))
await tocar({ t: 'Finalizar', exato: true }, { esperar: 1.4 })
await tocar({ t: 'Receber em casa', inicio: true }, { esperar: 1.4 })
dizer('O app avisa: a loja só recebe o pedido quando um entregador aceitar. Se demorar, ela pode retirar na loja ou cancelar.', passoN(5, TOTAL, 'Receber em casa'), true)
const nota = await achar({ sel: 'p', t: 'A loja recebe o pedido' })
if (nota) mirar({ ...nota, y: nota.y - 6, h: nota.h + 12 }, 1.7)
await segurar(4.2)
mirar(null)
dizer('Ela usa o endereço salvo no perfil e segue.', passoN(5, TOTAL, 'Receber em casa'))
await tocar({ t: 'Usar endereço salvo', inicio: true }, { esperar: 1.3 })
await tocar({ t: 'Continuar', exato: true }, { esperar: 1.4 })

// ===== 6. pagamento e envio =====
dizer('Pagamento no Pix e confirma o pedido.', passoN(6, TOTAL, 'Pagar e enviar'))
await tocar({ t: 'Pix', exato: true }, { esperar: 1.2 })
await tocar({ t: 'Confirmar Pedido', exato: true }, { esperar: 1.2 })
dizer('Pedido feito! Ele ainda NÃO foi para a loja: o iUser já está procurando um entregador.', passoN(6, TOTAL, 'Pagar e enviar'), true)
await esperarReal(3.5)

// pedido que ela acabou de fazer
const PEDIDO = um(`select id from orders where buyer_id=${esc(HELENA)}::uuid order by created_at desc limit 1`)
const CORRIDA = um(`select id from ride_requests where order_id=${esc(PEDIDO)}::uuid order by created_at desc limit 1`)
if (!PEDIDO) throw new Error('o pedido não foi criado')

// ===== 7. acompanha: procurando entregador =====
await ir(`${APP}/atividade?aba=pedidos`)
dizer('Em Atividade → Pedidos ela acompanha: "Procurando entregador". A loja não vê nada ainda.', passoN(7, TOTAL, 'Esperar o entregador'), true)
await esperarReal(2)
const aviso = await achar({ sel: 'div', t: 'Procurando um entregador' })
await segurar(1)
const faixa = await achar({ t: 'Procurando entregador' })
if (faixa) { mirar(faixa, 1.9, -10); dizer('A faixa da barra de baixo também mostra o andamento do pedido, na cor da etapa.', passoN(7, TOTAL, 'Esperar o entregador')) }
await segurar(3.2)
mirar(null)
dizer('Os minutos passam sem ninguém aceitar…', passoN(7, TOTAL, 'Esperar o entregador'))
await esperarReal(6, { rapido: true })
// envelhece o pedido em 4 minutos e "reabre" a tela, como se ela voltasse depois de um tempo
psql(`update orders set created_at = created_at - interval '4 minutes' where id = ${esc(PEDIDO)}::uuid;`)
await chrome.js('location.reload()').catch(() => { })
await sleep(1500)
await ir(`${APP}/atividade?aba=pedidos`)
dizer('Passaram uns minutos. O app oferece uma saída: retirar na loja, sem pagar o frete. Helena prefere esperar mais um pouco.', passoN(8, TOTAL, 'Demorou'), true)
const sug = await achar({ sel: 'div', t: 'Está demorando' })
await esperarReal(1.5)
const botao = await achar({ t: 'Retirar na loja', exato: true })
if (botao) mirar({ x: 0, y: botao.y - 70, w: 390, h: botao.h + 110 }, 1.45)
await segurar(5)
mirar(null)

// ===== 9. entregador aceita =====
dizer('Um entregador aceita a entrega…', passoN(9, TOTAL, 'Entregador aceita'))
await segurar(1)
let aceitou = false
try {
    como(DANI, `insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, ${esc(DANI)}::uuid, r.offered_price from ride_requests r where r.id = ${esc(CORRIDA)}::uuid;`)
    aceitou = true
} catch (e) { console.log('  (candidatura direta recusada: ' + e.message.split('\n')[0] + ' — aceitando pela corrida)') }
if (!aceitou) psql(`update ride_requests set status='accepted', driver_id=${esc(DANI)}::uuid where id=${esc(CORRIDA)}::uuid;`)
await esperarReal(8, { ate: `document.body.innerText.includes('aceitou a sua entrega')` })
dizer('Só agora o pedido chega à loja. O app avisa a Helena: um entregador aceitou. Agora a loja aguarda decidir.', passoN(9, TOTAL, 'Entregador aceita'), true)
mirar(null)
await segurar(3.4)

// loja aceita
dizer('A loja recebe o pedido, aceita e começa a preparar.', passoN(9, TOTAL, 'Loja prepara'))
como(DONO_ID, `update orders set status='preparing' where id=${esc(PEDIDO)}::uuid;`)
await esperarReal(6, { ate: `document.body.innerText.includes('Preparando')` })
const fp = await achar({ t: 'Preparando' })
await segurar(1.5)
if (fp) mirar(fp, 1.6, -6)
await segurar(2.6)
mirar(null)
dizer('Enquanto a loja prepara, o entregador sai para a loja.', passoN(9, TOTAL, 'Loja prepara'))
como(DANI, `update ride_requests set driver_en_route = true, driver_departed_at = now() where id=${esc(CORRIDA)}::uuid;`)
await esperarReal(10, { rapido: true })

// pronto e retirada
como(DONO_ID, `update orders set status='ready' where id=${esc(PEDIDO)}::uuid;`)
dizer('Pizza pronta! O entregador já está na loja.', passoN(9, TOTAL, 'Retirada'), true)
como(DANI, `update ride_requests set driver_arrived_at = now() where id=${esc(CORRIDA)}::uuid;`)
await esperarReal(6, { ate: `document.body.innerText.includes('Pronto')` })
await segurar(2.4)
const codigoLoja = um(`select code from delivery_pickup_codes where store_id=${esc(LOJA_ID)}::uuid and driver_id=${esc(DANI)}::uuid and used_at is null order by created_at desc limit 1`)
dizer('A loja confere o pedido e passa o código de retirada ao entregador. Ele pega a pizza e sai.', passoN(9, TOTAL, 'Retirada'))
como(DANI, `select confirm_pickup(array[${esc(CORRIDA)}::uuid], ${esc(codigoLoja || '')});`)
await esperarReal(7, { ate: `document.body.innerText.includes('SEU CÓDIGO') || document.body.innerText.toUpperCase().includes('SEU CÓDIGO DE ENTREGA')` })
await chrome.js('window.scrollTo({top:0})')
await segurar(1)

// ===== 10. código, porta, entrega =====
dizer('A pizza saiu. No topo do pedido aparece o código de entrega: é o que ela diz ao entregador na porta.', passoN(10, TOTAL, 'Receber'), true)
const cod = await achar({ sel: 'p', t: 'Seu código de entrega', pai: true })
if (cod) mirar(cod, 1.55)
await segurar(4.6)
mirar(null)
const D = linhas(`select destination_lat, destination_lng from ride_requests where id=${esc(CORRIDA)}::uuid`)[0]
como(DANI, `select arrive_at_destination(${esc(CORRIDA)}::uuid, ${D[0]}, ${D[1]});`)
dizer('O entregador chegou e tocou em "Estou no local": Helena é avisada na hora para ir até a porta.', passoN(10, TOTAL, 'Receber'), true)
await esperarReal(6, { ate: `document.body.innerText.includes('está na porta') || document.body.innerText.includes('no seu endereço')` })
await segurar(3)
const pin = um(`select pin from delivery_proofs where ride_id=${esc(CORRIDA)}::uuid`)
dizer(`Na porta, ela diz o código (${pin}) ao entregador, que confirma no celular dele.`, passoN(10, TOTAL, 'Receber'))
await segurar(2.5)
como(DANI, `select submit_delivery_proof(${esc(CORRIDA)}::uuid, 'pin', ${esc(pin)});`)
como(DANI, `select complete_ride(${esc(CORRIDA)}::uuid, ${D[0]}, ${D[1]});`)
await esperarReal(8, { ate: `document.body.innerText.includes('finalizado') || document.body.innerText.includes('foi entregue')` })
dizer('Entregue! A faixa some, o pedido fica como Finalizado e o app pede a avaliação.', passoN(10, TOTAL, 'Receber'), true)
await segurar(4.5)
await tocar({ t: 'Avaliar depois', exato: true }, { esperar: 1.2, opcional: true })
mirar(null)
await segurar(2.5)

// ---------- fim ----------
const fim = tVideo + 1.5
writeFileSync(join(SAIDA, 'linha.json'), JSON.stringify({ w: W, h: H, saida: { w: 720, h: 1560 }, fim, quadros: linha }, null, 1))
await chrome.fechar()
console.log(`quadros: ${nQuadro} · duração do vídeo: ${fim.toFixed(1)} s · ${SAIDA}`)
if (!SEM_VIDEO) {
    const exe = process.env.MONTAR_VIDEO || join(RAIZ, '.local-supabase', 'montar-video')
    if (!existsSync(exe)) {
        console.log('compilando o montador de vídeo…')
        execFileSync('swiftc', ['-O', join(AQUI, 'montar-video.swift'), '-o', exe], { stdio: 'inherit' })
    }
    execFileSync(exe, [SAIDA, join(SAIDA, 'video.mp4')], { stdio: 'inherit' })
}
