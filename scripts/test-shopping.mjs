// Testes das regras puras da página de compras (src/modules/shopping/domain.ts).
// Rodar: npm run test:shopping
import test from 'node:test'
import assert from 'node:assert/strict'
import { isQuickAddable, matchesQuery, sortTrending, limitPerStore, distinctRecent, servicePriceLabel, serviceCta, sortServices } from '../src/modules/shopping/domain.ts'

const base = { price: 20, hasAddons: false, stock: null, storeOpen: true }

test('um toque: produto simples, com preço, em estoque, loja aberta', () => {
    assert.equal(isQuickAddable(base), true)
    assert.equal(isQuickAddable({ ...base, stock: 3 }), true)
})
test('um toque não vale com adicionais, sem estoque, sem preço ou loja fechada', () => {
    assert.equal(isQuickAddable({ ...base, hasAddons: true }), false)
    assert.equal(isQuickAddable({ ...base, stock: 0 }), false)
    assert.equal(isQuickAddable({ ...base, price: null }), false)
    assert.equal(isQuickAddable({ ...base, price: 0 }), false)
    assert.equal(isQuickAddable({ ...base, storeOpen: false }), false)
})
test('busca: sem acento, sem maiúscula, todas as palavras', () => {
    assert.equal(matchesQuery(['Pizza de Calabresa', 'Pizzaria do Zé'], 'pizza ze'), true)
    assert.equal(matchesQuery(['Pizza de Calabresa'], 'açaí'), false)
    assert.equal(matchesQuery(['Açaí 500ml'], 'acai'), true)
    assert.equal(matchesQuery(['qualquer coisa'], '  '), true)
})
test('em alta: loja aberta na frente; depois vendas e visualizações', () => {
    const items = [
        { id: 'fechada', viewCount: 9000, storeOrders: 500, storeOpen: false },
        { id: 'aberta-fraca', viewCount: 1, storeOrders: 0, storeOpen: true },
        { id: 'aberta-forte', viewCount: 50, storeOrders: 10, storeOpen: true },
    ]
    assert.deepEqual(sortTrending(items).map((i) => i.id), ['aberta-forte', 'aberta-fraca', 'fechada'])
})
test('no máximo N produtos por loja, mantendo a ordem', () => {
    const items = [{ id: 'a1', storeId: 'A' }, { id: 'a2', storeId: 'A' }, { id: 'b1', storeId: 'B' }, { id: 'a3', storeId: 'A' }]
    assert.deepEqual(limitPerStore(items, 2).map((i) => i.id), ['a1', 'a2', 'b1'])
})
test('pedir de novo: sem repetir, sem vazios, respeita o máximo', () => {
    assert.deepEqual(distinctRecent(['p1', null, 'p2', 'p1', undefined, 'p3'], 2), ['p1', 'p2'])
})

test('serviço: preço em reais ou "Valor a combinar"; loja agenda, pessoa combina', () => {
    assert.match(servicePriceLabel(45), /R\$\s?45,00/)
    assert.equal(servicePriceLabel(0), 'Valor a combinar')
    assert.equal(servicePriceLabel(null), 'Valor a combinar')
    assert.equal(serviceCta('store'), 'Agendar')
    assert.equal(serviceCta('person'), 'Combinar')
})
test('serviços: loja fechada por último; depois os mais vistos', () => {
    const items = [
        { id: 'loja-fechada', kind: 'store', storeOpen: false, viewCount: 900 },
        { id: 'pessoa', kind: 'person', storeOpen: true, viewCount: 5 },
        { id: 'loja-aberta', kind: 'store', storeOpen: true, viewCount: 50 },
    ]
    assert.deepEqual(sortServices(items).map((i) => i.id), ['loja-aberta', 'pessoa', 'loja-fechada'])
})
