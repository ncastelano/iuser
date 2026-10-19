// Recomprime as imagens JÁ ENVIADAS ao Storage do Supabase (avatares, produtos, logos...) para cortar o tráfego de saída
// (Cached Egress). Mantém o MESMO caminho e o MESMO formato (JPEG continua JPEG, PNG continua PNG, WebP continua WebP),
// então nenhum link no banco muda. Antes de trocar qualquer arquivo, salva o ORIGINAL numa pasta de backup.
//
//   node scripts/maintenance/compress-storage.mjs --target staging            (ensaio: só calcula e mostra a economia)
//   node scripts/maintenance/compress-storage.mjs --target staging --apply
//   node scripts/maintenance/compress-storage.mjs --target prod --apply --yes-prod   (PRODUÇÃO: exige as duas flags)
// Opções: --bucket avatars,product-images  --min-kb 150  --backup <pasta>
//
// Credenciais (não vão para o repositório): staging em .env.staging.local (STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY);
// produção em .env.local (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const target = opt('target')
const apply = flag('apply')
if (!['staging', 'prod'].includes(target)) { console.error('use --target staging|prod'); process.exit(1) }
if (target === 'prod' && apply && !flag('yes-prod')) { console.error('Produção + --apply exige também --yes-prod.'); process.exit(1) }

const root = path.resolve(import.meta.dirname, '..', '..')
const readEnv = (f) => fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) : {}
const PROD_REF = 'mqtwehsmkuknkrtrqbnf'
let URL_, KEY
if (target === 'staging') {
    const e = readEnv(path.join(root, '.env.staging.local')); URL_ = e.STAGING_SUPABASE_URL; KEY = e.STAGING_SUPABASE_SERVICE_ROLE_KEY
    if (!URL_ || URL_.includes(PROD_REF)) { console.error('URL de staging ausente ou é a da produção'); process.exit(1) }
} else {
    const e = readEnv(path.join(root, '.env.local')); URL_ = e.NEXT_PUBLIC_SUPABASE_URL; KEY = e.SUPABASE_SERVICE_ROLE_KEY
    if (!URL_ || !URL_.includes(PROD_REF)) { console.error('.env.local não aponta para a produção'); process.exit(1) }
}
URL_ = URL_.replace(/\/$/, '')
if (!KEY) { console.error('chave de serviço ausente'); process.exit(1) }

const MAX_DIM = { avatars: 800, 'store-logos': 800, 'product-images': 1600, posts: 1600, backgrounds: 1920, 'mural-images': 1600, 'community-photos': 1600 }
const BUCKETS = (opt('bucket', Object.keys(MAX_DIM).join(','))).split(',')
const MIN = Number(opt('min-kb', 150)) * 1024
const backupRoot = opt('backup', path.join(os.homedir(), 'iuser-backups', `storage-${new Date().toISOString().slice(0, 10)}-${target}`))

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function list(bucket, prefix = '') {
    const out = []
    for (let offset = 0; ; offset += 1000) {
        const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) })
        if (!r.ok) throw new Error(`list ${bucket}/${prefix}: ${r.status} ${await r.text()}`)
        const rows = await r.json()
        for (const row of rows) {
            if (row.id === null) out.push(...await list(bucket, prefix ? `${prefix}/${row.name}` : row.name))
            else out.push({ name: prefix ? `${prefix}/${row.name}` : row.name, size: Number(row.metadata?.size || 0), mime: row.metadata?.mimetype })
        }
        if (rows.length < 1000) break
    }
    return out
}

let before = 0, after = 0, changed = 0, skipped = 0
for (const bucket of BUCKETS) {
    const files = (await list(bucket)).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.mime || '') && f.size >= MIN)
    console.log(`\n[${bucket}] ${files.length} imagem(ns) >= ${MIN / 1024} KB`)
    for (const f of files) {
        const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${f.name.split('/').map(encodeURIComponent).join('/')}`, { headers: H })
        if (!r.ok) { console.log(`  ! baixar ${f.name}: ${r.status}`); continue }
        const orig = Buffer.from(await r.arrayBuffer())
        const img = sharp(orig, { failOn: 'none' }).rotate()   // respeita a orientação EXIF e a remove
        const meta = await sharp(orig).metadata()
        const max = MAX_DIM[bucket] || 1600
        let p = img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
        if (f.mime === 'image/jpeg') p = p.jpeg({ quality: 78, mozjpeg: true })
        else if (f.mime === 'image/png') p = p.png({ palette: true, quality: 80, effort: 8, compressionLevel: 9 })
        else p = p.webp({ quality: 78 })
        const out = await p.toBuffer()
        before += orig.length
        if (out.length >= orig.length * 0.9) { skipped++; after += orig.length; console.log(`  = ${f.name}  ${Math.round(orig.length / 1024)} KB (não compensa)`); continue }
        after += out.length; changed++
        console.log(`  ${apply ? '✔' : '~'} ${f.name}  ${meta.width}x${meta.height} ${Math.round(orig.length / 1024)} KB -> ${Math.round(out.length / 1024)} KB`)
        if (apply) {
            const bp = path.join(backupRoot, bucket, f.name)
            fs.mkdirSync(path.dirname(bp), { recursive: true })
            if (!fs.existsSync(bp)) fs.writeFileSync(bp, orig)   // backup do original ANTES de trocar
            const up = await fetch(`${URL_}/storage/v1/object/${bucket}/${f.name.split('/').map(encodeURIComponent).join('/')}`, {
                method: 'POST', headers: { ...H, 'Content-Type': f.mime, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: out,
            })
            if (!up.ok) { console.log(`  ! enviar ${f.name}: ${up.status} ${await up.text()}`); continue }
        }
    }
}
const mb = (n) => (n / 1048576).toFixed(1)
console.log(`\n${apply ? 'APLICADO' : 'ENSAIO'} em ${target}: ${changed} trocada(s), ${skipped} mantida(s). ${mb(before)} MB -> ${mb(after)} MB (${before ? Math.round((1 - after / before) * 100) : 0}% menos).`)
if (apply) console.log(`Originais guardados em: ${backupRoot}`)
