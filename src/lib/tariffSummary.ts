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

/**
 * Como o valor da corrida (só partida → chegada, sem o deslocamento do motorista) sai da tarifa:
 * dentro dos km incluídos paga só a base; depois dela soma o valor por km.
 * "Corrida de 3,6 km (partida → chegada): R$ 7,00 até 3 km + 0,6 km × R$ 2,00 = R$ 8,20."
 */
export function tripFareText(distanceKm: number, tariff: FareTariff): string {
    const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
    const km = (v: number) => `${v.toFixed(1).replace('.', ',')} km`
    const baseKm = `${num(tariff.baseDistanceKm)} km`
    const extraKm = Math.max(0, distanceKm - tariff.baseDistanceKm)
    if (extraKm <= 0) return `Corrida de ${km(distanceKm)} (partida → chegada): dentro dos ${baseKm} da base, ${brl(tariff.baseFee)}.`
    const total = tariff.baseFee + extraKm * tariff.pricePerKm
    return `Corrida de ${km(distanceKm)} (partida → chegada): ${brl(tariff.baseFee)} até ${baseKm} + ${km(extraKm)} × ${brl(tariff.pricePerKm)} = ${brl(total)}.`
}
