// src/modules/orders/domain.ts
//
// Regras PURAS do acompanhamento do pedido do cliente na faixa de cima da barra da 3.0: que etapa é, que texto e que cor mostrar.
// Cores = a paleta de pedidos do app todo (novo verde, preparando amarelo, pronto roxo; finalizado azul e recusado vermelho não ficam na faixa).
// O pedido SAI da faixa quando acaba (pago/entregue ou recusado): quem avisa o fim é a ilha/notificação, a faixa só acompanha o que está em andamento.
// Testes: npm run test:order-strip

export const ORDER_STRIP_COLORS = { sent: '#22c55e', preparing: '#eab308', ready: '#a855f7' } as const
export const ORDERS_PATH = '/atividade?aba=pedidos'

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'paid' | 'rejected' | string
/** Etapa da entrega iUser (order_delivery_dispatches.stage) e o estado da busca (status) */
export interface OrderDeliveryInfo { status?: string | null; stage?: string | null }
export interface MyOrder {
    /** um por checkout (o pedido que o cliente enxerga) */
    key: string
    status: OrderStatus
    storeName: string
    /** entrega (true) ou retirada (false) */
    delivery: boolean
    dispatch?: OrderDeliveryInfo | null
}
/** Nome do ícone da etapa (quem desenha escolhe o desenho): espera, cozinha, pacote pronto, procurando motorista, motorista a caminho da loja, na loja, a caminho do cliente */
export type OrderIcon = 'hourglass' | 'chef' | 'package' | 'search' | 'bike' | 'store' | 'truck'
export interface StripOrder { key: string; label: string; text: string; color: string; icon: OrderIcon; path: string; step: number }

export const isActiveOrderStatus = (s: OrderStatus): boolean => s === 'pending' || s === 'preparing' || s === 'ready'

/** O texto da etapa. `step` (1–4) alimenta a barrinha de progresso: enviado, preparando, pronto/saiu, a caminho. */
export function orderStage(o: Pick<MyOrder, 'status' | 'delivery' | 'dispatch'>): { text: string; color: string; step: number; icon: OrderIcon } | null {
    if (o.status === 'pending') return { text: 'Aguardando a loja', color: ORDER_STRIP_COLORS.sent, step: 1, icon: 'hourglass' }
    if (o.status === 'preparing') return { text: 'Preparando', color: ORDER_STRIP_COLORS.preparing, step: 2, icon: 'chef' }
    if (o.status === 'ready') {
        if (!o.delivery) return { text: 'Pronto para retirar', color: ORDER_STRIP_COLORS.ready, step: 3, icon: 'package' }
        const d = o.dispatch
        if (d?.stage === 'in_transit') return { text: 'A caminho de você', color: ORDER_STRIP_COLORS.ready, step: 4, icon: 'truck' }
        if (d?.stage === 'at_store') return { text: 'Motorista na loja', color: ORDER_STRIP_COLORS.ready, step: 3, icon: 'store' }
        if (d?.stage === 'to_store') return { text: 'Motorista indo buscar', color: ORDER_STRIP_COLORS.ready, step: 3, icon: 'bike' }
        return d?.status === 'searching'
            ? { text: 'Pronto · buscando motorista', color: ORDER_STRIP_COLORS.ready, step: 3, icon: 'search' }
            : { text: 'Pronto', color: ORDER_STRIP_COLORS.ready, step: 3, icon: 'package' }
    }
    return null   // pago/entregue, recusado, cancelado: não fica na faixa
}

/** Vira os chips da faixa: até `max` pedidos com loja e etapa; o resto vira "+N pedidos" (um só, no mesmo lugar). Mais adiantado primeiro. */
export function orderStripItems(orders: MyOrder[], max = 2): StripOrder[] {
    const items: StripOrder[] = []
    for (const o of orders) {
        const st = orderStage(o)
        if (!st) continue
        items.push({ key: `order-${o.key}`, label: o.storeName || 'Seu pedido', text: st.text, color: st.color, icon: st.icon, path: ORDERS_PATH, step: st.step })
    }
    items.sort((a, b) => b.step - a.step)
    if (items.length <= max) return items
    const shown = items.slice(0, max - 1)
    const rest = items.slice(max - 1)
    shown.push({ key: 'order-more', label: '', text: `+${rest.length} ${rest.length === 1 ? 'pedido' : 'pedidos'}`, color: rest[0].color, icon: rest[0].icon, path: ORDERS_PATH, step: 0 })
    return shown
}
