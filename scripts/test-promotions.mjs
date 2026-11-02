// Testes das regras puras das promoções da loja (src/modules/promotions/domain.ts). Rodar: npm run test:promotions
import test from 'node:test'
import assert from 'node:assert/strict'
import { comboTotal, comboDiscount, priceForDiscountPct, validateCombo, comboErrorFromHint, describeItems, promoInfoOf, isPromoProduct, COMBO_ERROR_TEXT } from '../src/modules/promotions/domain.ts'

const L = (price, quantity) => ({ price, quantity })

test('soma dos itens: preço × quantidade, sem erro de centavos', () => {
    assert.equal(comboTotal([L(49.9, 1), L(11.9, 2)]), 73.7)
    assert.equal(comboTotal([L(0.1, 3)]), 0.3)
    assert.equal(comboTotal([]), 0)
    assert.equal(comboTotal([L(10, 0)]), 0)
})

test('desconto: valor e porcentagem sobre a soma; sem desconto quando o valor não é menor', () => {
    assert.deepEqual(comboDiscount(100, 80), { amount: 20, pct: 20 })
    assert.deepEqual(comboDiscount(73.7, 59.9), { amount: 13.8, pct: 19 })
    assert.deepEqual(comboDiscount(100, 100), { amount: 0, pct: 0 })
    assert.deepEqual(comboDiscount(100, 120), { amount: 0, pct: 0 })
    assert.deepEqual(comboDiscount(0, 10), { amount: 0, pct: 0 })
})

test('atalho de desconto: o valor que dá aquele % (ao centavo)', () => {
    assert.equal(priceForDiscountPct(100, 20), 80)
    assert.equal(priceForDiscountPct(73.7, 15), 62.65)
    assert.equal(priceForDiscountPct(50, 0), 50)
})

test('validar combo: nome, itens, quantidade, valor e valor acima da soma', () => {
    const ok = { name: 'Combo Casal', lines: [L(50, 1), L(10, 2)], price: 60 }
    assert.equal(validateCombo(ok), null)
    assert.equal(validateCombo({ ...ok, name: 'ab' }), 'name')
    assert.equal(validateCombo({ ...ok, lines: [] }), 'items')
    assert.equal(validateCombo({ ...ok, lines: [L(50, 21)] }), 'quantity')
    assert.equal(validateCombo({ ...ok, price: 0 }), 'price')
    assert.equal(validateCombo({ ...ok, price: 70.01 }), 'above_total')
    assert.equal(validateCombo({ ...ok, price: 70 }), null, 'igual à soma é permitido (sem desconto)')
    assert.equal(validateCombo({ ...ok, lines: [L(50, 1), L(10, 0)], price: 50 }), null, 'item com quantidade 0 não conta na soma')
    assert.equal(validateCombo({ ...ok, lines: [L(50, 1), L(10, 0)], price: 60 }), 'above_total')
})

test('mensagens do banco viram frases', () => {
    assert.equal(comboErrorFromHint('combo_price_above_total'), COMBO_ERROR_TEXT.above_total)
    assert.match(comboErrorFromHint('combo_item_invalid'), /não está mais disponível/)
    assert.match(comboErrorFromHint('algo_novo'), /Não foi possível salvar/)
})

test('descrever itens', () => {
    assert.equal(describeItems([{ name: 'Pizza', quantity: 2 }, { name: 'Guaraná', quantity: 1 }, { name: 'X', quantity: 0 }]), '2× Pizza · 1× Guaraná')
})

test('"de/por": o compare_at do banco vale; sem ele lê o texto antigo da descrição', () => {
    assert.deepEqual(promoInfoOf({ price: 80, compare_at_price: 100 }), { old: 100, pct: 20, rest: '' })
    assert.equal(promoInfoOf({ price: 100, compare_at_price: 100 }), null)
    assert.equal(promoInfoOf({ price: 120, compare_at_price: 100 }), null)
    assert.deepEqual(promoInfoOf({ price: 21.9, description: 'De R$ 29,90 por R$ 21,90. Pizza e refri.' }), { old: 29.9, pct: 27, rest: 'Pizza e refri.' })
    assert.equal(promoInfoOf({ price: 21.9, description: 'Pizza e refri.' }), null)
})

test('vai para a seção de promoções: com desconto ou na categoria Promoções', () => {
    assert.equal(isPromoProduct({ price: 80, compare_at_price: 100 }), true)
    assert.equal(isPromoProduct({ price: 10, category: 'Promoções' }), true)
    assert.equal(isPromoProduct({ price: 10, category: 'Pizzas' }), false)
})
