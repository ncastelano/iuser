// src/lib/createStoreOrder.ts
//
// Criação de pedido do carrinho. O cliente manda só o que ESCOLHEU (produtos, quantidades, endereço, forma de
// pagamento, código de desconto): preços, adicionais, frete, desconto, total e status inicial são calculados e
// gravados pelo servidor (RPC create_store_order). Nunca envie total/frete/preço daqui.
import { supabase } from '@/lib/supabase/client'
import type { CartItem } from '@/store/useCartStore'

export interface CreatedStoreOrder {
    orderId: string
    checkoutId: string
    itemsTotal: number
    discount: number
    deliveryFee: number
    totalAmount: number
    flowVersion: 1 | 2
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
    const { data, error } = await supabase.rpc('create_store_order', {
        p_store_id: params.storeId,
        p_items: params.items.map((i) => ({
            product_id: i.product.id,
            quantity: i.quantity,
            comment: i.comment || null,
            addons: (i.addons || []).map((a) => ({ id: a.id })),
        })),
        p_delivery_option: params.deliveryOption,
        p_payment_method: params.paymentMethod,
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
    return {
        orderId: d.order_id,
        checkoutId: d.checkout_id,
        itemsTotal: Number(d.items_total),
        discount: Number(d.discount),
        deliveryFee: Number(d.delivery_fee),
        totalAmount: Number(d.total_amount),
        flowVersion: Number(d.flow_version) === 2 ? 2 : 1,
    }
}
