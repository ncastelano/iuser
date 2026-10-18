// Textos da busca V2 (src/modules/delivery-search/domain.ts). A máquina em si é testada no banco (supabase/tests/v2_search_scenarios.sql).
// Rodar: npm run test:delivery-search
import test from 'node:test'
import assert from 'node:assert/strict'
import { reajustQuestion, reajustPushBody, searchStatusText, brl, SEARCH_END_REASON_TEXT, remainingLabel, definitiveSummary, reservationNoticeText, DRIVER_RESERVED_TEXT, STORE_STATE_TEXT, paymentStateText, paymentErrorText, PAYMENT_NOTE, PAYMENT_LABELS, PIX_TYPE_LABEL } from '../src/modules/delivery-search/domain.ts'

const req = { estimatedFreight: 12, currentOffer: 15, requestedLimit: 17 }

test('a pergunta de autorização mostra estimativa, valor atual e novo limite, e diz que não é pagamento', () => {
    const q = reajustQuestion(req)
    assert.match(q.body, /R\$ 12,00/)
    assert.match(q.body, /R\$ 15,00/)
    assert.match(q.body, /até R\$ 17,00/)
    assert.match(q.note, /Isto não é um pagamento/)
    assert.match(q.note, /só paga o valor que um entregador aceitar/)
})

test('o aviso push leva o novo limite e a mesma garantia', () => {
    const b = reajustPushBody(req)
    assert.match(b, /R\$ 17,00/)
    assert.match(b, /só paga o valor que um entregador aceitar/)
})

test('status por fase', () => {
    assert.match(searchStatusText('PROCURANDO_ENTREGADOR', 8), /procurando um entregador em até 8 km/)
    assert.match(searchStatusText('AGUARDANDO_AUTORIZACAO_REAJUSTE', 8), /esperando a sua decisão/)
    assert.equal(searchStatusText('ENTREGADOR_RESERVADO', 8, 14), 'Encontramos um entregador. Frete aceito: R$ 14,00.')
    assert.equal(searchStatusText('AGUARDANDO_PAGAMENTO_CLIENTE', 8, 14), 'Encontramos um entregador. Frete aceito: R$ 14,00.')
    assert.match(searchStatusText('SEM_ENTREGADOR', 8), /Não encontramos/)
})

test('formatação em reais e motivos de término cobrem os do banco', () => {
    assert.equal(brl('13.5'), 'R$ 13,50')
    for (const k of ['timeout', 'max_rounds', 'exhausted', 'customer_declined', 'authorization_expired', 'cancelled', 'driver_accepted']) {
        assert.ok(SEARCH_END_REASON_TEXT[k], k)
    }
})

test('total definitivo: produtos + frete aceito, com a estimativa inicial como informação secundária', () => {
    const s = definitiveSummary({ itemsTotal: 80, deliveryFee: 14, totalAmount: 94, estimatedFreight: 12 })
    assert.deepEqual(s, { products: 'R$ 80,00', delivery: 'R$ 14,00', total: 'R$ 94,00', initialEstimate: 'Estimativa inicial: R$ 12,00' })
    assert.equal(definitiveSummary({ itemsTotal: 80, deliveryFee: 14, totalAmount: 94 }).initialEstimate, null)
})

test('contagem regressiva da reserva', () => {
    const now = Date.parse('2026-10-17T12:00:00Z')
    assert.equal(remainingLabel('2026-10-17T12:04:32Z', now), '04:32')
    assert.equal(remainingLabel('2026-10-17T11:59:00Z', now), '00:00')
    assert.equal(remainingLabel(null, now), null)
})

test('avisos da reserva: cada pessoa recebe o texto certo e ninguém recebe o que não lhe cabe', () => {
    const r = reservationNoticeText('reserved', 'reserve', { total: 94, minutes: 5 })
    assert.match(r.customer.body, /Total definitivo R\$ 94,00/)
    assert.match(r.customer.body, /Você ainda não pagou nada/)
    assert.equal(r.driver.title, DRIVER_RESERVED_TEXT.title)
    const n = reservationNoticeText('no_driver', 'x', {})
    assert.equal(n.customer.title, 'Não encontramos um entregador.')
    assert.equal(n.store.title, 'Não foi possível encontrar entregador')
    assert.equal(n.driver, undefined)
    assert.match(reservationNoticeText('customer_timeout', 'reopen', {}).customer.body, /procurando outro/)
    assert.equal(reservationNoticeText('customer_cancelled', 'cancel', {}).customer, undefined)
    assert.ok(STORE_STATE_TEXT.no_driver)
})

test('fluxo financeiro declaratório: textos por papel e sem linguagem de confirmação bancária', () => {
    assert.equal(paymentStateText('customer', 'awaiting_payment'), 'Pague diretamente à loja.')
    assert.equal(paymentStateText('store', 'awaiting_driver_payment', 14), 'Pague R$ 14,00 ao entregador e informe aqui.')
    assert.equal(paymentStateText('driver', 'driver_payment_reported', 14), 'A loja informou que enviou R$ 14,00. Você recebeu?')
    assert.match(paymentStateText('driver', 'payment_in_verification'), /nada foi liberado/)
    assert.equal(paymentStateText('driver', 'released'), 'Entrega liberada. Pode iniciar a retirada.')
    assert.match(PAYMENT_NOTE, /não recebe, não guarda e não repassa/)
    assert.equal(PAYMENT_LABELS.driverReceived(14), 'Recebi R$ 14,00')
    assert.equal(PIX_TYPE_LABEL.random, 'Chave aleatória')
    // nunca fala em confirmação do banco
    const all = JSON.stringify([PAYMENT_NOTE, PAYMENT_LABELS.customerReceived, PAYMENT_LABELS.driverPaid, PAYMENT_LABELS.driverNotReceived, ['awaiting_payment', 'customer_payment_reported', 'driver_payment_reported', 'payment_in_verification', 'released'].map((st) => ['customer', 'store', 'driver'].map((r) => paymentStateText(r, st, 14)))])
    assert.doesNotMatch(all, /confirmado pelo banco|Pix confirmado|pagamento confirmado/i)
})

test('avisos da etapa financeira', () => {
    assert.match(reservationNoticeText('driver_payment_reported', 'x', { total: 14 }).driver.body, /R\$ 14,00/)
    assert.equal(reservationNoticeText('released', 'x', {}).driver.title, 'Entrega liberada')
    assert.equal(reservationNoticeText('in_verification', 'x', {}).customer.title, 'Pagamento em verificação')
    assert.equal(paymentErrorText('driver_pix_missing', 'x'), 'O entregador ainda não tem chave Pix cadastrada.')
    assert.equal(paymentErrorText(undefined, 'erro cru'), 'erro cru')
})
