// src/modules/tips/domain.ts — regras puras da GORJETA / "APOIAR O ARTISTA": faixa de valores, leitura do que a pessoa digita, textos e estados. Sem React nem rede; testado em scripts/test-tips.mjs.
// O dinheiro vai por Pix direto para a loja (o iUser só registra o que cada um declara); as regras de verdade (faixa, limite por hora, quem decide) moram no banco (migration 20261130000029).

export const TIP_MIN_CENTS = 100          // R$ 1,00
export const TIP_MAX_CENTS = 100000       // R$ 1.000,00
export const TIP_MESSAGE_MAX = 140
/** Valores de um toque */
export const TIP_PRESETS = [500, 1000, 2000, 5000]

export type TipStatus = 'awaiting' | 'reported' | 'confirmed' | 'refused' | 'expired'
export const TIP_STATUS_LABEL: Record<TipStatus, string> = {
    awaiting: 'Esperando o Pix',
    reported: 'A conferir',
    confirmed: 'Recebido',
    refused: 'Não recebido',
    expired: 'Expirou',
}

/** "R$ 10,00" a partir de centavos */
export function formatCents(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
}

/** O que a pessoa digitou ("7,5", "7.50", "R$ 12") → centavos; null se não der para entender */
export function parseAmountCents(text: string): number | null {
    const t = text.replace(/R\$|\s/g, '').trim()
    if (!t || !/^\d{1,6}([.,]\d{0,2})?$/.test(t)) return null
    const n = Number(t.replace(',', '.'))
    if (!Number.isFinite(n)) return null
    return Math.round(n * 100)
}

/** Mensagem de erro (ou null se pode) para um valor em centavos */
export function validateTipAmount(cents: number | null): string | null {
    if (cents == null) return 'Digite um valor.'
    if (cents < TIP_MIN_CENTS) return 'O valor mínimo é R$ 1,00.'
    if (cents > TIP_MAX_CENTS) return 'O valor máximo é R$ 1.000,00.'
    return null
}

/** "12 apoiadores" */
export function supportersLabel(n: number): string {
    if (n <= 0) return ''
    return `${n} ${n === 1 ? 'apoiador' : 'apoiadores'}`
}

export const PIX_TYPE_LABEL: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'e-mail', phone: 'celular', random: 'aleatória' }
