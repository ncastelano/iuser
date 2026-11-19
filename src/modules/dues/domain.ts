// src/modules/dues/domain.ts — regras puras do CAIXA do entregador (dinheiro e maquininha) e da CONTESTAÇÃO de entrega: rótulos, textos e estados.
// Sem React nem rede; testado em scripts/test-dues.mjs (npm run test:dues). As regras de verdade (prazos, limites, bloqueio, quem decide) moram no banco.

export type DueKind = 'cash' | 'machine' | 'dispute_debt' | 'freight'
export type DueStatus = 'open' | 'declared' | 'confirmed' | 'disputed' | 'waived'

export interface Due {
    id: string
    kind: DueKind
    storeId: string
    storeName: string
    amount: number | null
    status: DueStatus
    dueAt: string | null
    declaredAt: string | null
    method: 'pix' | 'em_maos' | 'devolvida' | 'saldo' | null
    /** faz parte de um acerto pelo saldo */
    settlementId?: string | null
    note: string | null
    overdue: boolean
    createdAt: string
    /** só no caixa da LOJA */
    driverName?: string
    driverSlug?: string | null
}
/** o saldo entre a loja e o entregador: o que ELE deve (dinheiro recebido) − o que ELA deve (fretes) */
export interface PairBalance { storeId?: string; storeName?: string; driverId?: string; driverName?: string; driverOwes: number; storeOwes: number; net: number; items: number }
export interface Settlement { id: string; storeId?: string; storeName?: string; driverId?: string; driverName?: string; payer: 'driver' | 'store' | 'none'; amount: number; method: 'pix' | 'em_maos' | null; status: 'declared' | 'confirmed' | 'disputed'; createdAt: string }
export interface MyDues { blocked: string | null; blockedText: string | null; openAmount: number; maxOpen: number; items: Due[]; balances: PairBalance[]; settlements: Settlement[] }
export interface StoreDues { items: Due[]; pendingAmount: number; freightAmount: number; balances: PairBalance[]; settlements: Settlement[] }

export const brl = (n: number | null | undefined) => `R$ ${Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const KIND_LABEL: Record<DueKind, string> = { cash: 'Dinheiro a repassar', machine: 'Maquininha da loja', dispute_debt: 'Dívida de entrega contestada', freight: 'Frete a receber' }
export const STATUS_LABEL: Record<DueStatus, string> = { open: 'Pendente', declared: 'Esperando a loja confirmar', confirmed: 'Confirmado', disputed: 'Contestado pela loja', waived: 'Perdoado' }

/** Frase curta do que o entregador deve fazer */
export function dueAction(d: Pick<Due, 'kind' | 'amount' | 'storeName' | 'status'>): string {
    if (d.kind === 'freight') {
        if (d.status === 'declared') return `${d.storeName} diz que te pagou ${brl(d.amount)} de frete. Confirme se recebeu.`
        if (d.status === 'disputed') return 'Você disse que não recebeu este frete. O iUser vai analisar.'
        return `${d.storeName} te deve ${brl(d.amount)} de frete.`
    }
    if (d.status === 'declared') return d.kind === 'machine' ? 'Você disse que devolveu. Esperando a loja confirmar.' : 'Você disse que repassou. Esperando a loja confirmar.'
    if (d.status === 'disputed') return 'A loja diz que não recebeu. Repasse de novo ou fale com o suporte.'
    if (d.kind === 'machine') return `Devolva a maquininha à ${d.storeName}.`
    if (d.kind === 'dispute_debt') return `Você deve ${brl(d.amount)} à ${d.storeName} (entrega contestada).`
    return `Repasse ${brl(d.amount)} à ${d.storeName} (o frete é seu).`
}

/** Tempo que falta (ou passou) até o prazo: "em 3 h", "venceu há 40 min" */
export function dueIn(dueAt: string | null, now = Date.now()): string | null {
    if (!dueAt) return null
    const ms = new Date(dueAt).getTime() - now, abs = Math.abs(ms), min = Math.round(abs / 60000)
    const t = min < 90 ? `${Math.max(1, min)} min` : abs < 36 * 3600000 ? `${Math.round(abs / 3600000)} h` : `${Math.round(abs / 86400000)} d`
    return ms >= 0 ? `em ${t}` : `venceu há ${t}`
}

// ===== contestação =====
export type DisputeReason = 'not_received' | 'incomplete' | 'other'
export type DisputeOutcome = 'rejected' | 'driver_at_fault' | 'store_at_fault' | 'redelivery'
export const REASONS: { code: DisputeReason; label: string }[] = [
    { code: 'not_received', label: 'Não recebi o pedido' },
    { code: 'incomplete', label: 'Veio faltando item' },
    { code: 'other', label: 'Outro problema' },
]
export const REASON_LABEL: Record<DisputeReason, string> = { not_received: 'Não recebeu o pedido', incomplete: 'Pedido incompleto', other: 'Outro problema' }
export const OUTCOMES: { code: DisputeOutcome; label: string; hint: string }[] = [
    { code: 'rejected', label: 'Prova vale (recusar)', hint: 'A entrega foi feita: sem reembolso.' },
    { code: 'driver_at_fault', label: 'Culpa do entregador', hint: 'A loja reembolsa o cliente e o entregador deve os produtos à loja.' },
    { code: 'store_at_fault', label: 'Culpa da loja', hint: 'A loja reembolsa o cliente.' },
    { code: 'redelivery', label: 'Reenviar o pedido', hint: 'A loja reenvia por sua conta.' },
]
export const OUTCOME_LABEL: Record<DisputeOutcome, string> = { rejected: 'Recusada (a prova vale)', driver_at_fault: 'Culpa do entregador', store_at_fault: 'Culpa da loja', redelivery: 'Reenvio do pedido' }
export const REFUND_METHODS = [{ code: 'pix', label: 'Pix' }, { code: 'dinheiro', label: 'Dinheiro' }, { code: 'cartao', label: 'Estorno no cartão' }, { code: 'outro', label: 'Outro' }] as const
export const REFUND_LABEL: Record<string, string> = { none: 'Sem reembolso', pending: 'Reembolso pendente (a loja)', declared: 'Reembolso enviado — confirme', confirmed: 'Reembolso confirmado' }

export interface Evidence { proofMethod: 'pin' | 'photo' | null; proofReason: string | null; proofPhoto: string | null; minutesAtDoor: number | null; doneDistM: number | null; driverName: string | null; paymentMethod: string | null; orderTotal: number | null; address: string | null; doneAt: string | null }

/** Quão forte é a prova (para o admin e para as partes): código dito pelo cliente é a mais forte; foto vale menos; sem prova nenhuma não vale */
export function proofStrength(e: Pick<Evidence, 'proofMethod' | 'doneDistM' | 'minutesAtDoor'>): { level: 'strong' | 'medium' | 'weak'; text: string } {
    if (e.proofMethod === 'pin') return { level: 'strong', text: `Entregue com o código do cliente${e.doneDistM != null ? `, a ${e.doneDistM} m do endereço` : ''}.` }
    if (e.proofMethod === 'photo') return { level: (e.minutesAtDoor ?? 0) >= 3 && (e.doneDistM ?? 999) <= 60 ? 'medium' : 'weak', text: `Entregue com foto${e.minutesAtDoor != null ? ` após ${e.minutesAtDoor} min na porta` : ''}${e.doneDistM != null ? `, a ${e.doneDistM} m do endereço` : ''}.` }
    return { level: 'weak', text: 'Sem prova registrada.' }
}

export function parseEvidence(e: Record<string, any> | null | undefined): Evidence {
    const x = e || {}
    return { proofMethod: x.proof_method ?? null, proofReason: x.proof_reason ?? null, proofPhoto: x.proof_photo ?? null, minutesAtDoor: x.minutes_at_door ?? null, doneDistM: x.done_dist_m ?? null, driverName: x.driver_name ?? null, paymentMethod: x.payment_method ?? null, orderTotal: x.order_total != null ? Number(x.order_total) : null, address: x.address ?? null, doneAt: x.done_at ?? null }
}

// ===== acerto pelo SALDO entre a loja e o entregador =====
/** Quem paga o saldo e quanto: o entregador (deve mais do que tem a receber), a loja (deve mais fretes) ou ninguém (se compensa) */
export function balanceSide(b: Pick<PairBalance, 'net'>): { payer: 'driver' | 'store' | 'none'; amount: number } {
    const n = Math.round((Number(b.net) || 0) * 100) / 100
    return n > 0 ? { payer: 'driver', amount: n } : n < 0 ? { payer: 'store', amount: -n } : { payer: 'none', amount: 0 }
}

/** A conta em uma frase, do ponto de vista de quem vê ('driver' ou 'store') */
export function balanceText(b: PairBalance, viewer: 'driver' | 'store'): string {
    const { payer, amount } = balanceSide(b)
    const other = viewer === 'driver' ? (b.storeName || 'a loja') : (b.driverName?.split(' ')[0] || 'o entregador')
    const Other = other.charAt(0).toUpperCase() + other.slice(1)
    const parts = [b.driverOwes > 0 ? `dinheiro de pedidos ${brl(b.driverOwes)}` : '', b.storeOwes > 0 ? `fretes ${brl(b.storeOwes)}` : ''].filter(Boolean).join(' − ')
    if (payer === 'none') return `Com ${other}: ${parts}. Se compensa: nada a pagar, é só acertar.`
    const youPay = payer === viewer
    return youPay ? `Você paga ${brl(amount)} a ${other} (${parts}).` : `${Other} te paga ${brl(amount)} (${parts}).`
}

/** Quem pode tocar em "Acertar": quem deve o saldo, ou qualquer um quando ele zera */
export function canSettle(b: Pick<PairBalance, 'net' | 'items'>, viewer: 'driver' | 'store'): boolean {
    if (!b.items) return false
    const { payer } = balanceSide(b)
    return payer === 'none' || payer === viewer
}

export const SETTLEMENT_LABEL: Record<Settlement['status'], string> = { declared: 'Esperando confirmar', confirmed: 'Acertado', disputed: 'Contestado' }
