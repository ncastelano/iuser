// src/lib/postpaid.ts — o LIMITE DE DÍVIDA do plano Pós-pago (quando chega nele, a pessoa precisa quitar para continuar).
// A regra de verdade mora no banco (`postpaid_settings.debt_limit`, lida por `get_postpaid_debt_limit()`; migration 20261130000057) e trava
// todas as ações. Este número só ALIMENTA OS TEXTOS e as barras das telas — mantenha igual ao do banco (`npm run test:postpaid-limit` confere).
export const POSTPAID_DEBT_LIMIT = 100

/** "R$ 100" (sem centavos quando é inteiro) */
export function postpaidLimitText(): string {
    return `R$ ${Number.isInteger(POSTPAID_DEBT_LIMIT) ? POSTPAID_DEBT_LIMIT : POSTPAID_DEBT_LIMIT.toFixed(2).replace('.', ',')}`
}

/** quantas vendas de R$ 0,50 cabem no limite (ex.: 200) */
export function salesUntilLimit(feePerSale = 0.5): number {
    return Math.floor(POSTPAID_DEBT_LIMIT / feePerSale)
}
