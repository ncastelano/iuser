// src/lib/livePushPayload.ts — regra PURA do push dos avisos da ilha: quais tipos viram notificação do aparelho e como a linha de profile_notifications vira o texto.
// (sem rede nem banco: testado em scripts/test-live-push.mjs; o envio mora em livePush.ts)

/** Tipos de aviso "ao vivo" que também viram push (a MESMA lista do gatilho `trg_ping_live_push`). `urgent` = fica na tela e vibra mais. */
export const LIVE_PUSH_KINDS: Record<string, { urgent: boolean }> = {
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
