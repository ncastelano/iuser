// Testes das regras puras do Fórum (src/modules/forum/domain.ts). Rodar: npm run test:forum
// (votos, limites e permissões no banco: supabase/tests/forum_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { sortIdeas, nextVote, applyVote, validateIdea, trending, ago, STATUS_INFO } from '../src/modules/forum/domain.ts'

const now = Date.parse('2026-11-19T12:00:00Z')
const h = (n) => new Date(now - n * 3600_000).toISOString()
const ideas = [
    { id: 'a', up: 10, down: 2, createdAt: h(200) },
    { id: 'b', up: 5, down: 0, createdAt: h(1) },
    { id: 'c', up: 1, down: 0, createdAt: h(0.1) },
]
test('ordenar: mais votadas, novas e em alta', () => {
    assert.deepEqual(sortIdeas(ideas, 'top', now).map((i) => i.id), ['a', 'b', 'c'])
    assert.deepEqual(sortIdeas(ideas, 'new', now).map((i) => i.id), ['c', 'b', 'a'])
    assert.equal(sortIdeas(ideas, 'trending', now)[0].id, 'b')   // nova e com votos passa a antiga
    assert.ok(trending(ideas[1], now) > trending(ideas[0], now))
})
test('voto: tocar de novo tira; trocar move o contador', () => {
    assert.equal(nextVote(0, 1), 1); assert.equal(nextVote(1, 1), 0); assert.equal(nextVote(1, -1), -1)
    const i = { up: 3, down: 1, mine: 1 }
    assert.deepEqual(applyVote(i, -1), { up: 2, down: 2, mine: -1 })
    assert.deepEqual(applyVote(i, 0), { up: 2, down: 1, mine: 0 })
    assert.deepEqual(applyVote({ up: 0, down: 0, mine: 0 }, 1), { up: 1, down: 0, mine: 1 })
})
test('validação e textos', () => {
    assert.ok(validateIdea('oi', ''))
    assert.equal(validateIdea('Modo escuro automático', ''), null)
    assert.ok(validateIdea('x'.repeat(101), ''))
    assert.equal(ago(h(0.5), now), 'há 30 min')
    assert.equal(ago(h(48), now), 'há 2 dias')
    assert.equal(Object.keys(STATUS_INFO).length, 6)
})
