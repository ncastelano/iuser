// src/lib/payment.ts

// Como mostrar a forma de pagamento de um pedido pro entregador: já foi
// pago (Pix/cartão online) ou ele precisa levar algo (troco pro dinheiro,
// maquininha pro cartão na entrega).
//
// orders.payment_method é salvo como 'pix' | 'cartao' | 'dinheiro' (é o que
// o checkout do carrinho/produto grava - ver useStoreCheckout.ts). Os nomes
// 'credit_card'/'money' nunca são gravados por nada no app hoje; ficam aqui
// só como alias de segurança caso apareça em algum pedido antigo/externo.
export function paymentMethodLabel(method: string | null | undefined): { text: string; warning: string | null } {
    if (method === 'cartao' || method === 'credit_card') return { text: '💳 Cartão', warning: 'Levar máquina' }
    if (method === 'pix') return { text: '🔷 Pix', warning: null }
    if (method === 'dinheiro' || method === 'money') return { text: '💵 Dinheiro', warning: 'Levar troco' }
    return { text: method || '—', warning: null }
}
