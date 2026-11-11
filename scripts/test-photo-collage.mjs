// Testes da regra do quadradinho de fotos do pedido (src/lib/photoCollage.ts). Rodar: npm run test:photo-collage
import test from 'node:test'
import assert from 'node:assert/strict'
import { photoCollageLayout } from '../src/lib/photoCollage.ts'

test('1 foto inteira, 2 uma em cima e uma embaixo, 3 uma larga e duas, 4+ duas, uma e o "+N"', () => {
    assert.deepEqual(photoCollageLayout(1), { shape: 'one', tiles: 1, extra: 0 })
    assert.deepEqual(photoCollageLayout(2), { shape: 'two', tiles: 2, extra: 0 })
    assert.deepEqual(photoCollageLayout(3), { shape: 'three', tiles: 3, extra: 0 })
    assert.deepEqual(photoCollageLayout(4), { shape: 'four', tiles: 4, extra: 1 })
    assert.deepEqual(photoCollageLayout(6), { shape: 'four', tiles: 4, extra: 3 })
    assert.equal(photoCollageLayout(10).extra, 7)
})
test('sem foto ou número ruim não desenha nada nem quebra', () => {
    for (const bad of [0, -3, NaN, undefined, null]) assert.equal(photoCollageLayout(bad).tiles, 0, String(bad))
    assert.equal(photoCollageLayout(2.9).tiles, 2)
})
test('o "+N" é sempre o que sobra além das 3 fotos inteiras', () => {
    for (let n = 4; n <= 12; n++) assert.equal(photoCollageLayout(n).extra, n - 3)
})
