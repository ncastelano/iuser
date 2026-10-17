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
            return frozenFreight != null ? `Um entregador aceitou a entrega por ${brl(frozenFreight)}.` : 'Um entregador aceitou a entrega.'
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
