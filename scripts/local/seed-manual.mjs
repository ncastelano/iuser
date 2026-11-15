// Envia o MANUAL DE REGRAS para o cofre (tabela admin_manual_chapters), CIFRADO. O texto mora FORA do repositório:
//   ~/.iuser-private/manual/NN-palavra.mjs   (um arquivo por capítulo; veja _h.mjs ali para os blocos)  — ou a pasta de MANUAL_SOURCE_DIR
//
//   node scripts/local/seed-manual.mjs                 envia para o banco LOCAL (o segredo local vem da chave do Supabase local)
//   node scripts/local/seed-manual.mjs --prune         também apaga do banco os capítulos que não estão mais na pasta
//   node scripts/local/seed-manual.mjs --check         só valida a pasta (não grava nada)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MANUAL_SECRET=... node scripts/local/seed-manual.mjs --remote
//        envia para OUTRO banco (staging/produção): pede para digitar ENVIAR. Escrever em produção é decisão sua; o segredo MANUAL_SECRET tem de ser o mesmo do servidor.
// Regras de forma: cada capítulo tem UMA palavra de título (sem espaços), slug minúsculo sem acento, e seções com id único.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chapterKey, encryptText } from '../../src/lib/manualCrypto.mjs'

const args = new Set(process.argv.slice(2))
const root = path.resolve(import.meta.dirname, '..', '..')
const dir = process.env.MANUAL_SOURCE_DIR || path.join(os.homedir(), '.iuser-private', 'manual')
const BLOCKS = new Set(['p', 'steps', 'list', 'note', 'table'])
const STATUS = new Set(['ativo', 'desligado', 'parcial', 'pendente', 'planejado'])

function validate(ch, file) {
  const bad = (m) => { throw new Error(`${file}: ${m}`) }
  if (!/^[a-z]{2,24}$/.test(ch.slug || '')) bad(`slug "${ch.slug}" precisa ser UMA palavra minúscula sem acento`)
  if (!ch.title || /\s/.test(ch.title)) bad(`título "${ch.title}" precisa ser UMA palavra`)
  if (!ch.summary) bad('falta o resumo')
  if (!Number.isInteger(ch.position)) bad('falta a posição')
  const ids = new Set()
  for (const s of ch.sections || []) {
    if (!s.id || ids.has(s.id)) bad(`id de seção repetido ou vazio: ${s.id}`)
    ids.add(s.id)
    if (!s.title) bad(`seção ${s.id} sem título`)
    if (s.status && !STATUS.has(s.status)) bad(`seção ${s.id}: status inválido "${s.status}"`)
    for (const b of s.blocks || []) if (!BLOCKS.has(b.t)) bad(`seção ${s.id}: bloco inválido "${b.t}"`)
  }
  return ch
}

const files = readdirSync(dir).filter((f) => /^\d+-.+\.mjs$/.test(f)).sort()
const chapters = []
for (const f of files) chapters.push(validate((await import(pathToFileURL(path.join(dir, f)).href)).default, f))
const seen = new Set()
for (const c of chapters) { if (seen.has(c.slug)) throw new Error(`capítulo repetido: ${c.slug}`); seen.add(c.slug) }
const nSections = chapters.reduce((n, c) => n + c.sections.length, 0)
console.log(`${chapters.length} capítulos, ${nSections} seções em ${dir}`)
if (args.has('--check')) process.exit(0)

let url, key, secret
if (args.has('--remote')) {
  url = process.env.SUPABASE_URL; key = process.env.SUPABASE_SERVICE_ROLE_KEY; secret = process.env.MANUAL_SECRET
  if (!url || !key || !secret) { console.error('--remote precisa de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MANUAL_SECRET.'); process.exit(1) }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`Enviar ${chapters.length} capítulos para ${url}? Digite ENVIAR: `); rl.close()
  if (ans.trim() !== 'ENVIAR') { console.log('Cancelado.'); process.exit(1) }
} else {
  const env = { ...process.env, PATH: `${process.env.HOME}/.orbstack/bin:${process.env.PATH}` }
  delete env.SUPABASE_ACCESS_TOKEN
  const r = spawnSync('npx', ['supabase', 'status', '-o', 'env', '--workdir', path.join(root, '.local-supabase')], { encoding: 'utf8', env, cwd: root })
  const kv = Object.fromEntries(r.stdout.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
  if (!kv.API_URL || !/localhost|127\.0\.0\.1/.test(kv.API_URL)) { console.error('Supabase local desligado. Rode: python3 scripts/local/setup.py'); process.exit(1) }
  url = kv.API_URL; key = kv.SERVICE_ROLE_KEY
  secret = `local-dev:${key}`.slice(0, 200)   // o mesmo que o servidor usa no ambiente local (src/lib/adminVault.ts)
}

const db = createClient(url, key, { auth: { persistSession: false } })
const rows = chapters.map((c) => { const id = chapterKey(secret, c.slug); return { id, position: c.position, payload_enc: encryptText(secret, c, id), updated_at: new Date().toISOString() } })
const { error } = await db.from('admin_manual_chapters').upsert(rows)
if (error) { console.error(error.message); process.exit(1) }
if (args.has('--prune')) {
  const keep = new Set(rows.map((r) => r.id))
  const { data } = await db.from('admin_manual_chapters').select('id')
  const drop = (data || []).map((r) => r.id).filter((id) => !keep.has(id))
  if (drop.length) await db.from('admin_manual_chapters').delete().in('id', drop)
  console.log(`${drop.length} capítulo(s) antigo(s) apagado(s)`)
}
console.log(`ok: ${rows.length} capítulos cifrados e gravados`)
