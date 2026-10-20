// Modelos de loja (src/lib/storeModel.ts). Rodar: npm run test:store-model
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoreModel, pageActions, suggestModelForCategory } from '../src/lib/storeModel.ts'

test('parse: valor desconhecido vira mista', () => {
    assert.equal(parseStoreModel('products'), 'products')
    assert.equal(parseStoreModel('x'), 'mixed')
    assert.equal(parseStoreModel(null), 'mixed')
})

test('loja de produtos: só Comprar; atendimento: só Agendar (com produtos, Produtos fica discreto); mista: os dois', () => {
    assert.deepEqual(pageActions('products', true, true), { buy: true, schedule: false, productsSecondary: false, servicesFirst: false, serviceRows: false })
    assert.deepEqual(pageActions('services', true, true), { buy: false, schedule: true, productsSecondary: true, servicesFirst: true, serviceRows: true })
    assert.deepEqual(pageActions('services', true, false), { buy: false, schedule: true, productsSecondary: false, servicesFirst: true, serviceRows: true })
    assert.deepEqual(pageActions('mixed', true, true), { buy: true, schedule: true, productsSecondary: false, servicesFirst: false, serviceRows: true })
})

test('sem agenda ligada, a loja de atendimento ainda oferece Comprar (se não, ficaria sem botão central)', () => {
    assert.equal(pageActions('services', false, true).buy, true)
    assert.equal(pageActions('services', false, true).schedule, false)
    assert.equal(pageActions('mixed', false, true).schedule, false)
})

test('sugestão pela categoria', () => {
    assert.equal(suggestModelForCategory('servicos'), 'services')
    assert.equal(suggestModelForCategory('alimentacao'), 'products')
    assert.equal(suggestModelForCategory('transporte'), 'mixed')
})
