// src/lib/postpaidRules.ts — regras PURAS do limite do Pós-pago (sem React nem Supabase, para testar). O uso nas telas está em `lib/postpaid.ts`.

/** o padrão atual (o mesmo da migration 57); só aparece nas telas enquanto o banco não respondeu */
export const POSTPAID_DEBT_LIMIT = 100
/** o limite que o banco aplica ENQUANTO a migration 57 não foi aplicada */
export const POSTPAID_LEGACY_LIMIT = 50

/** interpreta a resposta de `get_postpaid_debt_limit`: o número do banco; 50 se a função ainda não existe; null se foi falha de rede/outra */
export function interpretLimit(data: unknown, error: { code?: string; message?: string } | null): number | null {
    if (!error) {
        const n = Number(data)
        return Number.isFinite(n) && n > 0 ? n : null
    }
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || '')
    return missing ? POSTPAID_LEGACY_LIMIT : null
}

/** "R$ 100" (sem centavos quando é inteiro) */
export function limitText(limit: number): string {
    return `R$ ${Number.isInteger(limit) ? limit : limit.toFixed(2).replace('.', ',')}`
}

/** quantas vendas de R$ 0,50 cabem no limite (ex.: 200) */
export function salesUntilLimit(limit: number, feePerSale = 0.5): number {
    return Math.floor(limit / feePerSale)
}
