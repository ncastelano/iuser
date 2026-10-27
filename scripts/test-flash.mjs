// Testes das regras puras do Flash (src/modules/flash/domain.ts). Rodar: npm run test:flash
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFlash, validateComment, mediaKindOf, mediaPath, timeAgo, shortCount, flashGradient, fitFontSize, rowToItem, FLASH_MAX_CHARS, FLASH_MAX_BYTES } from '../src/modules/flash/domain.ts'

test('postar: precisa de texto ou arquivo', () => {
    assert.match(validateFlash({ content: '   ' }), /Escreva algo/)
    assert.equal(validateFlash({ content: 'oi' }), null)
    assert.equal(validateFlash({ content: '', file: { type: 'image/png', size: 100 } }), null)
})
test('postar: limite de texto e de arquivo, só foto e vídeo', () => {
    assert.match(validateFlash({ content: 'a'.repeat(FLASH_MAX_CHARS + 1) }), /passa de 500/)
    assert.equal(validateFlash({ content: 'a'.repeat(FLASH_MAX_CHARS) }), null)
    assert.match(validateFlash({ content: 'x', file: { type: 'application/pdf', size: 10 } }), /foto/)
    assert.match(validateFlash({ content: 'x', file: { type: 'video/mp4', size: FLASH_MAX_BYTES + 1 } }), /15 MB/)
    assert.equal(validateFlash({ content: 'x', file: { type: 'video/mp4', size: FLASH_MAX_BYTES } }), null)
})
test('comentário: 1 a 300 caracteres', () => {
    assert.ok(validateComment(' '))
    assert.equal(validateComment('legal!'), null)
    assert.ok(validateComment('a'.repeat(301)))
})
test('tipo de mídia', () => {
    assert.equal(mediaKindOf('image/webp'), 'image')
    assert.equal(mediaKindOf('video/quicktime'), 'video')
    assert.equal(mediaKindOf('image/svg+xml'), null)
})
test('caminho da mídia: pasta do dono e só caracteres aceitos pelo banco', () => {
    const uid = '123e4567-e89b-12d3-a456-426614174000'
    const p = mediaPath(uid, 'image/jpeg', 1700000000000, 'Ab/..c')
    assert.match(p, /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/)
    assert.ok(p.startsWith(uid + '/'))
    assert.ok(p.endsWith('.jpg'))
})
test('tempo e contagens curtas', () => {
    const now = new Date('2026-10-27T12:00:00Z').getTime()
    assert.equal(timeAgo('2026-10-27T11:59:50Z', now), 'agora')
    assert.equal(timeAgo('2026-10-27T11:30:00Z', now), 'há 30 min')
    assert.equal(timeAgo('2026-10-27T09:00:00Z', now), 'há 3 h')
    assert.equal(timeAgo('2026-10-25T12:00:00Z', now), 'há 2 d')
    assert.equal(shortCount(999), '999')
    assert.equal(shortCount(1200), '1,2 mil')
    assert.equal(shortCount(25000), '25 mil')
    assert.equal(shortCount(2_500_000), '2,5 mi')
})
test('cor e tamanho da letra do flash só de texto', () => {
    assert.deepEqual(flashGradient('abc'), flashGradient('abc'))
    assert.equal(flashGradient('abc').length, 2)
    assert.ok(fitFontSize('oi') > fitFontSize('a'.repeat(200)))
})
test('linha do banco → item', () => {
    const it = rowToItem({ kind: 'publication', id: 'x', created_at: '2026-01-01T00:00:00Z', author_id: 'a', author_name: null, like_count: '3', liked: 1 })
    assert.equal(it.kind, 'publication'); assert.equal(it.authorName, 'Pessoa'); assert.equal(it.likeCount, 3); assert.equal(it.liked, true); assert.equal(it.mediaType, null)
})
