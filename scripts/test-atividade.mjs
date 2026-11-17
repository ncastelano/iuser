// Testes das regras puras da aba Atividade da barra da 3.0 (src/versions/v3/atividade/domain.ts). Rodar: npm run test:atividade
import test from 'node:test'
import assert from 'node:assert/strict'
import { ATIVIDADE_ABAS, NOTIFICATIONS_PATH, abaOfLocation, activityBadge, carrinhoTabOf, conversasTarget, isActivityPath, isLegacyAvisos, legacyTarget, pathOfAba, smartAba } from '../src/versions/v3/atividade/domain.ts'

const none = { pending: 0, preparing: 0, ready: 0 }

test('uma página só: cada subaba é /atividade?aba=...', () => {
    assert.deepEqual(ATIVIDADE_ABAS.map((a) => a.key), ['pedidos', 'carrinho', 'biblioteca'])   // as notificações moram no painel do perfil e as conversas na página delas
    for (const a of ATIVIDADE_ABAS) assert.equal(pathOfAba(a.key), `/atividade?aba=${a.key}`)
})

test('que endereços são da Atividade', () => {
    for (const p of ['/atividade', '/atividade?aba=pedidos', '/carrinho', '/carrinho/']) assert.equal(isActivityPath(p), true, p)
    for (const p of ['/', '/social', '/radar', '/conversas', '/carrinho-de-compras', '/flash', '']) assert.equal(isActivityPath(p), false, p)
})

test('a subaba aberta sai do ?aba=', () => {
    assert.equal(abaOfLocation('/atividade', 'conversas'), null)   // as conversas saíram (a tela leva a /conversas)
    assert.equal(abaOfLocation('/atividade', 'pedidos'), 'pedidos')
    assert.equal(abaOfLocation('/atividade', 'avaliacoes'), 'pedidos')   // avaliar uma compra faz parte de Pedidos
    assert.equal(abaOfLocation('/atividade', 'biblioteca'), 'biblioteca')
    assert.equal(abaOfLocation('/atividade', 'digital'), 'biblioteca')
    assert.equal(abaOfLocation('/atividade', 'carrinho'), 'carrinho')
    assert.equal(abaOfLocation('/atividade', 'avisos'), null)            // as notificações não são mais uma subaba (a tela redireciona)
    assert.equal(abaOfLocation('/atividade'), null)                      // sem ?aba=: nenhuma escolhida (a tela abre a que pede atenção)
    assert.equal(abaOfLocation('/atividade', 'qualquer'), null)
    assert.equal(abaOfLocation('/conversas'), null)                      // página própria
    assert.equal(abaOfLocation('/carrinho'), 'carrinho')
    assert.equal(abaOfLocation('/carrinho', 'pedidos'), 'pedidos')
    assert.equal(abaOfLocation('/carrinho', 'digital'), 'biblioteca')
    assert.equal(abaOfLocation('/social'), null)
})

test('a aba que a tela do carrinho abre', () => {
    assert.equal(carrinhoTabOf('carrinho'), 'carrinho')
    assert.equal(carrinhoTabOf('pedidos'), 'pedidos')
    assert.equal(carrinhoTabOf('pedidos', 'avaliacoes'), 'avaliacoes')
    assert.equal(carrinhoTabOf('biblioteca'), 'digital')
    assert.equal(carrinhoTabOf(null), 'carrinho')
})

test('endereços antigos viram /atividade sem perder o resto', () => {
    assert.equal(legacyTarget('/conversas', ''), null)   // /conversas é página própria de novo
    assert.equal(legacyTarget('/carrinho', ''), '/atividade?aba=carrinho')
    assert.equal(legacyTarget('/carrinho', '?aba=pedidos'), '/atividade?aba=pedidos')
    assert.equal(legacyTarget('/carrinho', '?aba=digital'), '/atividade?aba=biblioteca')
    assert.equal(legacyTarget('/carrinho', '?aba=avaliacoes'), '/atividade?aba=avaliacoes')
    assert.equal(legacyTarget('/carrinho', '?aba=outra&x=1'), '/atividade?aba=carrinho&x=1')
    assert.equal(legacyTarget('/atividade', '?aba=pedidos'), null)
    assert.equal(legacyTarget('/social', ''), null)
})

test('o endereço antigo das conversas na Atividade leva a /conversas sem perder o resto', () => {
    assert.equal(conversasTarget('/atividade', '?aba=conversas'), '/conversas')
    assert.equal(conversasTarget('/atividade', '?aba=conversas&sala=pizzaria&c=123'), '/conversas?sala=pizzaria&c=123')
    assert.equal(conversasTarget('/atividade', '?aba=pedidos'), null)
    assert.equal(conversasTarget('/conversas', '?aba=conversas'), null)
})

test('para onde a barra leva: o que pede atenção primeiro', () => {
    assert.equal(smartAba({ orders: none, cart: 0 }), 'pedidos')
    assert.equal(smartAba({ orders: { pending: 0, preparing: 0, ready: 1 }, cart: 2 }), 'pedidos')
    assert.equal(smartAba({ orders: { pending: 1, preparing: 0, ready: 0 }, cart: 4 }), 'pedidos')
    assert.equal(smartAba({ orders: none, cart: 4 }), 'carrinho')
    assert.equal(smartAba({ orders: none, cart: 0, last: 'biblioteca' }), 'biblioteca')
    assert.equal(smartAba({ orders: none, cart: 0, last: 'conversas' }), 'pedidos')   // a antiga subaba guardada no aparelho
})

test('o selo de pedidos da Atividade; roxo se há pedido pronto', () => {
    assert.deepEqual(activityBadge(none), { count: 0, color: '#16a34a' })
    assert.deepEqual(activityBadge({ pending: 1, preparing: 1, ready: 0 }), { count: 2, color: '#16a34a' })
    assert.deepEqual(activityBadge({ pending: 0, preparing: 0, ready: 1 }), { count: 1, color: '#a855f7' })
})

test('as notificações do perfil moram no painel do perfil; o endereço antigo é reconhecido para redirecionar', () => {
    assert.equal(NOTIFICATIONS_PATH, '/painel-perfil?secao=notificacoes')
    assert.equal(isLegacyAvisos('avisos'), true)
    assert.equal(isLegacyAvisos('pedidos'), false)
    assert.equal(isLegacyAvisos(null), false)
})
