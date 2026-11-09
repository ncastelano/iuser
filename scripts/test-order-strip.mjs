// Testes do acompanhamento do pedido na faixa da barra (src/modules/orders/domain.ts). Rodar: npm run test:order-strip
import test from 'node:test'
import assert from 'node:assert/strict'
import { ORDERS_PATH, ORDER_STRIP_COLORS, isActiveOrderStatus, orderStage, orderStripItems } from '../src/modules/orders/domain.ts'

const o = (over = {}) => ({ key: 'a', status: 'pending', storeName: 'Pizzaria', delivery: true, dispatch: null, ...over })

test('cada etapa tem texto e a cor da paleta de pedidos', () => {
    assert.deepEqual(orderStage(o({ status: 'pending' })), { text: 'Aguardando a loja', color: ORDER_STRIP_COLORS.sent, step: 1, pulse: true })
    assert.equal(orderStage(o({ status: 'preparing' })).color, '#eab308')
    assert.equal(orderStage(o({ status: 'preparing' })).text, 'Preparando')
    assert.equal(orderStage(o({ status: 'ready', delivery: false })).text, 'Pronto para retirar')
    assert.equal(orderStage(o({ status: 'ready', delivery: false })).color, '#a855f7')
})

test('pronto com entrega: acompanha o motorista', () => {
    const r = (dispatch) => orderStage(o({ status: 'ready', dispatch })).text
    assert.equal(r(null), 'Pronto')
    assert.equal(r({ status: 'searching' }), 'Pronto · buscando motorista')
    assert.equal(r({ status: 'accepted', stage: 'to_store' }), 'Motorista indo buscar')
    assert.equal(r({ status: 'accepted', stage: 'at_store' }), 'Motorista na loja')
    assert.equal(r({ status: 'accepted', stage: 'in_transit' }), 'A caminho de você')
    assert.equal(orderStage(o({ status: 'ready', dispatch: { stage: 'in_transit' } })).step, 4)
})

test('pedido finalizado, recusado ou cancelado SAI da faixa', () => {
    for (const s of ['paid', 'rejected', 'cancelled', 'x']) { assert.equal(orderStage(o({ status: s })), null); assert.equal(isActiveOrderStatus(s), false) }
    for (const s of ['pending', 'preparing', 'ready']) assert.equal(isActiveOrderStatus(s), true)
    assert.deepEqual(orderStripItems([o({ status: 'paid' }), o({ key: 'b', status: 'rejected' })]), [])
})

test('a faixa mostra loja + etapa e leva à aba Pedidos', () => {
    const [x] = orderStripItems([o({ status: 'preparing', storeName: 'Forno de Ouro' })])
    assert.equal(x.label, 'Forno de Ouro')
    assert.equal(x.text, 'Preparando')
    assert.equal(x.path, ORDERS_PATH)
    assert.equal(ORDERS_PATH, '/atividade?aba=pedidos')
})

test('vários pedidos: os mais adiantados primeiro e o resto vira "+N pedidos"', () => {
    const list = [o({ key: '1', status: 'pending' }), o({ key: '2', status: 'ready', delivery: false }), o({ key: '3', status: 'preparing' }), o({ key: '4', status: 'pending' })]
    const items = orderStripItems(list, 2)
    assert.equal(items.length, 2)
    assert.equal(items[0].text, 'Pronto para retirar')
    assert.equal(items[1].text, '+3 pedidos')
    assert.equal(orderStripItems(list.slice(0, 2), 2).length, 2)
    assert.equal(orderStripItems([list[0]], 2)[0].text, 'Aguardando a loja')
})

test('loja sem nome não deixa a faixa vazia', () => {
    assert.equal(orderStripItems([o({ storeName: '' })])[0].label, 'Seu pedido')
})
