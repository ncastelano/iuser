// src/lib/fareCalculator.ts
//
// Calculadora de tarifa do motorista: DISTÂNCIA ↔ TEMPO ↔ VALOR ↔ RENDIMENTO POR HORA.
// Tudo parte de uma velocidade média de referência FIXA de 40 km/h (não editável): ela
// serve só pra converter km em tempo e comparar corridas entre si, não prevê o trânsito.
//
// Funções puras, sem dependência de React/Supabase (testadas em scripts/test-fare-calculator.mjs).
// O dinheiro é calculado em centavos inteiros e só vira reais no fim, pra não aparecer
// erro de ponto flutuante (0,1 + 0,2).
//
// Não inclui (de propósito, primeira versão): comissão, combustível, manutenção, impostos,
// espera, preço dinâmico, tarifa mínima/de retorno. Os extras por tipo/condição da Tarifa iUser
// (pessoa, animal, condomínio...) também ficam de fora: aqui é só base + quilometragem.

/** Velocidade média de referência (km/h). Fixa: não existe campo pra alterar. */
export const VELOCIDADE_MEDIA_KMH = 40

/** Tarifa por distância: até `baseDistanceKm` cobra `baseFee`; acima soma `pricePerKm` por km. */
export interface FareTariff {
    baseDistanceKm: number
    baseFee: number
    pricePerKm: number
}

// Limites pra não aceitar valores absurdos (e evitar overflow/lixo visual)
export const LIMITS = {
    maxDistanceKm: 5000,
    maxMinutes: 60 * 100, // 100 horas
    maxMoney: 100000,
} as const

const toCents = (reais: number) => Math.round(reais * 100)
const fromCents = (cents: number) => cents / 100

/** Número finito e >= 0, senão 0 (tarifa com campo vazio/NaN/negativo vira 0 em vez de quebrar a conta). */
const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/** Valor da corrida (R$) pela tarifa: base até a distância base, + km excedente × valor/km. */
export function calculateFare(distanceKm: number, tariff: FareTariff): number {
    const d = safe(distanceKm)
    const baseDistance = safe(tariff.baseDistanceKm)
    const baseCents = toCents(safe(tariff.baseFee))
    if (d <= baseDistance) return fromCents(baseCents)
    const extraCents = Math.round((d - baseDistance) * toCents(safe(tariff.pricePerKm)))
    return fromCents(baseCents + extraCents)
}

/** Tempo em minutos de uma distância a 40 km/h (= km × 1,5). */
export function calculateTimeFromDistance(distanceKm: number): number {
    return (safe(distanceKm) / VELOCIDADE_MEDIA_KMH) * 60
}

/** Distância em km que cabe em N minutos a 40 km/h. */
export function calculateDistanceFromTime(minutes: number): number {
    return (safe(minutes) / 60) * VELOCIDADE_MEDIA_KMH
}

/**
 * Rendimento equivalente por hora: valor ÷ tempo em horas = valor × 40 ÷ distância.
 * É o faturamento que daria se fosse possível fazer corridas seguidas nessa mesma proporção
 * de valor e distância, sem tempo parado. Null se a distância for 0 (não existe tempo).
 */
export function calculateHourlyEarning(distanceKm: number, fare: number): number | null {
    const d = safe(distanceKm)
    if (d <= 0) return null
    return fromCents(Math.round((toCents(safe(fare)) * VELOCIDADE_MEDIA_KMH) / d))
}

/** Quanto precisa cobrar por km pra render `goalPerHour` por hora a 40 km/h (meta ÷ 40). Null se a meta for 0. */
export function calculateRequiredPricePerKm(goalPerHour: number): number | null {
    const g = safe(goalPerHour)
    if (g <= 0) return null
    return fromCents(Math.round(toCents(g) / VELOCIDADE_MEDIA_KMH))
}

export interface SimulationRow {
    distanceKm: number
    minutes: number
    fare: number
    perHour: number | null
}

export const SIMULATION_DISTANCES_KM = [5, 10, 15, 20, 30, 40]

/** Tabela distância → tempo → valor → R$/h, gerada a partir da tarifa informada. */
export function calculateSimulationTable(tariff: FareTariff, distances: number[] = SIMULATION_DISTANCES_KM): SimulationRow[] {
    return distances.map((distanceKm) => {
        const fare = calculateFare(distanceKm, tariff)
        return { distanceKm, minutes: calculateTimeFromDistance(distanceKm), fare, perHour: calculateHourlyEarning(distanceKm, fare) }
    })
}

export interface GoalComparison {
    goalPerHour: number
    /** Valor por km necessário pra bater a meta (a 40 km/h) */
    requiredPricePerKm: number
    /** Valor da corrida de referência de 40 km (1 hora) com a tarifa atual */
    fare40: number
    /** Rendimento por hora da tarifa atual na corrida de referência de 40 km (= fare40) */
    currentPerHour: number
    reached: boolean
    /** Quanto falta (R$/h) pra bater a meta; 0 se já bate */
    missingPerHour: number
    /** Exemplos de valor por distância pra render exatamente a meta: 10, 20, 30 e 40 km */
    examples: { distanceKm: number; fare: number }[]
}

export const GOAL_EXAMPLE_DISTANCES_KM = [10, 20, 30, 40]

/**
 * Compara a tarifa atual com a meta por hora, usando a corrida de referência de 40 km
 * (exatamente 1 hora a 40 km/h). Não altera nenhuma tarifa: é só simulação.
 */
export function calculateGoalComparison(tariff: FareTariff, goalPerHour: number): GoalComparison | null {
    const required = calculateRequiredPricePerKm(goalPerHour)
    if (required == null) return null
    const fare40 = calculateFare(VELOCIDADE_MEDIA_KMH, tariff)
    const current = calculateHourlyEarning(VELOCIDADE_MEDIA_KMH, fare40) as number
    const goalCents = toCents(goalPerHour)
    return {
        goalPerHour: fromCents(goalCents),
        requiredPricePerKm: required,
        fare40,
        currentPerHour: current,
        reached: toCents(current) >= goalCents,
        missingPerHour: Math.max(0, fromCents(goalCents - toCents(current))),
        examples: GOAL_EXAMPLE_DISTANCES_KM.map((distanceKm) => ({
            distanceKm,
            fare: fromCents(Math.round((goalCents * distanceKm) / VELOCIDADE_MEDIA_KMH)),
        })),
    }
}

// ---------- Apresentação ----------

/** "R$ 17,50" */
export function formatBRL(value: number): string {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "12,35 km", "5 km" — até 2 casas, sem zeros sobrando */
export function formatKm(km: number): string {
    return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`
}

/** "7min 30s", "30 min", "1h", "1h 15min", "22min 30s" */
export function formatDuration(minutes: number): string {
    const totalSeconds = Math.round(safe(minutes) * 60)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    if (h === 0) {
        if (s === 0) return `${m} min`
        return m === 0 ? `${s}s` : `${m}min ${s}s`
    }
    const parts = [`${h}h`]
    if (m > 0) parts.push(`${m}min`)
    if (s > 0) parts.push(`${s}s`)
    return parts.join(' ')
}

// ---------- Entrada do usuário ----------

export type ParsedInput = { value: number } | { error: string } | { empty: true }

/** Lê "15", "15,5", "1.234,5" ou "12.5" digitado pelo motorista. Vazio → { empty }. */
export function parseNumberInput(raw: string): { value: number } | { empty: true } | { error: string } {
    const text = raw.trim()
    if (text === '') return { empty: true }
    // pt-BR: "1.234,5" (ponto = milhar, vírgula = decimal). Sem vírgula, o ponto é decimal ("12.5").
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
    if (!/^-?\d*\.?\d+$/.test(normalized)) return { error: 'Digite só números.' }
    return { value: Number(normalized) }
}

function validatePositive(raw: string, max: number, unit: string): ParsedInput {
    const parsed = parseNumberInput(raw)
    if ('empty' in parsed || 'error' in parsed) return parsed
    if (parsed.value < 0) return { error: 'O valor não pode ser negativo.' }
    if (parsed.value === 0) return { error: `Informe um valor maior que zero (${unit}).` }
    if (parsed.value > max) return { error: 'Esse valor é grande demais. Confira o número digitado.' }
    return parsed
}

export const validateDistanceInput = (raw: string) => validatePositive(raw, LIMITS.maxDistanceKm, 'km')
export const validateMinutesInput = (raw: string) => validatePositive(raw, LIMITS.maxMinutes, 'minutos')
export const validateGoalInput = (raw: string) => validatePositive(raw, LIMITS.maxMoney, 'R$ por hora')
