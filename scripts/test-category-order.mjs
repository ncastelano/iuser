// npm run test:category-order — a ordem das categorias do catálogo (src/lib/categoryOrder.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { orderCategories, mergeCategoryOrder } from '../src/lib/categoryOrder.ts'

const counts = { Pizzas: 10, Bebidas: 4, Promoções: 2, Sobremesas: 4, Porções: 1 }
const count = (c) => counts[c] || 0
const cats = Object.keys(counts)

test('sem ordem escolhida: Promoções primeiro e depois as com mais itens (empate pelo nome)', () => {
    assert.deepEqual(orderCategories(cats, null, count), ['Promoções', 'Pizzas', 'Bebidas', 'Sobremesas', 'Porções'])
})
test('a ordem escolhida vem primeiro, o resto pela regra de sempre', () => {
    assert.deepEqual(orderCategories(cats, ['Sobremesas', 'Bebidas'], count), ['Sobremesas', 'Bebidas', 'Promoções', 'Pizzas', 'Porções'])
})
test('nome escolhido que não existe mais é ignorado; repetido conta uma vez', () => {
    assert.deepEqual(orderCategories(['Pizzas', 'Bebidas'], ['Lanches', 'Bebidas', 'Bebidas'], count), ['Bebidas', 'Pizzas'])
})
test('juntar a ordem de um ambiente preserva a dos outros', () => {
    assert.deepEqual(mergeCategoryOrder(['Cursos', 'Pizzas', 'Músicas'], ['Bebidas', 'Pizzas']), ['Bebidas', 'Pizzas', 'Cursos', 'Músicas'])
    assert.equal(mergeCategoryOrder(null, Array.from({ length: 80 }, (_, i) => `c${i}`)).length, 60)
})
test('a coluna é pública nas três listas (migration, publicColumns e o teste de exposição)', () => {
    assert.match(readFileSync('supabase/migrations/20261130000061_store_category_order.sql', 'utf8'), /order_cols text\[\] := ARRAY\['category_order'\]/)
    assert.match(readFileSync('src/lib/publicColumns.ts', 'utf8'), /category_order/)
    assert.match(readFileSync('scripts/test-security-exposure.mjs', 'utf8'), /20261130000061_store_category_order\.sql/)
})
