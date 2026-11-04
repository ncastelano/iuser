// Testes das regras puras da busca da home (src/modules/search/domain.ts). Rodar: npm run test:search
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTerm, isRecordable, addRecent, removeRecent, parseRecent, trendFromRow, trendSection, peopleLabel, MAX_RECENT } from '../src/modules/search/domain.ts'

test('termo limpo: espaços colapsados e no máximo 40 letras', () => {
    assert.equal(cleanTerm('  pizza   de  calabresa '), 'pizza de calabresa')
    assert.equal(cleanTerm('x'.repeat(80)).length, 40)
    assert.equal(cleanTerm(null), '')
})
test('o que vale como busca', () => {
    assert.equal(isRecordable('pizza'), true)
    assert.equal(isRecordable('açaí 500ml'), true)
    for (const bad of ['a', '', '  ', 'joao@x.com', '@ana', 'https://x.com', 'www.site', '11999998888', '123456', '12345 a', '!!!', 'a/b'])
        assert.equal(isRecordable(bad), false, bad)
})
test('histórico: o mais novo primeiro, sem repetir (ignora acento e maiúscula) e com limite', () => {
    let l = []
    l = addRecent(l, 'pizza'); l = addRecent(l, 'Açaí'); l = addRecent(l, 'PIZZA')
    assert.deepEqual(l, ['PIZZA', 'Açaí'])
    l = addRecent(l, 'acai')
    assert.deepEqual(l, ['acai', 'PIZZA'])
    assert.deepEqual(addRecent(l, 'a'), l)
    let many = []
    for (let i = 0; i < 30; i++) many = addRecent(many, `termo ${String.fromCharCode(97 + (i % 26))}${i}`)
    assert.equal(many.length, MAX_RECENT)
})
test('remover do histórico', () => {
    assert.deepEqual(removeRecent(['a b', 'c d'], 'a b'), ['c d'])
})
test('ler o histórico guardado não confia no que está lá', () => {
    assert.deepEqual(parseRecent(null), [])
    assert.deepEqual(parseRecent('lixo{'), [])
    assert.deepEqual(parseRecent('{"a":1}'), [])
    assert.deepEqual(parseRecent(JSON.stringify(['pizza', 5, null, 'x@y.com', 'bolo'])), ['pizza', 'bolo'])
})
test('linha do banco → tendência', () => {
    assert.equal(trendFromRow(null), null)
    assert.equal(trendFromRow({ term: '  ' }), null)
    assert.deepEqual(trendFromRow({ term: 'pizza', people: '12', place: 'Porto Velho' }), { term: 'pizza', people: 12, place: 'Porto Velho' })
    assert.equal(trendFromRow({ term: 'pizza', people: -3 }).people, 0)
})
test('títulos das listas', () => {
    assert.equal(trendSection('global', null).title, 'Mais buscadas no iUser')
    assert.equal(trendSection('city', 'Porto Velho').title, 'Em alta em Porto Velho')
    assert.equal(trendSection('state', 'Rondônia').title, 'Em alta em Rondônia')
    assert.match(trendSection('following', null).subtitle, /3 pessoas/)
})
test('pessoas no singular e plural', () => {
    assert.equal(peopleLabel(1), '1 pessoa')
    assert.equal(peopleLabel(34), '34 pessoas')
})

import { hitFromRow, groupHits, totalOf, RESULT_ORDER, RESULT_INFO } from '../src/modules/search/domain.ts'
const row = (o) => ({ kind: 'produto', id: 'a', title: 'Pizza', subtitle: 'em Loja', image: 'p.jpg', bucket: 'product-images', href: '/loja/pizza', extra: 'R$ 10,00', total: 4, ...o })
test('resultado da busca ampla: descarta o que não é seguro ou não tem nome', () => {
    assert.equal(hitFromRow(null), null)
    assert.equal(hitFromRow(row({ kind: 'estranho' })), null)
    assert.equal(hitFromRow(row({ title: '  ' })), null)
    assert.equal(hitFromRow(row({ href: 'https://golpe.com' })), null)
    assert.equal(hitFromRow(row({ href: '//golpe.com' })), null)
    const h = hitFromRow(row({ total: '0' }))
    assert.equal(h.total, 1)
    assert.equal(h.href, '/loja/pizza')
})
test('agrupar: ordem fixa, tipo vazio some e o total vem do banco', () => {
    const hits = [row({ kind: 'flash', id: 'f', href: '/flash?de=f', total: 9 }), row({ kind: 'loja', id: 'l', href: '/x', total: 1 }), row({ kind: 'produto', id: 'p1', total: 4 }), row({ kind: 'produto', id: 'p2', total: 4 })].map(hitFromRow)
    const g = groupHits(hits)
    assert.deepEqual(g.map((x) => x.kind), ['loja', 'produto', 'flash'])
    assert.equal(g[1].total, 4)
    assert.equal(totalOf(g), 1 + 4 + 9)
})
test('todo tipo de resultado tem rótulo e cor', () => {
    for (const k of RESULT_ORDER) { assert.ok(RESULT_INFO[k].label && RESULT_INFO[k].plural); assert.match(RESULT_INFO[k].color, /^#[0-9a-f]{6}$/i) }
})
