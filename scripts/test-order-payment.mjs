// Testes das regras puras do pagamento do pedido de loja (src/modules/order-payment). Rodar: npm run test:order-payment
// (quem vê a chave, quem confirma e o frete/acerto são testados no banco: supabase/tests/order_payments_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { canDoorPix, cardLinkProblem, changeNeeded, offerPaymentLine, parseOrderPayment, paymentStatusText } from '../src/modules/order-payment/domain.ts'

test('troco: o "troco para" menos o total, nunca negativo', () => {
    assert.equal(changeNeeded(63, 100), 37)
    assert.equal(changeNeeded(63, 50), 0)
    assert.equal(changeNeeded(63, null), 0)
    assert.equal(changeNeeded(62.9, 100), 37.1)
})
test('a oferta diz o pagamento, o troco e a maquininha', () => {
    assert.deepEqual(offerPaymentLine('pix', 50, null), { text: 'Pix (pago à loja)', warning: null })
    const d = offerPaymentLine('dinheiro', 63, 100)
    assert.equal(d.text, 'Dinheiro · troco para R$ 100,00')
    assert.match(d.warning, /Leve R\$ 37,00 de troco/)
    assert.equal(offerPaymentLine('dinheiro', 63, null).warning, null)
    assert.match(offerPaymentLine('cartao', 63, null).warning, /maquininha da loja ou cobre pelo Pix da loja na porta/)
})
test('Pix na porta: só pedido em dinheiro/cartão, já retirado e não pago antes', () => {
    assert.equal(canDoorPix('dinheiro', true, null), true)
    assert.equal(canDoorPix('cartao', true, 'awaiting'), true)
    assert.equal(canDoorPix('dinheiro', false, null), false, 'antes de retirar não')
    assert.equal(canDoorPix('pix', true, null), false, 'Pix já é pago antes')
    assert.equal(canDoorPix('cartao', true, 'confirmed'), false, 'já pago pelo link')
})
test('estado do pagamento para o cliente, a loja e o entregador', () => {
    const base = { method: 'pix', status: 'awaiting', amount: 50, storeName: 'Pizzaria' }
    assert.equal(paymentStatusText({ ...base, role: 'buyer' }).text, 'Pague R$ 50,00 por Pix direto à Pizzaria')
    assert.equal(paymentStatusText({ ...base, role: 'store', status: 'reported' }).tone, 'check')
    assert.match(paymentStatusText({ ...base, role: 'driver', status: 'confirmed' }).text, /não cobre nada/)
    assert.equal(paymentStatusText({ ...base, method: null, role: 'buyer' }), null)
})
test('link de cartão: só https', () => {
    assert.equal(cardLinkProblem(''), null)
    assert.equal(cardLinkProblem('https://link.mercadopago.com.br/loja'), null)
    assert.match(cardLinkProblem('http://x.com'), /https/)
    assert.match(cardLinkProblem('https://' + 'a'.repeat(300)), /longo/)
})
test('lê a resposta do banco', () => {
    const p = parseOrderPayment({ role: 'buyer', method: 'pix', status: 'awaiting', amount: '50.00', store_name: 'Pizzaria', pix_key: 'k', txid: 'ABC' })
    assert.equal(p.amount, 50)
    assert.equal(p.pixKey, 'k')
    assert.equal(parseOrderPayment(null), null)
})
