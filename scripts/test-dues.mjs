// Testes das regras puras do caixa do entregador e da contestação (src/modules/dues/domain.ts). Rodar: npm run test:dues
// (prazos, limites, bloqueio e decisões são testados no banco: python3 scripts/local/test-dues.py)
import test from 'node:test'
import assert from 'node:assert/strict'
import { brl, dueAction, dueIn, proofStrength, parseEvidence, OUTCOMES, REASONS, balanceSide, balanceText, canSettle } from '../src/modules/dues/domain.ts'

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

test('frete que a loja deve ao entregador', () => {
    assert.match(dueAction({ kind: 'freight', amount: 8, storeName: 'Pizzaria', status: 'open' }).replace(/\s/g, ' '), /Pizzaria te deve R\$ 8,00 de frete/)
    assert.match(dueAction({ kind: 'freight', amount: 8, storeName: 'Pizzaria', status: 'declared' }), /Confirme se recebeu/)
})
test('acerto pelo saldo: quem paga e quanto', () => {
    assert.deepEqual(balanceSide({ net: 34 }), { payer: 'driver', amount: 34 })
    assert.deepEqual(balanceSide({ net: -16 }), { payer: 'store', amount: 16 })
    assert.deepEqual(balanceSide({ net: 0.001 }), { payer: 'none', amount: 0 })
    const b = { storeName: 'Pizzaria', driverName: 'Rafa Souza', driverOwes: 42, storeOwes: 8, net: 34, items: 2 }
    assert.match(balanceText(b, 'driver').replace(/\s/g, ' '), /^Você paga R\$ 34,00 a Pizzaria \(dinheiro de pedidos R\$ 42,00 − fretes R\$ 8,00\)/)
    assert.match(balanceText(b, 'store').replace(/\s/g, ' '), /^Rafa te paga R\$ 34,00/)
    assert.equal(canSettle(b, 'driver'), true)
    assert.equal(canSettle(b, 'store'), false, 'a loja não declara um saldo que não deve')
    assert.equal(canSettle({ net: 0, items: 2 }, 'store'), true, 'saldo zero: qualquer um acerta')
    assert.equal(canSettle({ net: 0, items: 0 }, 'store'), false, 'nada em aberto')
})
