// src/lib/tariffSummary.ts
//
// Texto curto da tarifa pro motorista (aba Tarifa do /painel-motorista): UMA linha com o valor inicial, os km incluídos,
// o preço por km excedente e um exemplo, e UMA linha com a estimativa por hora. Tudo sai dos números da tarifa (e da
// velocidade média de fareCalculator), então mudar base, km incluídos, preço por km ou velocidade atualiza os textos.
// Conta: valor da corrida = valor base + (km acima dos km incluídos × valor por km excedente).
// Funções puras (testadas em scripts/test-tariff-summary.mjs).
import { calculateFare, calculateTimeFromDistance, type FareTariff } from './fareCalculator.ts'
import { ridesInOneHour } from './rideCycle.ts'

/** Distância do exemplo mostrado ao motorista */
export const EXAMPLE_KM = 10

const num = (n: number, max = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: max })

/** "R$ 7", "R$ 7,50" (sem centavos quando for inteiro) */
export function money(v: number): string {
    const safe = Number.isFinite(v) ? v : 0
    const cents = Math.round(safe * 100)
    return `R$ ${cents % 100 === 0 ? num(cents / 100, 0) : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "Até 3 km: R$ 7 • Depois: + R$ 2 por km • Ex.: 10 km = R$ 21" */
export function tariffLine(tariff: FareTariff, exampleKm = EXAMPLE_KM): string {
    const price = calculateFare(exampleKm, tariff)
    return `Até ${num(tariff.baseDistanceKm)} km: ${money(tariff.baseFee)} • Depois: + ${money(tariff.pricePerKm)} por km • Ex.: ${num(exampleKm)} km = ${money(price)}`
}

/**
 * "Em 1 hora: cerca de R$ 63 com 3 corridas de 10 km" (null se não der pra estimar).
 * Pelo tempo: 10 km a 40 km/h = 15 min; com 3 min de folga entre corridas, 15n + 3(n − 1) ≤ 60 → 3 corridas.
 */
export function hourlyLine(tariff: FareTariff, exampleKm = EXAMPLE_KM): string | null {
    const rides = ridesInOneHour(calculateTimeFromDistance(exampleKm))
    if (rides < 1) return null
    const earning = rides * calculateFare(exampleKm, tariff)
    return `Em 1 hora: cerca de ${money(Math.round(earning))} com ${num(rides, 0)} ${rides === 1 ? 'corrida' : 'corridas'} de ${num(exampleKm)} km`
}
