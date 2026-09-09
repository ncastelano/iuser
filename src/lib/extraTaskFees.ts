// src/lib/extraTaskFees.ts
//
// Tabela de valor extra por tempo gasto em tarefas do motorista fora de
// dirigir — subir com o passageiro/objeto até o apartamento, espera parada,
// carregar objeto pesado. Cobrado por faixa de tempo, não por tipo de
// tarefa: o que importa pro motorista é quanto tempo ele ficou parado
// trabalhando, não o motivo específico.

export interface ExtraTaskFeeTier {
    maxMinutes: number | null // null = sem limite (última faixa)
    label: string
    fee: number
}

export const EXTRA_TASK_FEE_TIERS: ExtraTaskFeeTier[] = [
    { maxMinutes: 5, label: 'Até 5 min', fee: 3 },
    { maxMinutes: 15, label: '6 a 15 min', fee: 7 },
    { maxMinutes: 30, label: '16 a 30 min', fee: 12 },
    { maxMinutes: null, label: 'Acima de 30 min', fee: 12 },
]

const PER_EXTRA_MINUTE_ABOVE_30 = 0.5

export function computeExtraTaskFee(minutes: number): number {
    if (minutes <= 0) return 0
    if (minutes <= 30) {
        const tier = EXTRA_TASK_FEE_TIERS.find((t) => t.maxMinutes !== null && minutes <= t.maxMinutes)
        return tier ? tier.fee : 0
    }
    return 12 + Math.ceil(minutes - 30) * PER_EXTRA_MINUTE_ABOVE_30
}

export function describeExtraTaskFee(minutes: number): string {
    const fee = computeExtraTaskFee(minutes)
    return `${minutes} min → R$ ${fee.toFixed(2)}`
}
