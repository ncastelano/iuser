// lib/campaignRedemption.ts
//
// Usado nos 4 pontos de checkout (3 fluxos de carrinho + venda presencial)
// pra aplicar o desconto de um código de campanha do Club VIP. Fino de
// propósito: só embrulha as RPCs (validate_campaign_code/consume_campaign_code),
// cada checkout continua responsável pelo próprio cálculo de total e pela
// própria UI — evita duplicar a lógica de desconto sem mexer no resto de
// cada fluxo (que já funciona e é arriscado tocar mais do que o necessário).
import { supabase } from '@/lib/supabase/client'

export interface CampaignDiscount {
    redemptionId: string
    storeId: string
    discountType: 'percent' | 'fixed' | 'full'
    discountValue: number | null
    productIds: string[]
}

// Confere o código e devolve o desconto — chamar antes de fechar o pedido.
// Lança erro (com mensagem pronta pra toast) se o código não existir ou já
// tiver sido usado.
export async function validateCampaignCode(code: string): Promise<CampaignDiscount> {
    const { data, error } = await supabase.rpc('validate_campaign_code', { p_code: code.trim() }).maybeSingle()
    if (error || !data) {
        throw new Error(error?.message || 'Código inválido ou já usado')
    }
    const row = data as any
    return {
        redemptionId: row.redemption_id,
        storeId: row.store_id,
        discountType: row.discount_type,
        discountValue: row.discount_value !== null ? Number(row.discount_value) : null,
        productIds: row.product_ids || [],
    }
}

// Calcula quanto abater do total, dado o desconto validado e os itens do
// carrinho (só os itens cujo product_id está em productIds contam).
export function calculateCampaignDiscountAmount(
    discount: CampaignDiscount,
    items: { productId: string; lineTotal: number }[]
): number {
    const eligibleItems = items.filter((i) => discount.productIds.includes(i.productId))
    const eligibleTotal = eligibleItems.reduce((sum, i) => sum + i.lineTotal, 0)

    if (discount.discountType === 'full') return eligibleTotal
    if (discount.discountType === 'percent') return eligibleTotal * ((discount.discountValue || 0) / 100)
    // 'fixed' — não pode descontar mais do que o próprio valor elegível
    return Math.min(discount.discountValue || 0, eligibleTotal)
}

// Chamar só DEPOIS que o pedido (orders) já foi criado com sucesso — marca
// o código como usado. via: 'cart' (finalizado pelo app) ou 'in_person'
// (venda presencial pelo StoreDashboard).
export async function consumeCampaignCode(code: string, orderId: string, via: 'cart' | 'in_person'): Promise<void> {
    const { data, error } = await supabase.rpc('consume_campaign_code', {
        p_code: code.trim(),
        p_order_id: orderId,
        p_via: via,
    })
    if (error) {
        // Não desfaz o pedido por causa disso — o pedido já existe de
        // verdade, só loga pra investigar depois (ex: corrida rara onde o
        // código foi consumido em outra aba entre validar e fechar).
        console.error('Erro ao marcar código de campanha como usado:', error.message)
        return
    }
    if (!data) {
        console.warn('Código de campanha já não estava mais disponível na hora de consumir:', code)
    }
}
