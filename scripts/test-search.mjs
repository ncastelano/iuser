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
