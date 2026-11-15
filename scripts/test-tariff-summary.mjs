// Texto da tarifa do motorista (src/lib/tariffSummary.ts). Rodar: npm run test:tariff-summary
import test from 'node:test'
import assert from 'node:assert/strict'
import { tariffLine, hourlyLine, money } from '../src/lib/tariffSummary.ts'
import { ridesInOneHour } from '../src/lib/rideCycle.ts'

const t = (baseDistanceKm, baseFee = 7, pricePerKm = 2) => ({ baseDistanceKm, baseFee, pricePerKm })

test('5 km incluídos: 10 km = R$ 17', () => {
    assert.equal(tariffLine(t(5)), 'Até 5 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 17')
})

test('3 km incluídos: 10 km = R$ 21 (o exemplo acompanha a franquia)', () => {
    assert.equal(tariffLine(t(3)), 'Até 3 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 21')
})

test('por hora, pelo tempo: 10 km = 15 min + 3 min de folga entre corridas → 3 corridas', () => {
    assert.equal(hourlyLine(t(3)), 'Em 1 hora: cerca de R$ 63 com 3 corridas de 10 km')
    assert.equal(hourlyLine(t(5)), 'Em 1 hora: cerca de R$ 51 com 3 corridas de 10 km')
})

test('mudar base e preço por km recalcula tudo', () => {
    assert.equal(tariffLine(t(3, 8, 2.5)), 'Até 3 km: R$ 8 • Depois: + R$ 2,50 por km • Ex.: 10 km = R$ 25,50')
    assert.equal(hourlyLine(t(3, 8, 2.5)), 'Em 1 hora: cerca de R$ 77 com 3 corridas de 10 km')
})

test('quantas corridas cabem em 60 min com 3 min de folga entre elas', () => {
    assert.equal(ridesInOneHour(18), 3) // 18 + 3 + 18 + 3 + 18 = 60
    assert.equal(ridesInOneHour(15), 3) // 15n + 3(n − 1) ≤ 60 → n ≤ 3,5
    assert.equal(ridesInOneHour(19), 2) // 3 corridas dariam 63 min
    assert.equal(ridesInOneHour(60), 1)
    assert.equal(ridesInOneHour(61), 0) // uma só já passa de 1 hora
    assert.equal(ridesInOneHour(0), 0)
})

test('exemplo dentro da franquia cobra só o valor inicial', () => {
    assert.equal(tariffLine(t(12)), 'Até 12 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 7')
})

test('dinheiro: inteiro sem centavos, quebrado com vírgula', () => {
    assert.equal(money(7), 'R$ 7')
    assert.equal(money(7.5), 'R$ 7,50')
})

// Frase que explica o valor da corrida (partida → chegada) nos cards de corridas disponíveis
import { tripFareText } from '../src/lib/tariffSummary.ts'

test('tripFareText: dentro da base paga só a base (3,6 km com base de 5 km = R$ 7,00)', () => {
    assert.equal(tripFareText(3.6, t(5)), 'Corrida de 3,6 km (partida → chegada): dentro dos 5 km da base, R$ 7,00.')
})

test('tripFareText: com base de 3 km os 3,6 km passam da base (R$ 7,00 + 0,6 km × R$ 2,00 = R$ 8,20)', () => {
    assert.equal(tripFareText(3.6, t(3)), 'Corrida de 3,6 km (partida → chegada): R$ 7,00 até 3 km + 0,6 km × R$ 2,00 = R$ 8,20.')
})
