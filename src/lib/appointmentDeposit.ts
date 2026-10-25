// src/lib/appointmentDeposit.ts
//
// Entrada (sinal) no agendamento da loja — só a parte de APRESENTAÇÃO. Quem decide o valor de verdade é o banco (gatilho
// `appointment_deposit_on_insert`, migration 20261116, a partir do preço dos serviços); aqui só se mostra ao cliente o que vai
// acontecer, com a MESMA conta, e se dá nome aos estados. O iUser não movimenta esse dinheiro: Pix direto para a loja.

export type DepositMode = 'none' | 'percent' | 'fixed'
export type DepositStatus = 'none' | 'awaiting' | 'reported' | 'paid' | 'refunded' | 'expired'

export interface DepositConfig { mode: DepositMode; value: number; policy?: string | null }

/** Quanto tempo o horário fica reservado esperando a entrada (igual ao do banco) */
export const DEPOSIT_HOLD_MINUTES = 30

export const parseDepositMode = (v: unknown): DepositMode => (v === 'percent' || v === 'fixed' ? v : 'none')

export function depositConfigOf(row: { deposit_mode?: unknown; deposit_value?: unknown; deposit_policy?: unknown } | null | undefined): DepositConfig {
    const mode = parseDepositMode(row?.deposit_mode)
    return { mode, value: mode === 'none' ? 0 : Number(row?.deposit_value) || 0, policy: (row?.deposit_policy as string | null) || null }
}

/** O mesmo cálculo do banco: porcentagem do total (arredondada em centavos) ou valor fixo limitado ao total. */
export function previewDeposit(cfg: DepositConfig, total: number): number {
    if (cfg.mode === 'none' || cfg.value <= 0) return 0
    if (cfg.mode === 'percent') return total > 0 ? Math.round(total * cfg.value) / 100 : 0
    return total > 0 && cfg.value > total ? total : cfg.value
}

export function depositRuleLabel(cfg: DepositConfig): string {
    if (cfg.mode === 'percent') return cfg.value >= 100 ? 'Pagamento do valor total na hora de agendar' : `Entrada de ${cfg.value}% do valor`
    if (cfg.mode === 'fixed') return `Entrada de ${cfg.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por agendamento`
    return 'Sem entrada'
}

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
    none: '',
    awaiting: 'Aguardando entrada',
    reported: 'Pagamento informado, aguardando a loja confirmar',
    paid: 'Entrada paga',
    refunded: 'Entrada devolvida',
    expired: 'Entrada não paga no prazo',
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
