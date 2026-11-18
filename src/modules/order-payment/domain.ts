// src/modules/order-payment/domain.ts — regras PURAS do pagamento do pedido de loja (18/11/2026): pagar ANTES direto à loja (Pix com o QR dela ou o link de
// cartão dela), Pix NA PORTA mostrado pelo entregador, e o que a oferta de entrega diz sobre dinheiro/troco/maquininha. Sem React nem rede; testado em
// scripts/test-order-payment.mjs (npm run test:order-payment). Quem decide (quem vê a chave, quem confirma) é o banco (migration 20261130000074).

export type PayMethod = 'pix' | 'link_cartao' | 'pix_porta'
export type PayStatus = 'awaiting' | 'reported' | 'confirmed' | 'not_received'
export type PayRole = 'buyer' | 'store' | 'driver'

export interface OrderPayment {
    role: PayRole
    method: PayMethod | null
    paymentMethod: string | null
    status: PayStatus | null
    amount: number
    storeName: string
    txid: string | null
    pixKey: string | null
    pixKeyType: string | null
    cardLink: string | null
    reportedAt: string | null
    confirmedAt: string | null
    /** pedido retido esperando um entregador aceitar: a loja ainda não recebeu, então ainda não se paga (migration 080) */
    held: boolean
}

export const brl = (n: number | null | undefined) => `R$ ${Number(n ?? 0).toFixed(2).replace('.', ',')}`

export function parseOrderPayment(raw: unknown): OrderPayment | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, any>
    if (!r.role) return null
    return {
        role: r.role, method: r.method ?? null, paymentMethod: r.payment_method ?? null, status: r.status ?? null, amount: Number(r.amount) || 0,
        storeName: r.store_name || 'a loja', txid: r.txid ?? null, pixKey: r.pix_key ?? null, pixKeyType: r.pix_key_type ?? null, cardLink: r.card_link ?? null,
        reportedAt: r.reported_at ?? null, confirmedAt: r.confirmed_at ?? null, held: r.held === true,
    }
}

/** A frase do estado do pagamento para quem está vendo + a cor */
export function paymentStatusText(p: Pick<OrderPayment, 'method' | 'status' | 'amount' | 'storeName' | 'role'>): { text: string; tone: 'pending' | 'check' | 'ok' | 'bad' } | null {
    if (!p.method || !p.status) return null
    const how = p.method === 'link_cartao' ? 'pelo link de cartão' : p.method === 'pix_porta' ? 'por Pix na porta' : 'por Pix'
    const v = brl(p.amount)
    if (p.role === 'buyer') {
        if (p.status === 'awaiting') return { text: p.method === 'link_cartao' ? `Pague ${v} pelo link de cartão da ${p.storeName}` : `Pague ${v} por Pix direto à ${p.storeName}`, tone: 'pending' }
        if (p.status === 'reported') return { text: `Você avisou que pagou ${v}. A ${p.storeName} vai conferir.`, tone: 'check' }
        if (p.status === 'confirmed') return { text: `Pagamento de ${v} confirmado pela ${p.storeName}.`, tone: 'ok' }
        return { text: `A ${p.storeName} não encontrou o seu pagamento. Confira e avise de novo.`, tone: 'bad' }
    }
    if (p.role === 'store') {
        if (p.status === 'awaiting') return { text: `Cliente ainda não pagou ${how} (${v})`, tone: 'pending' }
        if (p.status === 'reported') return { text: `Cliente diz que pagou ${v} ${how}: confira e confirme`, tone: 'check' }
        if (p.status === 'confirmed') return { text: `Pago ${how} · ${v} ✓`, tone: 'ok' }
        return { text: `Você disse que não recebeu ${v}`, tone: 'bad' }
    }
    if (p.status === 'confirmed') return { text: `Pago à loja ${how} ✓ — não cobre nada`, tone: 'ok' }
    if (p.status === 'reported') return { text: `Cliente pagou ${how} (a loja confere) — não cobre nada`, tone: 'check' }
    if (p.status === 'not_received') return { text: `A loja não encontrou o pagamento ${how}`, tone: 'bad' }
    return { text: `Pagamento ${how} ainda não feito`, tone: 'pending' }
}

/** Quanto de troco o entregador precisa levar (dinheiro): o "troco para" menos o total; nunca negativo */
export function changeNeeded(total: number, changeFor: number | null | undefined): number {
    if (changeFor == null || !(changeFor > total)) return 0
    return Math.round((changeFor - total) * 100) / 100
}

/** O que a oferta/parada de entrega diz sobre o pagamento (o entregador decide se aceita sabendo do troco e da maquininha) */
export function offerPaymentLine(method: string | null | undefined, total: number | null | undefined, changeFor: number | null | undefined): { text: string; warning: string | null } {
    const t = Number(total) || 0
    if (method === 'pix') return { text: 'Pix (pago à loja)', warning: null }
    if (method === 'cartao' || method === 'credit_card') return { text: 'Cartão', warning: 'Leve a maquininha da loja ou cobre pelo Pix da loja na porta' }
    if (method === 'dinheiro' || method === 'money') {
        const c = changeNeeded(t, changeFor)
        if (c > 0) return { text: `Dinheiro · troco para ${brl(changeFor)}`, warning: `Leve ${brl(c)} de troco (ou cobre pelo Pix da loja na porta)` }
        return { text: t > 0 ? `Dinheiro · ${brl(t)} sem troco` : 'Dinheiro', warning: null }
    }
    return { text: method || '—', warning: null }
}

/** Pode mostrar o QR da loja na porta? Pedido em dinheiro ou cartão, já retirado, e ainda não pago antes */
export function canDoorPix(method: string | null | undefined, pickedUp: boolean, prepaid: PayStatus | null | undefined): boolean {
    if (!pickedUp) return false
    if (method !== 'dinheiro' && method !== 'cartao') return false
    return prepaid !== 'reported' && prepaid !== 'confirmed'
}

/** Valida o link de pagamento por cartão da loja (o mesmo que o banco confere) */
export function cardLinkProblem(link: string): string | null {
    const v = link.trim()
    if (!v) return null
    if (v.length > 300) return 'O link é longo demais'
    if (!/^https:\/\/\S+$/.test(v)) return 'Use o link que começa com https:// da sua conta (Mercado Pago, InfinitePay, PagBank...)'
    return null
}

/** O selo curto na linha do pedido (painel da loja) */
export function storePayChip(p: { method: PayMethod; status: PayStatus } | null | undefined): { text: string; color: string } | null {
    if (!p) return null
    const how = p.method === 'link_cartao' ? 'Cartão' : p.method === 'pix_porta' ? 'Pix na porta' : 'Pix'
    if (p.status === 'confirmed') return { text: `${how} ✓`, color: '#16a34a' }
    if (p.status === 'reported') return { text: `${how} a conferir`, color: '#0284c7' }
    if (p.status === 'not_received') return { text: `${how} não encontrado`, color: '#dc2626' }
    return { text: `${how} não pago`, color: '#ea580c' }
}
