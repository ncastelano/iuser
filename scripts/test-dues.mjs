// Testes das regras puras do caixa do entregador e da contestação (src/modules/dues/domain.ts). Rodar: npm run test:dues
// (prazos, limites, bloqueio e decisões são testados no banco: python3 scripts/local/test-dues.py)
import test from 'node:test'
import assert from 'node:assert/strict'
import { brl, dueAction, dueIn, proofStrength, parseEvidence, OUTCOMES, REASONS } from '../src/modules/dues/domain.ts'

test('dinheiro formatado em reais', () => {
    assert.equal(brl(138.5).replace(/\s/g, ' '), 'R$ 138,50')
    assert.equal(brl(null), 'R$ 0,00')
})
test('o que o entregador deve fazer, por tipo e estado', () => {
    assert.match(dueAction({ kind: 'cash', amount: 130, storeName: 'Pizzaria', status: 'open' }), /Repasse R\$ 130,00 à Pizzaria \(o frete é seu\)/)
    assert.match(dueAction({ kind: 'machine', amount: null, storeName: 'Pizzaria', status: 'open' }), /Devolva a maquininha/)
    assert.match(dueAction({ kind: 'dispute_debt', amount: 50, storeName: 'Pizzaria', status: 'open' }), /entrega contestada/)
    assert.match(dueAction({ kind: 'cash', amount: 1, storeName: 'P', status: 'declared' }), /Esperando a loja confirmar/)
    assert.match(dueAction({ kind: 'cash', amount: 1, storeName: 'P', status: 'disputed' }), /não recebeu/)
})
test('prazo: quanto falta ou quanto passou', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    assert.equal(dueIn(null, now), null)
    assert.equal(dueIn('2026-10-28T12:40:00Z', now), 'em 40 min')
    assert.equal(dueIn('2026-10-28T15:00:00Z', now), 'em 3 h')
    assert.equal(dueIn('2026-10-28T11:20:00Z', now), 'venceu há 40 min')
    assert.equal(dueIn('2026-10-26T12:00:00Z', now), 'venceu há 2 d')
})
test('força da prova para a contestação', () => {
    assert.equal(proofStrength({ proofMethod: 'pin', doneDistM: 12, minutesAtDoor: 2 }).level, 'strong')
    assert.equal(proofStrength({ proofMethod: 'photo', doneDistM: 20, minutesAtDoor: 4 }).level, 'medium')
    assert.equal(proofStrength({ proofMethod: 'photo', doneDistM: 90, minutesAtDoor: 2 }).level, 'weak')
    assert.equal(proofStrength({ proofMethod: null, doneDistM: null, minutesAtDoor: null }).level, 'weak')
    assert.equal(parseEvidence({ proof_method: 'pin', done_dist_m: 8, order_total: '120.5' }).orderTotal, 120.5)
})
test('as decisões do admin são as mesmas do banco', () => {
    assert.deepEqual(OUTCOMES.map((o) => o.code), ['rejected', 'driver_at_fault', 'store_at_fault', 'redelivery'])
    assert.deepEqual(REASONS.map((r) => r.code), ['not_received', 'incomplete', 'other'])
})
