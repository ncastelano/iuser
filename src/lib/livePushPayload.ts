// src/lib/livePushPayload.ts — regra PURA do push dos avisos da ilha: quais tipos viram notificação do aparelho e como a linha de profile_notifications vira o texto.
// (sem rede nem banco: testado em scripts/test-live-push.mjs; o envio mora em livePush.ts)

/** Tipos de aviso "ao vivo" que também viram push (a MESMA lista do gatilho `trg_ping_live_push`). `urgent` = fica na tela e vibra mais. */
export const LIVE_PUSH_KINDS: Record<string, { urgent: boolean }> = {
    store_client_request: { urgent: false },     // loja privada: alguém pediu para ser cliente
    store_client_approved: { urgent: false },    // a loja privada aceitou você
    delivery_driver_assigned: { urgent: false },
    delivery_picked_up: { urgent: false },
    delivery_at_door: { urgent: true },           // o entregador está na porta
    delivery_message: { urgent: true },           // frase pronta entre motorista e cliente
    delivery_issue: { urgent: true },             // "não acho o endereço" / "ninguém atende"
    delivery_driver_accepted: { urgent: false },
    delivery_driver_arrived: { urgent: true },    // o motorista chegou para retirar (com o código)
    delivery_driver_cancelled: { urgent: false },
    delivery_cancelled: { urgent: false },
    delivery_order_ready: { urgent: true },       // pedido pronto para o motorista retirar
    delivery_completed: { urgent: false },
    favorite_invite: { urgent: false },
    favorite_accepted: { urgent: false },
    favorite_declined: { urgent: false },
    dues_update: { urgent: false },               // repasse a fazer/confirmar, maquininha a devolver
    dispute_update: { urgent: true },             // entrega contestada / decisão do iUser
    moderation_update: { urgent: false },         // conteúdo do autor ocultado/restaurado
    ride_offer_new: { urgent: true },             // proposta de valor do outro lado (vale poucos minutos)
    ride_offer_declined: { urgent: false },
    ride_offer_agreed: { urgent: true },          // o motorista aceitou o valor: corrida confirmada
    ride_offer_expired: { urgent: false },
    ride_wait_requested: { urgent: true },        // o passageiro pede tempo de espera: o motorista aprova para começar a contar
    ride_wait_started: { urgent: false },
    ride_wait_declined: { urgent: false },
    ride_wait_ended: { urgent: false },
    order_waiting_store: { urgent: true },        // a loja precisa aceitar logo ou o pedido cai
    order_store_timeout: { urgent: false },       // a loja não respondeu: pedido cancelado
    order_customer_cancelled: { urgent: false },  // o cliente cancelou antes de a loja aceitar
    delivery_driver_idle: { urgent: false },      // o entregador demorou e a entrega foi passada adiante
    delivery_driver_waiting: { urgent: true },    // o entregador está na loja esperando o pedido
    delivery_late: { urgent: true },              // o pedido está demorando a chegar
    delivery_quit_blocked: { urgent: false },     // entregas pausadas por desistências
    store_reject_warning: { urgent: false },      // a loja recusou muitos pedidos que já tinham entregador
    order_no_driver: { urgent: false },           // pedido cancelado: nenhum entregador aceitou a tempo
    order_payment: { urgent: true },              // pagamento do pedido a conferir / confirmado / não encontrado (migration ...74)
}

export interface LivePushRow { id: string; kind: string; meta?: Record<string, any> | null }
export interface LivePush { title: string; body: string; url: string; tag: string; urgent: boolean; live: true; replyAction?: { rideId: string; code: string; label: string } }

const str = (m: Record<string, any> | null | undefined, k: string) => (m && typeof m[k] === 'string' ? (m[k] as string) : '')

/** A linha vira o push; null = tipo que não vira push ou sem texto */
export function livePushFor(row: LivePushRow): LivePush | null {
    const cfg = LIVE_PUSH_KINDS[row.kind]
    if (!cfg) return null
    const title = str(row.meta, 'title'), text = str(row.meta, 'text')
    if (!title && !text) return null
    const path = str(row.meta, 'path')
    const rideId = str(row.meta, 'ride_id'), code = str(row.meta, 'reply_code')
    return {
        title: title || text,
        body: text && text !== title ? text : 'Toque para ver',
        // só caminhos do próprio app (nunca um link externo vindo do meta)
        url: path.startsWith('/') && !path.startsWith('//') ? path : '/',
        tag: `live-${row.kind}-${rideId || row.id}`,
        urgent: cfg.urgent,
        live: true,
        ...(rideId && code ? { replyAction: { rideId, code, label: str(row.meta, 'reply_label') || 'Responder' } } : {}),
    }
}
