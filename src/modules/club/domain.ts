// src/modules/club/domain.ts — regras puras do CLUBE DA LOJA PAGO + MÚSICA (migration 20261130000034): preço, vencimento e textos. Sem React nem rede; testado em scripts/test-club.mjs (npm run test:club).
// Quem decide de verdade (preço de R$ 3 a R$ 500, +30 dias por pagamento confirmado, quem ouve o quê) é o banco; aqui só se valida a digitação e se descreve o que ele devolve.

export const CLUB_PERIOD_DAYS = 30
export const CLUB_MIN_CENTS = 300
export const CLUB_MAX_CENTS = 50000
/** Quantos dias antes de vencer o app já avisa "renove" */
export const CLUB_RENEW_WARNING_DAYS = 3

export interface ClubMy { member: boolean; paid: boolean; periodEnd: string | null; active: boolean; musicOk: boolean; openPayment: string | null; openStatus: 'awaiting' | 'reported' | null }
export interface ClubInfo { enabled: boolean; isOwner: boolean; priceCents: number | null; canCharge: boolean; includesMusic: boolean; tracks: number; description: string | null; my: ClubMy | null }
export type ClubPaymentStatus = 'awaiting' | 'reported' | 'confirmed' | 'refused' | 'expired'

export const moneyText = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`.replace(/,00$/, '')

/** "19,90", "19.9", "R$ 20" → centavos; vazio ou ilegível → null */
export function parsePriceCents(text: string): number | null {
    const t = String(text || '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
    const cents = Math.round(Number(t) * 100)
    return Number.isFinite(cents) ? cents : null
}

/** null = pode (a mesma faixa do banco) */
export function validateClubPrice(cents: number | null): string | null {
    if (cents == null) return 'Digite a mensalidade (ex.: 19,90).'
    if (cents < CLUB_MIN_CENTS) return `A mensalidade mínima é ${moneyText(CLUB_MIN_CENTS)}.`
    if (cents > CLUB_MAX_CENTS) return `A mensalidade máxima é ${moneyText(CLUB_MAX_CENTS)}.`
    return null
}

/** Dias inteiros que faltam (arredonda para cima; 0 = venceu ou vence agora) */
export function daysLeft(periodEnd: string | null | undefined, now = Date.now()): number {
    if (!periodEnd) return 0
    const ms = new Date(periodEnd).getTime() - now
    return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86400000) : 0
}

export type RenewState = 'free' | 'ok' | 'soon' | 'expired'
export function renewState(my: Pick<ClubMy, 'paid' | 'periodEnd'> | null | undefined, now = Date.now()): RenewState {
    if (!my || !my.paid) return 'free'
    const d = daysLeft(my.periodEnd, now)
    return d === 0 ? 'expired' : d <= CLUB_RENEW_WARNING_DAYS ? 'soon' : 'ok'
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** A linha de situação do membro pago: "Ativo até 12/12 · 24 dias" / "Vence amanhã" / "Venceu" */
export function periodLine(my: Pick<ClubMy, 'paid' | 'periodEnd'> | null | undefined, now = Date.now()): string {
    const st = renewState(my, now)
    if (st === 'free') return 'Você é membro'
    if (st === 'expired') return 'Sua assinatura venceu'
    const d = daysLeft(my!.periodEnd, now)
    if (d === 1) return 'Vence amanhã'
    return st === 'soon' ? `Vence em ${d} dias (${dayMonth(my!.periodEnd!)})` : `Ativo até ${dayMonth(my!.periodEnd!)} · ${d} dias`
}

/** O que o clube oferece, numa frase */
export function offerLine(info: Pick<ClubInfo, 'priceCents' | 'includesMusic' | 'tracks'>): string {
    const price = info.priceCents == null ? 'Grátis' : `${moneyText(info.priceCents)} por mês`
    const music = info.includesMusic && info.tracks > 0 ? ` · ouça ${info.tracks === 1 ? 'a música' : `as ${info.tracks} músicas`} da loja` : ''
    return `${price}${music}`
}

/** Pode assinar/renovar agora? (clube pago, a loja tem Pix, não é a dona) */
export function canSubscribe(info: Pick<ClubInfo, 'enabled' | 'isOwner' | 'priceCents' | 'canCharge'>): boolean {
    return info.enabled && !info.isOwner && info.priceCents != null && info.canCharge
}

export const PAYMENT_STATUS_LABEL: Record<ClubPaymentStatus, string> = { awaiting: 'Aguardando o Pix', reported: 'A conferir', confirmed: 'Confirmado', refused: 'Recusado', expired: 'Expirado' }

/** A dona vê quanto entra por mês só com quem está pagando agora (não é promessa: não há renovação automática) */
export function monthlyEstimateCents(activePaid: number, priceCents: number | null): number {
    return priceCents == null ? 0 : Math.max(0, activePaid) * priceCents
}
