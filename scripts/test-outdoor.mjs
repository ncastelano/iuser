// Testes das regras puras do Outdoor (src/modules/outdoor/domain.ts). Rodar: npm run test:outdoor
import test from 'node:test'
import assert from 'node:assert/strict'
import { outdoorFromRow, outdoorHref, medalOf, pointsLabel, pointsById, OUTDOOR_INFO, OUTDOOR_KINDS } from '../src/modules/outdoor/domain.ts'

test('linha do banco → item; sem id, nome ou slug é descartada', () => {
    assert.equal(outdoorFromRow(null), null)
    assert.equal(outdoorFromRow({ id: 'a', name: 'Loja' }), null)
    assert.equal(outdoorFromRow({ slug: 'x', name: 'Loja' }), null)
    const i = outdoorFromRow({ id: 'a', slug: 'loja', name: 'Loja', image: 'l.png', points: '12.4', rank: 2 })
    assert.deepEqual(i, { id: 'a', slug: 'loja', ownerSlug: null, name: 'Loja', image: 'l.png', points: 12, rank: 2 })
    assert.equal(outdoorFromRow({ id: 'a', slug: 's', name: 'N', points: -5, rank: 0 }).points, 0)
    assert.equal(outdoorFromRow({ id: 'a', slug: 's', name: 'N', rank: 0 }).rank, 1)
})
test('destino de cada tipo', () => {
    const base = { id: 'a', slug: 'x', ownerSlug: null, name: 'N', image: null, points: 1, rank: 1 }
    assert.equal(outdoorHref('lojas', base), '/x')
    assert.equal(outdoorHref('pessoas', base), '/x')
    assert.equal(outdoorHref('imoveis', base), '/imoveis/x')
    assert.equal(outdoorHref('produtos', base), null)
    assert.equal(outdoorHref('servicos', { ...base, ownerSlug: 'dono' }), '/dono/x')
    assert.equal(outdoorHref('digitais', { ...base, ownerSlug: 'loja' }), '/loja/x')
    assert.equal(outdoorHref('digitais', base), null)
    assert.equal(outdoorHref('motoristas', base), '/x')   // o @ do veículo
})
test('são sete Outdoors, cada um com o seu tipo', () => {
    assert.deepEqual([...OUTDOOR_KINDS].sort(), ['digitais', 'imoveis', 'lojas', 'motoristas', 'pessoas', 'produtos', 'servicos'])
    assert.equal(new Set(OUTDOOR_KINDS.map((k) => OUTDOOR_INFO[k].title)).size, 7)
})
test('medalhas: só os três primeiros', () => {
    assert.deepEqual([1, 2, 3, 4, 0].map(medalOf), ['gold', 'silver', 'bronze', null, null])
})
test('pontos por extenso e em mil', () => {
    assert.equal(pointsLabel(0), '0 pts')
    assert.equal(pointsLabel(-4), '0 pts')
    assert.equal(pointsLabel(6384), '6.384 pts')
    assert.equal(pointsLabel(250000), '250 mil pts')
})
test('mapa id → pontos', () => {
    assert.deepEqual(pointsById([{ id: 'a', points: 3 }, { id: 'b', points: 9 }]), { a: 3, b: 9 })
})
test('todo tipo tem título, cor e bucket', () => {
    for (const k of OUTDOOR_KINDS) {
        const i = OUTDOOR_INFO[k]
        assert.ok(i.title.startsWith('Outdoor '), k)
        assert.match(i.color, /^#[0-9a-f]{6}$/i)
        assert.ok(i.bucket)
    }
})
