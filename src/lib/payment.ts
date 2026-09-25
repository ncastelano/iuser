// src/lib/payment.ts

// Como mostrar a forma de pagamento de um pedido pro entregador: já foi
// pago (Pix/cartão online) ou ele precisa levar algo (troco pro dinheiro,
// maquininha pro cartão na entrega).
export function paymentMethodLabel(method: string | null | undefined): { text: string; warning: string | null } {
    if (method === 'credit_card') return { text: '💳 Cartão', warning: 'Levar máquina' }
    if (method === 'pix') return { text: '🔷 Pix', warning: null }
    if (method === 'money') return { text: '💵 Dinheiro', warning: 'Levar troco' }
    return { text: method || '—', warning: null }
}
