// npm run test:store-presence — "Agora na sua loja" (src/modules/store-presence/domain.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sanitizeState, flatten, resumir, frase } from '../src/modules/store-presence/domain.ts'

test('só passa etapa válida, rótulo curto e a hora — nada de identidade', () => {
    assert.equal(sanitizeState({ stage: 'hacker', label: 'x' }), null)
    const s = sanitizeState({ stage: 'produto', label: '  Pizza   grande '.padEnd(90, 'x'), at: 5, name: 'Ana', slug: 'ana' })
    assert.deepEqual(Object.keys(s).sort(), ['at', 'label', 'stage'])
    assert.equal(s.label.length, 60)
    assert.ok(s.label.startsWith('Pizza grande'))
})
test('uma linha por aparelho (a mais recente) e o resumo por etapa', () => {
    const rows = flatten({ a: [{ stage: 'loja', at: 1 }, { stage: 'sacola', at: 9 }], b: [{ stage: 'produto', label: 'Pizza', at: 3 }], c: [{ stage: 'ouvindo', label: 'Faixa 1', at: 4 }], d: [{ stage: '??' }] })
    assert.equal(rows.length, 3)
    assert.equal(rows.find((r) => r.key === 'a').stage, 'sacola')
    const r = resumir(rows)
    assert.equal(r.total, 3)
    assert.equal(r.porEtapa.sacola, 1)
    assert.equal(r.conteudoAgora, 1)
    assert.deepEqual(r.maisVistos.map((m) => m.label), ['Faixa 1', 'Pizza'])
})
test('a frase do feed é anônima', () => {
    assert.equal(frase({ stage: 'produto', label: 'Pizza', at: 0 }), 'Alguém está vendo “Pizza”')
    assert.equal(frase({ stage: 'sacola', label: 'Pizza', at: 0 }), 'Alguém está com itens na sacola')
})
test('o gancho de aviso não manda nome, @ nem foto', () => {
    const src = readFileSync('src/modules/store-presence/live.ts', 'utf8')
    assert.ok(!/profileSlug|avatar|userId|name:/.test(src))
})
