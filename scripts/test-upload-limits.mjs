// Limites de upload (src/lib/uploadLimits.ts ↔ supabase/migrations/20261130000018_storage_bucket_limits.sql). Rodar: npm run test:upload-limits
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PHOTO_BUCKET_LIMITS, PHOTO_MIME_TYPES, checkPhotoUpload, inferPhotoType, MB } from '../src/lib/uploadLimits.ts'

const root = path.resolve(import.meta.dirname, '..')
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261130000018_storage_bucket_limits.sql'), 'utf8')

test('a tabela do navegador é idêntica à da migration (mesmos buckets, mesmos tamanhos, mesmos tipos)', () => {
    const rows = [...sql.matchAll(/\('([a-z-]+)',\s*(\d+)\)/g)].map((m) => [m[1], Number(m[2])])
    assert.equal(rows.length, 12, 'a migration deve cobrir os 12 buckets que não tinham limite')
    assert.deepEqual(Object.fromEntries(rows), PHOTO_BUCKET_LIMITS)
    const mimes = sql.match(/ARRAY\[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''))
    assert.deepEqual(mimes, [...PHOTO_MIME_TYPES])
})

test('o rollback desfaz exatamente os mesmos 12 buckets', () => {
    const rb = fs.readFileSync(path.join(root, 'supabase/rollbacks/storage_bucket_limits_rollback.sql'), 'utf8')
    const ids = [...rb.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort()
    assert.deepEqual(ids, Object.keys(PHOTO_BUCKET_LIMITS).sort())
})

test('a migration não mexe nos buckets que já têm regra própria', () => {
    for (const b of ['flash-media', 'delivery-proofs', 'digital-files']) assert.ok(!sql.includes(`'${b}'`), b)
    assert.ok(!('flash-media' in PHOTO_BUCKET_LIMITS))
})

test('foto normal passa; grande demais e formato proibido são recusados com mensagem clara', () => {
    assert.deepEqual(checkPhotoUpload('avatars', { size: 400 * 1024, type: 'image/jpeg' }), { ok: true, contentType: 'image/jpeg' })
    const big = checkPhotoUpload('avatars', { size: 5 * MB + 1, type: 'image/jpeg' })
    assert.equal(big.ok, false); assert.equal(big.reason, 'size'); assert.match(big.message, /5 MB/)
    assert.equal(checkPhotoUpload('community-photos', { size: 6 * MB, type: 'image/png' }).ok, true)
    assert.equal(checkPhotoUpload('community-photos', { size: 6 * MB + 1, type: 'image/png' }).ok, false)
    for (const type of ['image/svg+xml', 'image/heic', 'text/html', 'application/pdf', 'video/mp4']) {
        const r = checkPhotoUpload('product-images', { size: 1000, type })
        assert.equal(r.ok, false, type); assert.equal(r.reason, 'type')
    }
})

test('arquivo sem tipo ganha o tipo da extensão; sem extensão conhecida é recusado', () => {
    assert.equal(inferPhotoType('', 'foto.JPG'), 'image/jpeg')
    assert.equal(inferPhotoType('application/octet-stream', 'a.webp'), 'image/webp')
    assert.equal(checkPhotoUpload('avatars', { size: 1000, type: '', name: 'camera.png' }).contentType, 'image/png')
    assert.equal(checkPhotoUpload('avatars', { size: 1000, type: '' }, 'u1/abc.jpeg').contentType, 'image/jpeg')
    assert.equal(checkPhotoUpload('avatars', { size: 1000, type: '', name: 'estranho' }).ok, false)
})

test('buckets com regra própria passam pela checagem do navegador (quem manda é o servidor)', () => {
    assert.equal(checkPhotoUpload('flash-media', { size: 14 * MB, type: 'video/mp4' }).ok, true)
    assert.equal(checkPhotoUpload('digital-files', { size: 400 * MB, type: 'application/pdf' }).ok, true)
})

test('o ponto central de upload usa a checagem', () => {
    const c = fs.readFileSync(path.join(root, 'src/lib/supabase/client.ts'), 'utf8')
    assert.match(c, /import \{ checkPhotoUpload \} from '@\/lib\/uploadLimits'/)
    assert.match(c, /checkPhotoUpload\(bucket,/)
})
