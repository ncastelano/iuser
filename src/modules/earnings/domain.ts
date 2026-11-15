// src/modules/earnings/domain.ts
//
// GANHOS do motorista (aba da barra do modo motorista): quanto ele fez hoje, na semana e no mês, com as corridas e as entregas de loja
// separadas. Regra pura, em CENTAVOS inteiros (sem ponto flutuante). A fonte é o que o motorista já enxerga: as próprias corridas concluídas
// (`ride_requests.status = 'completed'`); o valor é o combinado (`agreed_price`) ou, sem ele, o da oferta (`offered_price`).
// Testes: scripts/test-earnings.mjs.

export interface EarningRow {
    status: string
    /** quando a corrida começou (único carimbo de tempo que a corrida guarda) */
    started_at: string | null
    created_at?: string | null
    agreed_price: number | string | null
    offered_price: number | string | null
    /** corrida de pedido de loja (entrega)? */
    order_id: string | null
}

export type EarningPeriod = 'day' | 'week' | 'month'

const cents = (v: number | string | null | undefined): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/** O valor que a corrida rendeu, em centavos: o combinado vale mais que a oferta */
export function rideCents(r: Pick<EarningRow, 'agreed_price' | 'offered_price'>): number {
    return cents(r.agreed_price) || cents(r.offered_price)
}

/** Quando a corrida conta: a hora em que começou (senão a do pedido) */
export function rideMoment(r: Pick<EarningRow, 'started_at' | 'created_at'>): Date | null {
    const d = new Date(r.started_at || r.created_at || '')
    return Number.isNaN(d.getTime()) ? null : d
}

/** Início de cada período no fuso do aparelho: hoje 00:00, a semana começa na segunda, o mês no dia 1 */
export function periodStart(now: Date, period: EarningPeriod): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    if (period === 'month') d.setDate(1)
    return d
}

export interface EarningBucket { cents: number; count: number; rides: number; deliveries: number }
export type EarningSummary = Record<EarningPeriod, EarningBucket>

/** Soma só o que foi CONCLUÍDO (corrida cancelada ou em andamento não rende) */
export function summarize(rows: EarningRow[], now: Date = new Date()): EarningSummary {
    const out: EarningSummary = { day: { cents: 0, count: 0, rides: 0, deliveries: 0 }, week: { cents: 0, count: 0, rides: 0, deliveries: 0 }, month: { cents: 0, count: 0, rides: 0, deliveries: 0 } }
    const starts = { day: periodStart(now, 'day'), week: periodStart(now, 'week'), month: periodStart(now, 'month') }
    for (const r of rows) {
        if (r.status !== 'completed') continue
        const at = rideMoment(r)
        const value = rideCents(r)
        if (!at || value <= 0) continue
        for (const p of ['day', 'week', 'month'] as EarningPeriod[]) {
            if (at >= starts[p] && at <= now) {
                const b = out[p]
                b.cents += value; b.count += 1
                if (r.order_id) b.deliveries += 1; else b.rides += 1
            }
        }
    }
    return out
}

/** Os últimos concluídos, do mais novo ao mais antigo */
export function recentCompleted(rows: EarningRow[], limit = 10): EarningRow[] {
    return rows
        .filter((r) => r.status === 'completed' && rideCents(r) > 0 && rideMoment(r))
        .sort((a, b) => rideMoment(b)!.getTime() - rideMoment(a)!.getTime())
        .slice(0, limit)
}

/** "R$ 1.234,56" a partir de centavos */
export function brlFromCents(c: number): string {
    return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
}
