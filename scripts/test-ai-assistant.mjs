// Testes das regras puras da IA do iUser (src/modules/ai-assistant/domain.ts). Rodar: npm run test:ai-assistant
// A IA só PROPÕE; aqui se confere que o que ela devolve é checado contra o que a pessoa realmente tem (loja, produto, motorista).
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlan, matchProduct, looksLikeCommand, needsConfirm, AI_PAGES, AI_SERVICE_TYPES, AI_PLAN_SCHEMA } from '../src/modules/ai-assistant/domain.ts'
import { readFileSync } from 'node:fs'

const prods = [
    { id: 'p1', name: 'Coca-Cola 2L', price: 12, active: true, category: 'Bebidas' },
    { id: 'p2', name: 'Pizza Calabresa', price: 45, active: true, category: 'Pizzas' },
    { id: 'p3', name: 'Pizza Calabresa Especial', price: 55, active: false, category: 'Pizzas' },
]
const loja = { id: 's1', slug: 'forno', name: 'Forno de Ouro', active: true, products: prods }
const dona = { name: 'Ana', stores: [loja], isDriver: false, driverOnline: false }
const cliente = { name: 'Bia', stores: [], isDriver: false, driverOnline: false }
const motorista = { name: 'Dani', stores: [], isDriver: true, driverOnline: false }

test('cadastrar produto: confere loja, nome e preço', () => {
    const p = normalizePlan({ action: 'product_create', reply: 'ok', store_id: 's1', product_name: '  Guaraná 2L ', price: 10.499, category: 'Bebidas' }, dona)
    assert.equal(p.action, 'product_create'); assert.equal(p.name, 'Guaraná 2L'); assert.equal(p.price, 10.5); assert.equal(p.store.id, 's1')
    assert.equal(normalizePlan({ action: 'product_create', product_name: 'X', price: null }, dona).action, 'answer')   // sem preço: pergunta
    assert.equal(normalizePlan({ action: 'product_create', product_name: 'X', price: -3 }, dona).action, 'answer')
    assert.equal(normalizePlan({ action: 'product_create', product_name: 'X', price: 5 }, cliente).action, 'answer')   // sem loja
})
test('loja de OUTRA pessoa nunca vira ação (com várias lojas, pergunta qual)', () => {
    const duas = { ...dona, stores: [loja, { ...loja, id: 's2', name: 'Doces da Ana', products: [] }] }
    assert.equal(normalizePlan({ action: 'store_open', active: false, store_id: 'de-outro' }, duas).action, 'answer')
    assert.equal(normalizePlan({ action: 'store_open', active: false, store_id: 's2' }, duas).action, 'store_open')
    // uma loja só: vale mesmo sem o id
    assert.equal(normalizePlan({ action: 'store_open', active: false, store_id: null }, dona).action, 'store_open')
    assert.equal(normalizePlan({ action: 'store_open', active: true }, dona).action, 'answer')   // já está no ar
})
test('produto pelo nome: exato, sem acento, e ambíguo vira pergunta', () => {
    assert.equal(matchProduct(prods, 'coca cola 2l')?.id, 'p1')
    assert.equal(matchProduct(prods, 'Pizza Calabresa')?.id, 'p2')
    assert.equal(matchProduct(prods, 'pizza especial')?.id, 'p3')
    assert.equal(matchProduct(prods, 'pizza'), null)   // duas pizzas igualmente boas
    assert.equal(matchProduct(prods, 'hamburguer'), null)
    const p = normalizePlan({ action: 'product_price', product_name: 'coca cola 2l', price: 13 }, dona)
    assert.equal(p.action, 'product_price'); assert.equal(p.product.id, 'p1')
    assert.equal(normalizePlan({ action: 'product_price', product_name: 'coca cola 2l', price: 12 }, dona).action, 'answer')   // mesmo preço
    assert.equal(normalizePlan({ action: 'product_active', product_name: 'Pizza Calabresa Especial', active: true }, dona).action, 'product_active')
})
test('motorista: só quem é motorista, e não repete o estado atual', () => {
    assert.equal(normalizePlan({ action: 'driver_online', active: true }, cliente).action, 'answer')
    assert.equal(normalizePlan({ action: 'driver_online', active: true }, motorista).action, 'driver_online')
    assert.equal(normalizePlan({ action: 'driver_online', active: false }, motorista).action, 'answer')
})
test('páginas só da lista; o caminho é montado aqui, nunca vem da IA', () => {
    const p = normalizePlan({ action: 'go', page: 'conversas' }, cliente)
    assert.equal(p.path, '/conversas')
    assert.equal(normalizePlan({ action: 'go', page: 'https://golpe.com' }, cliente).action, 'answer')
    assert.equal(normalizePlan({ action: 'go', page: 'ganhos' }, cliente).path, AI_PAGES.canal_motorista.path)
    for (const { path } of Object.values(AI_PAGES)) assert.ok(path.startsWith('/') && !path.startsWith('//'))
    assert.equal(normalizePlan({ action: 'apagar_tudo' }, dona).action, 'answer')
    assert.equal(normalizePlan(null, dona).action, 'answer')
})
test('serviço desconhecido vira "outro"; o que muda algo pede Confirmar', () => {
    assert.equal(normalizePlan({ action: 'service', service_type: 'hacker', text: 'x' }, cliente).serviceType, 'outro')
    assert.equal(normalizePlan({ action: 'service', service_type: 'eletricista' }, cliente).serviceType, 'eletricista')
    assert.equal(needsConfirm({ action: 'product_create' }), true)
    assert.equal(needsConfirm({ action: 'search' }), false)
    assert.equal(needsConfirm({ action: 'store_sales' }), false)
})
test('parece pedido × parece busca', () => {
    assert.equal(looksLikeCommand('cadastra coca 2 litros por 12 reais'), true)
    assert.equal(looksLikeCommand('quanto vendi hoje'), true)
    assert.equal(looksLikeCommand('me leva pro shopping'), true)
    assert.equal(looksLikeCommand('pizzaria'), false)
    assert.equal(looksLikeCommand('pizza calabresa'), false)
})
test('os tipos de serviço são os mesmos do app (lib/serviceTypes)', () => {
    const src = readFileSync(new URL('../src/lib/serviceTypes.ts', import.meta.url), 'utf8')
    const ids = [...src.matchAll(/\{ id: '([a-z_]+)', label:/g)].map((m) => m[1]).slice(0, AI_SERVICE_TYPES.length)
    assert.deepEqual(ids, [...AI_SERVICE_TYPES])
    assert.equal(AI_PLAN_SCHEMA.additionalProperties, false)
    assert.deepEqual([...AI_PLAN_SCHEMA.required].sort(), Object.keys(AI_PLAN_SCHEMA.properties).sort())
})
