// Testes da matemática da graduação (src/lib/graduation.ts). A regra de verdade roda no banco
// (supabase/tests/graduation_scenarios.sql); aqui só garantimos que a conta em centavos do cliente bate.
// Rodar: npm run test:graduation
import test from 'node:test'
import assert from 'node:assert/strict'
import { commissionCents, bpToPercent, percentToBp, formatPercent, formatCents } from '../src/lib/graduation.ts'

test('Pré-pago R$ 100 × 50% = R$ 50,00', () => assert.equal(commissionCents(10000, 5000), 5000))
test('Pós-pago (quitação) R$ 50 × 50% = R$ 25,00', () => assert.equal(commissionCents(5000, 5000), 2500))
test('R$ 50 × 40% = R$ 20,00 e R$ 100 × 40% = R$ 40,00', () => {
    assert.equal(commissionCents(5000, 4000), 2000)
    assert.equal(commissionCents(10000, 4000), 4000)
})
test('R$ 50 × 70% = R$ 35,00 e R$ 100 × 70% = R$ 70,00', () => {
    assert.equal(commissionCents(5000, 7000), 3500)
    assert.equal(commissionCents(10000, 7000), 7000)
})
test('Arredonda meio pra cima sem ponto flutuante (R$ 0,01 × 50% = R$ 0,01)', () => assert.equal(commissionCents(1, 5000), 1))
test('Comissão personalizada de 62% sobre R$ 100 = R$ 62,00', () => assert.equal(commissionCents(10000, 6200), 6200))
test('Recusa valores que não são inteiros (nada de reais fracionados)', () => {
    assert.throws(() => commissionCents(99.5, 5000))
    assert.throws(() => commissionCents(10000, 50.5))
})
test('Conversões de percentual', () => {
    assert.equal(percentToBp('62'), 6200)
    assert.equal(percentToBp('62,5'), 6250)
    assert.equal(percentToBp('abc') !== percentToBp('abc'), true) // NaN
    assert.equal(bpToPercent(5500), 55)
    assert.equal(formatPercent(5000), '50%')
    assert.equal(formatPercent(5550), '55,5%')
})
test('formatCents', () => assert.match(formatCents(10000).replace(/\s/g, ' '), /R\$\s?100,00/))
