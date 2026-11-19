// Testes das regras puras da aba Itens (src/modules/items/domain.ts). Rodar: npm run test:items
import test from 'node:test'
import assert from 'node:assert/strict'
import { groupOwned, viewFromLegacy, isItemsView } from '../src/modules/items/domain.ts'

const l = (productId, name, q, orderId, at, price = 10) => ({ productId, name, quantity: q, unitPrice: price, orderId, at, storeName: 'Loja', storeSlug: 'loja' })
test('junta as compras do mesmo produto, conta pedidos e fica com o preço mais recente', () => {
    const g = groupOwned([l('p1', 'Pizza', 1, 'o1', '2026-11-01', 40), l('p1', 'Pizza', 2, 'o2', '2026-11-10', 45), l('p1', 'Pizza', 1, 'o2', '2026-11-10', 45), l('p2', 'Coca', 1, 'o1', '2026-11-01')])
    assert.equal(g.length, 2)
    assert.equal(g[0].productId, 'p1')
    assert.equal(g[0].quantity, 4); assert.equal(g[0].times, 2); assert.equal(g[0].lastPrice, 45)
})
test('sem id do produto, junta pelo nome e pela loja', () => {
    const g = groupOwned([l(null, 'Bolo ', 1, 'a', '2026-11-01'), l(null, 'bolo', 1, 'b', '2026-11-02')])
    assert.equal(g.length, 1); assert.equal(g[0].times, 2)
})
test('endereços antigos caem na parte certa de Itens', () => {
    assert.equal(viewFromLegacy('pedidos', null), 'historico')
    assert.equal(viewFromLegacy('avaliacoes', null), 'historico')
    assert.equal(viewFromLegacy('biblioteca', null), 'digitais')
    assert.equal(viewFromLegacy('itens', 'servicos'), 'servicos')
    assert.equal(viewFromLegacy('itens', 'xyz'), 'tudo')
    assert.ok(isItemsView('produtos')); assert.ok(!isItemsView('pedidos'))
})
