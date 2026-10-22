// Texto da tarifa do motorista (src/lib/tariffSummary.ts). Rodar: npm run test:tariff-summary
import test from 'node:test'
import assert from 'node:assert/strict'
import { tariffLine, hourlyLine, money } from '../src/lib/tariffSummary.ts'

const t = (baseDistanceKm, baseFee = 7, pricePerKm = 2) => ({ baseDistanceKm, baseFee, pricePerKm })

test('5 km incluídos: 10 km = R$ 17', () => {
    assert.equal(tariffLine(t(5)), 'Até 5 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 17')
})

test('3 km incluídos: 10 km = R$ 21 (o exemplo acompanha a franquia)', () => {
    assert.equal(tariffLine(t(3)), 'Até 3 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 21')
})

test('por hora: valor e nº de corridas acompanham a tarifa (40 km/h)', () => {
    assert.equal(hourlyLine(t(3)), 'Em 1 hora: cerca de R$ 84 com 4 corridas de 10 km')
    assert.equal(hourlyLine(t(5)), 'Em 1 hora: cerca de R$ 68 com 4 corridas de 10 km')
})

test('mudar base e preço por km recalcula tudo', () => {
    assert.equal(tariffLine(t(3, 8, 2.5)), 'Até 3 km: R$ 8 • Depois: + R$ 2,50 por km • Ex.: 10 km = R$ 25,50')
    assert.equal(hourlyLine(t(3, 8, 2.5)), 'Em 1 hora: cerca de R$ 102 com 4 corridas de 10 km')
})

test('exemplo dentro da franquia cobra só o valor inicial', () => {
    assert.equal(tariffLine(t(12)), 'Até 12 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 7')
})

test('dinheiro: inteiro sem centavos, quebrado com vírgula', () => {
    assert.equal(money(7), 'R$ 7')
    assert.equal(money(7.5), 'R$ 7,50')
})
