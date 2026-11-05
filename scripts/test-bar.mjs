// Testes das regras puras da barra de baixo por modo (src/versions/v3/bar/domain.ts). Rodar: npm run test:bar
import test from 'node:test'
import assert from 'node:assert/strict'
import { activeBarKey, barKindOf, barPathOf, barTabsFor, isOwnVehiclePage } from '../src/versions/v3/bar/domain.ts'

test('o modo vira o tipo da barra; loja que não existe cai na barra de pessoa', () => {
    assert.deepEqual(barKindOf('perfil'), { kind: 'pessoa', storeSlug: null })
    assert.deepEqual(barKindOf('prestador'), { kind: 'pessoa', storeSlug: null })
    assert.deepEqual(barKindOf('loja:pizzaria', ['pizzaria']), { kind: 'loja', storeSlug: 'pizzaria' })
    assert.deepEqual(barKindOf('loja:outra', ['pizzaria']), { kind: 'pessoa', storeSlug: null })
    assert.deepEqual(barKindOf('loja:pizzaria', []), { kind: 'pessoa', storeSlug: null })   // ainda carregando
    assert.deepEqual(barKindOf('motorista:honda-fit'), { kind: 'motorista', storeSlug: null })
    assert.deepEqual(barKindOf(''), { kind: 'pessoa', storeSlug: null })
})

test('quatro abas que mudam: Explorar sempre primeiro, três do meio por modo', () => {
    const names = (k) => barTabsFor(k).map((t) => t.label)
    assert.deepEqual(names('pessoa'), ['Explorar', 'Perto', 'Social', 'Atividade'])
    assert.deepEqual(names('loja'), ['Explorar', 'Painel', 'Pedidos', 'Conversas'])
    assert.deepEqual(names('motorista'), ['Explorar', 'Corridas', 'Entregas', 'Ganhos'])
    for (const k of ['pessoa', 'loja', 'motorista']) assert.equal(barTabsFor(k)[0].key, 'home')
})

test('para onde cada aba leva', () => {
    assert.equal(barPathOf('home', null), '/')
    assert.equal(barPathOf('radar', null), '/radar')
    assert.equal(barPathOf('people', null), '/social')
    assert.equal(barPathOf('panel', 'pizzaria'), '/painel-loja/pizzaria')
    assert.equal(barPathOf('orders', 'pizzaria'), '/painel-loja/pizzaria/pedidos')
    assert.equal(barPathOf('chat', 'pizzaria'), '/atividade?aba=conversas&sala=pizzaria')
    assert.equal(barPathOf('chat', null), '/atividade?aba=conversas')
    assert.equal(barPathOf('panel', null), null)
    assert.equal(barPathOf('rides', null), '/aceitar-corridas')
    assert.equal(barPathOf('deliveries', null), '/entregas')
    assert.equal(barPathOf('earnings', null), '/ganhos')
    assert.equal(barPathOf('activity', null), null)   // a Atividade escolhe a subaba
})

test('qual aba está marcada: pessoa', () => {
    assert.equal(activeBarKey('pessoa', '/', null), 'home')
    assert.equal(activeBarKey('pessoa', '/radar', null), 'radar')
    assert.equal(activeBarKey('pessoa', '/flash', null), 'people')
    assert.equal(activeBarKey('pessoa', '/social', null), 'people')
    for (const p of ['/atividade', '/carrinho', '/conversas']) assert.equal(activeBarKey('pessoa', p, null), 'activity', p)
    assert.equal(activeBarKey('pessoa', '/comprar', null), null)
})

test('qual aba está marcada: loja', () => {
    assert.equal(activeBarKey('loja', '/painel-loja/pizzaria', 'pizzaria'), 'panel')
    assert.equal(activeBarKey('loja', '/editar-loja/pizzaria', 'pizzaria'), 'panel')
    assert.equal(activeBarKey('loja', '/painel-loja/pizzaria/pedidos', 'pizzaria'), 'orders')
    assert.equal(activeBarKey('loja', '/conversas', 'pizzaria'), 'chat')
    assert.equal(activeBarKey('loja', '/atividade', 'pizzaria', 'conversas'), 'chat')   // a Atividade nas conversas
    assert.equal(activeBarKey('loja', '/atividade', 'pizzaria', 'avisos'), null)
    assert.equal(activeBarKey('loja', '/', 'pizzaria'), 'home')
    assert.equal(activeBarKey('loja', '/carrinho', 'pizzaria'), null)
    assert.equal(activeBarKey('loja', '/radar', 'pizzaria'), null)
})

test('qual aba está marcada: motorista', () => {
    assert.equal(activeBarKey('motorista', '/aceitar-corridas', null), 'rides')
    assert.equal(activeBarKey('motorista', '/aceitar-corridas?ride=1', null), 'rides')
    assert.equal(activeBarKey('motorista', '/entregas', null), 'deliveries')
    assert.equal(activeBarKey('motorista', '/ganhos', null), 'earnings')
    assert.equal(activeBarKey('motorista', '/', null), 'home')
    assert.equal(activeBarKey('motorista', '/social', null), null)
})

test('a página do veículo da própria pessoa leva a barra (a do veículo de outra, não)', () => {
    const mine = ['honda-fit-brasil', 'moto-do-leo']
    assert.equal(isOwnVehiclePage('/honda-fit-brasil', mine), true)
    assert.equal(isOwnVehiclePage('/honda-fit-brasil/', mine), true)
    assert.equal(isOwnVehiclePage('/honda-fit-brasil?x=1', mine), true)
    assert.equal(isOwnVehiclePage('/carro-de-outro', mine), false)
    assert.equal(isOwnVehiclePage('/honda-fit-brasil/aceitar', mine), false)   // só a página do veículo, não as de dentro
    assert.equal(isOwnVehiclePage('/', mine), false)
    assert.equal(isOwnVehiclePage('/honda-fit-brasil', []), false)
})
