// Testes das regras puras da aba Atividade da barra da 3.0 (src/versions/v3/atividade/domain.ts). Rodar: npm run test:atividade
import test from 'node:test'
import assert from 'node:assert/strict'
import { ATIVIDADE_ABAS, abaOfLocation, activityBadge, carrinhoTabOf, isActivityPath, pathOfAba, smartAba } from '../src/versions/v3/atividade/domain.ts'

const none = { pending: 0, preparing: 0, ready: 0 }

test('cada subaba tem o seu endereço e os links antigos continuam valendo', () => {
    assert.deepEqual(ATIVIDADE_ABAS.map((a) => a.key), ['conversas', 'pedidos', 'carrinho', 'biblioteca', 'avisos'])
    assert.equal(pathOfAba('conversas'), '/conversas')
    assert.equal(pathOfAba('carrinho'), '/carrinho')
    assert.equal(pathOfAba('pedidos'), '/carrinho?aba=pedidos')
    assert.equal(pathOfAba('biblioteca'), '/carrinho?aba=digital')
    assert.equal(pathOfAba('avisos'), '/atividade')
})

test('que endereços são da Atividade', () => {
    for (const p of ['/atividade', '/carrinho', '/conversas', '/conversas/', '/carrinho?aba=pedidos']) assert.equal(isActivityPath(p), true, p)
    for (const p of ['/', '/social', '/radar', '/carrinho-de-compras', '/flash', '']) assert.equal(isActivityPath(p), false, p)
})

test('a subaba aberta sai do endereço e do ?aba= do carrinho', () => {
    assert.equal(abaOfLocation('/conversas'), 'conversas')
    assert.equal(abaOfLocation('/atividade'), 'avisos')
    assert.equal(abaOfLocation('/carrinho'), 'carrinho')
    assert.equal(abaOfLocation('/carrinho', 'pedidos'), 'pedidos')
    assert.equal(abaOfLocation('/carrinho', 'avaliacoes'), 'pedidos')   // avaliar uma compra faz parte de Pedidos
    assert.equal(abaOfLocation('/carrinho', 'digital'), 'biblioteca')
    assert.equal(abaOfLocation('/carrinho', 'qualquer'), 'carrinho')
    assert.equal(abaOfLocation('/social'), null)
})

test('a aba que a tela do carrinho abre', () => {
    assert.equal(carrinhoTabOf('carrinho'), 'carrinho')
    assert.equal(carrinhoTabOf('pedidos'), 'pedidos')
    assert.equal(carrinhoTabOf('pedidos', 'avaliacoes'), 'avaliacoes')
    assert.equal(carrinhoTabOf('biblioteca'), 'digital')
    assert.equal(carrinhoTabOf(null), 'carrinho')
})

test('para onde a barra leva: o que pede atenção primeiro', () => {
    assert.equal(smartAba({ unread: 0, orders: none, cart: 0 }), 'conversas')
    assert.equal(smartAba({ unread: 3, orders: none, cart: 2 }), 'conversas')
    assert.equal(smartAba({ unread: 3, orders: { pending: 0, preparing: 0, ready: 1 }, cart: 0 }), 'pedidos')   // pedido pronto passa à frente
    assert.equal(smartAba({ unread: 0, orders: { pending: 1, preparing: 0, ready: 0 }, cart: 4 }), 'pedidos')
    assert.equal(smartAba({ unread: 0, orders: none, cart: 4 }), 'carrinho')
    assert.equal(smartAba({ unread: 0, orders: none, cart: 0, last: 'biblioteca' }), 'biblioteca')
    assert.equal(smartAba({ unread: 0, orders: none, cart: 0, last: 'nao-existe' }), 'conversas')
})

test('o selo da barra soma mensagens e pedidos; roxo se há pedido pronto', () => {
    assert.deepEqual(activityBadge(0, none), { count: 0, color: '#16a34a' })
    assert.deepEqual(activityBadge(3, { pending: 1, preparing: 1, ready: 0 }), { count: 5, color: '#16a34a' })
    assert.deepEqual(activityBadge(2, { pending: 0, preparing: 0, ready: 1 }), { count: 3, color: '#a855f7' })
    assert.equal(activityBadge(-4, none).count, 0)
})
