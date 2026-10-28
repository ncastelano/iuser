// Criptografia e sessão do cofre do manual (src/lib/manualCrypto.mjs). Rodar: npm run test:manual-crypto
import test from 'node:test'
import assert from 'node:assert/strict'
import { chapterKey, decryptText, encryptText, signToken, verifyToken } from '../src/lib/manualCrypto.mjs'

const SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres'
const OTHER = 'outro-segredo-de-teste-com-mais-de-trinta-e-dois-caracteres'

test('cifra e decifra o mesmo texto, e a cifra não guarda o texto aberto', () => {
  const packed = encryptText(SECRET, { title: 'Entregas', n: 1 }, 'abc')
  assert.ok(packed.startsWith('v1.'))
  assert.ok(!packed.includes('Entregas'))
  assert.deepEqual(JSON.parse(decryptText(SECRET, packed, 'abc')), { title: 'Entregas', n: 1 })
})
test('cada cifra é diferente (IV novo), mas as duas decifram', () => {
  const a = encryptText(SECRET, 'x', 'k'), b = encryptText(SECRET, 'x', 'k')
  assert.notEqual(a, b); assert.equal(decryptText(SECRET, a, 'k'), 'x'); assert.equal(decryptText(SECRET, b, 'k'), 'x')
})
test('chave errada, id de outro capítulo ou texto adulterado: falha', () => {
  const packed = encryptText(SECRET, 'segredo', 'cap1')
  assert.throws(() => decryptText(OTHER, packed, 'cap1'))
  assert.throws(() => decryptText(SECRET, packed, 'cap2'))
  const [v, iv, tag, ct] = packed.split('.')
  const flipped = Buffer.from(ct, 'base64url'); flipped[0] ^= 1
  assert.throws(() => decryptText(SECRET, [v, iv, tag, flipped.toString('base64url')].join('.'), 'cap1'))
  assert.throws(() => decryptText(SECRET, 'lixo', 'cap1'))
})
test('segredo curto é recusado', () => { assert.throws(() => encryptText('curto', 'x')) })
test('id do capítulo: opaco, estável e dependente do segredo', () => {
  const k = chapterKey(SECRET, 'entregas')
  assert.match(k, /^[a-f0-9]{16}$/)
  assert.equal(k, chapterKey(SECRET, 'entregas'))
  assert.notEqual(k, chapterKey(SECRET, 'pedidos'))
  assert.notEqual(k, chapterKey(OTHER, 'entregas'))
  assert.ok(!k.includes('entregas'))
})
test('sessão assinada: vale, expira, e não aceita adulteração nem outro segredo', () => {
  const now = Date.now()
  const t = signToken(SECRET, { uid: 'u', did: 'd', exp: now + 60_000 })
  assert.equal(verifyToken(SECRET, t, now)?.uid, 'u')
  assert.equal(verifyToken(SECRET, t, now + 61_000), null)
  assert.equal(verifyToken(OTHER, t, now), null)
  const [body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ uid: 'admin', did: 'd', exp: now + 9e9 })).toString('base64url')
  assert.equal(verifyToken(SECRET, `${forged}.${sig}`, now), null)
  assert.equal(verifyToken(SECRET, `${body}.`, now), null)
  assert.equal(verifyToken(SECRET, null, now), null)
})
