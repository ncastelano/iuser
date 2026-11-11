// src/lib/createStoreOrder.ts
//
// Criação de pedido do carrinho. O cliente manda só o que ESCOLHEU (produtos, quantidades, endereço, forma de
// pagamento, código de desconto): preços, adicionais, frete, desconto, total e status inicial são calculados e
// gravados pelo servidor (RPC create_store_order). Nunca envie total/frete/preço daqui.
import { supabase } from '@/lib/supabase/client'
import { callAdminApi } from '@/lib/callAdminApi'
import type { CartItem } from '@/store/useCartStore'

/** Evento do navegador: "meus pedidos mudaram" (o próprio cliente acabou de pedir) — quem acompanha pedidos atualiza na hora */
export const ORDERS_CHANGED_EVENT = 'iuser-orders-changed'

export interface CreatedStoreOrder {
    orderId: string
    checkoutId: string
    itemsTotal: number
    discount: number
    deliveryFee: number
    totalAmount: number
    flowVersion: 1 | 2
    /** ENTREGADOR PRIMEIRO: o pedido de entrega iUser fica RETIDO — a loja só o recebe quando um entregador aceitar (até lá o cliente pode retirar na loja ou cancelar) */
    awaitingDriver: boolean
}

/** Erro do servidor com o código (hint) que explica a recusa, ex.: estimate_expired. */
export class CreateStoreOrderError extends Error {
    hint?: string
    constructor(message: string, hint?: string) {
        super(message)
        this.hint = hint
    }
}

export async function createStoreOrder(params: {
    storeId: string
    items: CartItem[]
    deliveryOption: 'entrega' | 'retirada'
    paymentMethod: string
    address?: string | null
    lat?: number | null
    lng?: number | null
    cashChangeFor?: number | null
    cardIsContactless?: boolean | null
    discountCode?: string | null
    /** Só no caminho V2: id da estimativa oficial já mostrada ao cliente. A versão do fluxo NUNCA é enviada. */
    estimateId?: string | null
}): Promise<CreatedStoreOrder> {
    // Caminho V2 (com estimativa): ninguém paga agora, o pedido só vai para a loja decidir. Estas duas regras ficam AQUI para
    // que os três caminhos de checkout (produto, catálogo, carrinho) enviem exatamente a mesma coisa.
    const isV2 = !!params.estimateId
    const deliveryOption = isV2 ? 'entrega' : params.deliveryOption
    const paymentMethod = isV2 ? 'combinar' : params.paymentMethod
    const { data, error } = await supabase.rpc('create_store_order', {
        p_store_id: params.storeId,
        p_items: params.items.map((i) => ({
            product_id: i.product.id,
            quantity: i.quantity,
            comment: i.comment || null,
            addons: (i.addons || []).map((a) => ({ id: a.id })),
        })),
        p_delivery_option: deliveryOption,
        p_payment_method: paymentMethod,
        p_address: params.address ?? null,
        p_lat: params.lat ?? null,
        p_lng: params.lng ?? null,
        p_cash_change_for: params.cashChangeFor ?? null,
        p_card_is_contactless: params.cardIsContactless ?? null,
        p_discount_code: params.discountCode || null,
        p_checkout_id: crypto.randomUUID(),
        ...(params.estimateId ? { p_estimate_id: params.estimateId } : {}),
    })
    if (error || !data) throw new CreateStoreOrderError(error?.message || 'Erro ao criar pedido', error?.hint || undefined)
    const d = data as Record<string, any>
    // avisa a casca (faixa e selos do app) NA HORA: a tabela `orders` não vai pelo tempo real, então sem isto o pedido só apareceria na próxima checagem
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT))
    const awaitingDriver = d.awaiting_driver === true
    // pedido retido: a busca já começou no banco; avisa os motoristas do raio (o aviso que antes a loja mandava ao aceitar). Sem esperar e sem travar o pedido.
    if (awaitingDriver) callAdminApi('/api/orders/notify-drivers', { orderId: d.order_id }).catch(() => { })
    return {
        orderId: d.order_id,
        checkoutId: d.checkout_id,
        itemsTotal: Number(d.items_total),
        discount: Number(d.discount),
        deliveryFee: Number(d.delivery_fee),
        totalAmount: Number(d.total_amount),
        flowVersion: Number(d.flow_version) === 2 ? 2 : 1,
        awaitingDriver,
    }
}
