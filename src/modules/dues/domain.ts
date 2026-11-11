// src/modules/dues/domain.ts — regras puras do CAIXA do entregador (dinheiro e maquininha) e da CONTESTAÇÃO de entrega: rótulos, textos e estados.
// Sem React nem rede; testado em scripts/test-dues.mjs (npm run test:dues). As regras de verdade (prazos, limites, bloqueio, quem decide) moram no banco.

export type DueKind = 'cash' | 'machine' | 'dispute_debt'
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
    method: 'pix' | 'em_maos' | 'devolvida' | null
    note: string | null
    overdue: boolean
    createdAt: string
    /** só no caixa da LOJA */
    driverName?: string
    driverSlug?: string | null
}
export interface MyDues { blocked: string | null; blockedText: string | null; openAmount: number; maxOpen: number; items: Due[] }
export interface StoreDues { items: Due[]; pendingAmount: number }

export const brl = (n: number | null | undefined) => `R$ ${Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const KIND_LABEL: Record<DueKind, string> = { cash: 'Dinheiro a repassar', machine: 'Maquininha da loja', dispute_debt: 'Dívida de entrega contestada' }
export const STATUS_LABEL: Record<DueStatus, string> = { open: 'Pendente', declared: 'Esperando a loja confirmar', confirmed: 'Confirmado', disputed: 'Contestado pela loja', waived: 'Perdoado' }

/** Frase curta do que o entregador deve fazer */
export function dueAction(d: Pick<Due, 'kind' | 'amount' | 'storeName' | 'status'>): string {
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
