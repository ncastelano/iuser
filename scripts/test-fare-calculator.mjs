// Testes das fórmulas da calculadora de tarifa (src/lib/fareCalculator.ts).
// Rodar: node --test scripts/test-fare-calculator.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    VELOCIDADE_MEDIA_KMH,
    calculateFare,
    calculateTimeFromDistance,
    calculateDistanceFromTime,
    calculateHourlyEarning,
    calculateRequiredPricePerKm,
    calculateSimulationTable,
    calculateGoalComparison,
    formatBRL,
    formatDuration,
    formatKm,
    parseNumberInput,
    validateDistanceInput,
    validateMinutesInput,
    validateGoalInput,
} from '../src/lib/fareCalculator.ts'

const IUSER = { baseDistanceKm: 5, baseFee: 7, pricePerKm: 2 }
const CUSTOM = { baseDistanceKm: 5, baseFee: 10, pricePerKm: 2.5 }

test('velocidade fixa em 40 km/h', () => assert.equal(VELOCIDADE_MEDIA_KMH, 40))

test('valor da corrida — tarifa iUser (5 km = R$ 7, +R$ 2/km)', () => {
    assert.equal(calculateFare(5, IUSER), 7)
    assert.equal(calculateFare(3, IUSER), 7) // menor que a base: valor base
    assert.equal(calculateFare(10, IUSER), 17)
    assert.equal(calculateFare(15, IUSER), 27)
    assert.equal(calculateFare(20, IUSER), 37)
    assert.equal(calculateFare(40, IUSER), 77)
})

test('valor da corrida — tarifa personalizada (5 km = R$ 10, +R$ 2,50/km)', () => {
    assert.equal(calculateFare(10, CUSTOM), 22.5)
    assert.equal(calculateFare(20, CUSTOM), 47.5)
    assert.equal(calculateFare(40, CUSTOM), 97.5)
})

test('tempo: 1 km = 1min30s (40 km/h)', () => {
    assert.equal(calculateTimeFromDistance(40), 60)
    assert.equal(calculateTimeFromDistance(20), 30)
    assert.equal(calculateTimeFromDistance(10), 15)
    assert.equal(calculateTimeFromDistance(5), 7.5)
    assert.equal(calculateTimeFromDistance(1), 1.5)
    assert.equal(calculateTimeFromDistance(15), 22.5)
    assert.equal(calculateTimeFromDistance(50), 75)
})

test('distância a partir do tempo', () => {
    assert.equal(calculateDistanceFromTime(30), 20)
    assert.equal(calculateDistanceFromTime(60), 40)
    assert.equal(calculateDistanceFromTime(15), 10)
})

test('rendimento por hora = valor × 40 ÷ distância (não valor × 40)', () => {
    assert.equal(calculateHourlyEarning(5, 7), 56)
    assert.equal(calculateHourlyEarning(10, 17), 68)
    assert.equal(calculateHourlyEarning(15, 27), 72)
    assert.equal(calculateHourlyEarning(20, 37), 74)
    assert.equal(calculateHourlyEarning(30, 57), 76)
    assert.equal(calculateHourlyEarning(40, 77), 77)
    // personalizada
    assert.equal(calculateHourlyEarning(10, 22.5), 90)
    assert.equal(calculateHourlyEarning(20, 47.5), 95)
    assert.equal(calculateHourlyEarning(40, 97.5), 97.5)
})

test('modo por tempo: 30 min → 20 km → R$ 37 → R$ 74/h', () => {
    const km = calculateDistanceFromTime(30)
    const fare = calculateFare(km, IUSER)
    assert.equal(km, 20)
    assert.equal(fare, 37)
    assert.equal(calculateHourlyEarning(km, fare), 74)
})

test('meta por hora: R$ 100/h → R$ 2,50/km', () => {
    assert.equal(calculateRequiredPricePerKm(100), 2.5)
    const cmp = calculateGoalComparison(IUSER, 100)
    assert.equal(cmp.requiredPricePerKm, 2.5)
    assert.equal(cmp.fare40, 77)
    assert.equal(cmp.currentPerHour, 77)
    assert.equal(cmp.reached, false)
    assert.equal(cmp.missingPerHour, 23)
    assert.deepEqual(cmp.examples, [
        { distanceKm: 10, fare: 25 },
        { distanceKm: 20, fare: 50 },
        { distanceKm: 30, fare: 75 },
        { distanceKm: 40, fare: 100 },
    ])
    // tarifa personalizada (R$ 97,50/h) ainda não bate R$ 100/h; bate R$ 90/h
    assert.equal(calculateGoalComparison(CUSTOM, 100).reached, false)
    assert.equal(calculateGoalComparison(CUSTOM, 90).reached, true)
    assert.equal(calculateGoalComparison(CUSTOM, 90).missingPerHour, 0)
})

test('tabela de simulação gerada da tarifa', () => {
    const t = calculateSimulationTable(IUSER)
    assert.deepEqual(t.map((r) => [r.distanceKm, r.minutes, r.fare, r.perHour]), [
        [5, 7.5, 7, 56],
        [10, 15, 17, 68],
        [15, 22.5, 27, 72],
        [20, 30, 37, 74],
        [30, 45, 57, 76],
        [40, 60, 77, 77],
    ])
    // muda junto com a tarifa
    assert.equal(calculateSimulationTable(CUSTOM)[1].fare, 22.5)
})

test('sem erro de ponto flutuante', () => {
    assert.equal(calculateFare(10.3, { baseDistanceKm: 0, baseFee: 0.1, pricePerKm: 0.2 }), 2.16) // 0,1 + 10,3 × 0,2
    assert.equal(calculateFare(12.35, IUSER), 7 + 14.7)
})

test('casos especiais: zero, negativo, NaN e divisão por zero', () => {
    assert.equal(calculateHourlyEarning(0, 10), null)
    assert.equal(calculateHourlyEarning(-5, 10), null)
    assert.equal(calculateRequiredPricePerKm(0), null)
    assert.equal(calculateRequiredPricePerKm(-10), null)
    assert.equal(calculateGoalComparison(IUSER, 0), null)
    assert.equal(calculateFare(0, IUSER), 7)
    assert.equal(calculateFare(-3, IUSER), 7)
    assert.equal(calculateFare(NaN, IUSER), 7)
    assert.equal(calculateTimeFromDistance(-1), 0)
    assert.equal(calculateDistanceFromTime(0), 0)
    // tarifa zerada e distância base zero
    assert.equal(calculateFare(10, { baseDistanceKm: 5, baseFee: 0, pricePerKm: 0 }), 0)
    assert.equal(calculateFare(10, { baseDistanceKm: 0, baseFee: 7, pricePerKm: 2 }), 27)
    assert.equal(calculateFare(10, { baseDistanceKm: NaN, baseFee: NaN, pricePerKm: NaN }), 0)
})

test('formatação amigável', () => {
    assert.equal(formatBRL(7), 'R$ 7,00')
    assert.equal(formatBRL(17.5), 'R$ 17,50')
    assert.equal(formatBRL(100), 'R$ 100,00')
    assert.equal(formatBRL(1234.5), 'R$ 1.234,50')
    assert.equal(formatDuration(30), '30 min')
    assert.equal(formatDuration(45), '45 min')
    assert.equal(formatDuration(60), '1h')
    assert.equal(formatDuration(75), '1h 15min')
    assert.equal(formatDuration(22.5), '22min 30s')
    assert.equal(formatDuration(7.5), '7min 30s')
    assert.equal(formatDuration(1.5), '1min 30s')
    assert.equal(formatKm(15), '15 km')
    assert.equal(formatKm(2.5), '2,5 km')
    assert.equal(formatKm(12.35), '12,35 km')
})

test('leitura e validação do que o motorista digita', () => {
    assert.deepEqual(parseNumberInput('15'), { value: 15 })
    assert.deepEqual(parseNumberInput('15,5'), { value: 15.5 })
    assert.deepEqual(parseNumberInput('12.5'), { value: 12.5 })
    assert.deepEqual(parseNumberInput('1.234,5'), { value: 1234.5 })
    assert.deepEqual(parseNumberInput('  '), { empty: true })
    assert.ok('error' in parseNumberInput('abc'))
    assert.ok('error' in validateDistanceInput('-3'))
    assert.ok('error' in validateDistanceInput('0'))
    assert.ok('error' in validateDistanceInput('99999'))
    assert.deepEqual(validateDistanceInput('2,5'), { value: 2.5 })
    assert.ok('error' in validateMinutesInput('0'))
    assert.ok('error' in validateGoalInput('0'))
    assert.ok('empty' in validateGoalInput(''))
})
