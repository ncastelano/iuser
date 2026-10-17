// src/modules/delivery-search/domain.ts
//
// Textos e rótulos da busca dinâmica V2 (Etapa 2.5). Nada aqui decide preço, raio ou limite: a máquina da busca mora no banco
// (supabase/migrations/20261100…: _v2_decide / _advance_delivery_search_v2 / respond_delivery_reajust). Aqui só se escreve o que o
// cliente lê. A autorização é de um NOVO LIMITE de busca: não é pagamento, não é cobrança e não fixa o frete.

export type SearchPhase =
    | 'PROCURANDO_ENTREGADOR'
    | 'AGUARDANDO_AUTORIZACAO_REAJUSTE'
    | 'ENTREGADOR_RESERVADO'
    | 'SEM_ENTREGADOR'
    | 'CANCELADO'
    | string

export const brl = (v: number | string) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export interface ReajustRequest {
    estimatedFreight: number
    currentOffer: number
    requestedLimit: number
}

/** Pergunta mostrada ao cliente quando a busca passa do limite automático. */
export function reajustQuestion(r: ReajustRequest): { title: string; body: string; note: string } {
    return {
        title: 'Ainda não encontramos um entregador',
        body: `A entrega foi estimada inicialmente em ${brl(r.estimatedFreight)} e hoje está em ${brl(r.currentOffer)}. Podemos ampliar a busca por até ${brl(r.requestedLimit)}?`,
        note: 'Você só paga o valor que um entregador aceitar, e só verá a cobrança depois que alguém aceitar. Isto não é um pagamento.',
    }
}

export function reajustPushBody(r: ReajustRequest): string {
    return `Estimada em ${brl(r.estimatedFreight)}. Podemos ampliar a busca por até ${brl(r.requestedLimit)}? Você só paga o valor que um entregador aceitar. Toque para decidir.`
}

/** Linha de status da entrega V2 para o cliente. */
export function searchStatusText(phase: SearchPhase, radiusKm: number, frozenFreight?: number | null): string {
    switch (phase) {
        case 'PROCURANDO_ENTREGADOR':
            return `Estamos procurando um entregador em até ${Number(radiusKm)} km da loja.`
        case 'AGUARDANDO_AUTORIZACAO_REAJUSTE':
            return 'A busca está pausada esperando a sua decisão.'
        case 'ENTREGADOR_RESERVADO':
        case 'AGUARDANDO_PAGAMENTO_CLIENTE':
            return frozenFreight != null ? `Encontramos um entregador. Frete aceito: ${brl(frozenFreight)}.` : 'Encontramos um entregador.'
        case 'SEM_ENTREGADOR':
            return 'Não encontramos um entregador para este pedido.'
        case 'CANCELADO':
            return 'A entrega foi cancelada.'
        default:
            return 'Entrega em andamento.'
    }
}

export const SEARCH_END_REASON_TEXT: Record<string, string> = {
    timeout: 'O tempo máximo de busca terminou.',
    max_rounds: 'O número máximo de tentativas foi atingido.',
    exhausted: 'Já buscamos no maior raio e no maior valor permitidos.',
    customer_declined: 'Você não autorizou ampliar a busca.',
    authorization_expired: 'O tempo para autorizar terminou.',
    cancelled: 'A entrega foi cancelada.',
    driver_accepted: 'Um entregador aceitou.',
}

/** Tempo restante da reserva (mm:ss). */
export function remainingLabel(until: string | null | undefined, now = Date.now()): string | null {
    if (!until) return null
    const ms = Date.parse(until) - now
    if (!Number.isFinite(ms)) return null
    if (ms <= 0) return '00:00'
    const total = Math.ceil(ms / 1000)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Resumo do total DEFINITIVO (o servidor calculou; aqui só se mostra). Em reais, vindos do banco. */
export function definitiveSummary(v: { itemsTotal: number; deliveryFee: number; totalAmount: number; estimatedFreight?: number | null }) {
    return {
        products: brl(v.itemsTotal),
        delivery: brl(v.deliveryFee),
        total: brl(v.totalAmount),
        initialEstimate: v.estimatedFreight != null ? `Estimativa inicial: ${brl(v.estimatedFreight)}` : null,
    }
}

export const DRIVER_RESERVED_TEXT = {
    title: 'Entrega reservada para você.',
    body: 'Aguarde a liberação antes de iniciar a retirada.',
}

export const STORE_STATE_TEXT: Record<string, string> = {
    searching: 'Buscando motorista',
    awaiting_authorization: 'Aguardando o cliente autorizar a busca',
    driver_reserved: 'Motorista reservado',
    awaiting_payment: 'Motorista reservado · aguardando o pagamento do cliente',
    no_driver: 'Não foi possível encontrar entregador',
    cancelled: 'Entrega cancelada',
    released: 'Entrega liberada',
}

export type NoticeReason = 'reserved' | 'customer_timeout' | 'driver_cancelled' | 'customer_cancelled' | 'store_cancelled' | 'no_driver' | string

/** Textos dos avisos de reserva por destinatário (push). Vazio = não avisa essa pessoa. */
export function reservationNoticeText(
    reason: NoticeReason,
    mode: string | null | undefined,
    ctx: { total?: number | null; minutes?: number | null }
): { customer?: { title: string; body: string }; driver?: { title: string; body: string }; store?: { title: string; body: string } } {
    if (reason === 'reserved') {
        return {
            customer: {
                title: 'Encontramos um entregador!',
                body: `${ctx.total != null ? `Total definitivo ${brl(ctx.total)}. ` : ''}${ctx.minutes ? `A reserva vale por ${ctx.minutes} min. ` : ''}Você ainda não pagou nada.`,
            },
            driver: { title: DRIVER_RESERVED_TEXT.title, body: DRIVER_RESERVED_TEXT.body },
            store: { title: 'Motorista reservado', body: 'Um entregador aceitou o pedido. Aguardando o pagamento do cliente.' },
        }
    }
    if (reason === 'no_driver') {
        return {
            customer: { title: 'Não encontramos um entregador.', body: 'Seu pedido não foi cobrado. Fale com a loja para combinar a entrega.' },
            store: { title: 'Não foi possível encontrar entregador', body: 'O pedido segue com você, sem entregador do iUser.' },
        }
    }
    const reopened = mode === 'reopen'
    const out: ReturnType<typeof reservationNoticeText> = {}
    if (reason === 'customer_timeout' || reason === 'driver_cancelled') {
        out.customer = reopened
            ? { title: 'O entregador foi liberado', body: 'Estamos procurando outro entregador para você.' }
            : { title: 'A entrega foi cancelada', body: 'O tempo da reserva terminou.' }
        out.driver = { title: 'Reserva liberada', body: 'Esta entrega não está mais reservada para você.' }
    } else if (reason === 'customer_cancelled') {
        out.driver = { title: 'Entrega cancelada', body: 'O cliente cancelou a entrega.' }
        out.store = { title: 'Entrega cancelada pelo cliente', body: 'O cliente cancelou a entrega do iUser.' }
    } else if (reason === 'store_cancelled') {
        out.customer = { title: 'A entrega foi cancelada', body: 'A loja cancelou a entrega.' }
        out.driver = { title: 'Entrega cancelada', body: 'A loja cancelou a entrega.' }
    }
    return out
}
