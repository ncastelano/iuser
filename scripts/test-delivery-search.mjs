// Textos da busca V2 (src/modules/delivery-search/domain.ts). A máquina em si é testada no banco (supabase/tests/v2_search_scenarios.sql).
// Rodar: npm run test:delivery-search
import test from 'node:test'
import assert from 'node:assert/strict'
import { reajustQuestion, reajustPushBody, searchStatusText, brl, SEARCH_END_REASON_TEXT } from '../src/modules/delivery-search/domain.ts'

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
    assert.equal(searchStatusText('ENTREGADOR_RESERVADO', 8, 14), 'Um entregador aceitou a entrega por R$ 14,00.')
    assert.match(searchStatusText('SEM_ENTREGADOR', 8), /Não encontramos/)
})

test('formatação em reais e motivos de término cobrem os do banco', () => {
    assert.equal(brl('13.5'), 'R$ 13,50')
    for (const k of ['timeout', 'max_rounds', 'exhausted', 'customer_declined', 'authorization_expired', 'cancelled', 'driver_accepted']) {
        assert.ok(SEARCH_END_REASON_TEXT[k], k)
    }
})
