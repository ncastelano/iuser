// A tradução dos eventos do sistema em avisos da ilha (src/lib/islandEvents.ts). Rodar: npm run test:island-events
import test from 'node:test'
import assert from 'node:assert/strict'
import { islandEventFor, focusPath } from '../src/lib/islandEvents.ts'

test('pedido e entrega: usam o título, o texto e o destino que o banco mandou', () => {
  const e = islandEventFor({ kind: 'order_ready', meta: { title: 'Pedido pronto', text: 'Pizzaria: seu pedido está pronto', path: '/carrinho?aba=pedidos' } })
  assert.equal(e?.level, 'success'); assert.equal(e?.text, 'Pizzaria: seu pedido está pronto'); assert.equal(e?.path, '/carrinho?aba=pedidos'); assert.equal(e?.title, 'Pedido pronto')
})
test('o código de retirada fica na tela por mais tempo', () => {
  const e = islandEventFor({ kind: 'delivery_driver_arrived', meta: { title: 'Dani chegou', text: 'Dani chegou para retirar 2 pedidos · código 1234', path: '/painel-loja/x' } })
  assert.ok(e && e.duration >= 15000); assert.match(e.text, /código 1234/); assert.equal(e.actionLabel, 'Ver código')
})
test('recusa e cancelamento são erro (vermelho)', () => {
  for (const kind of ['order_rejected', 'order_no_driver', 'delivery_driver_cancelled', 'delivery_cancelled']) assert.equal(islandEventFor({ kind, meta: { text: 'x' } })?.level, 'error')
})
test('curtida, seguidor e visita NÃO viram aviso na ilha (só ficam na lista de notificações)', () => {
  for (const kind of ['follow', 'publication_like', 'profile_view', 'comment_like', 'link_visit']) assert.equal(islandEventFor({ kind, meta: {} }), null)
})
test('evento de pedido sem texto nem título é ignorado', () => {
  assert.equal(islandEventFor({ kind: 'order_accepted', meta: {} }), null)
})
test('avaliação recebida mostra as estrelas e o trecho', () => {
  const e = islandEventFor({ kind: 'ride_review', meta: { rating: 4, snippet: 'Entregou rápido' } })
  assert.match(e.text, /⭐⭐⭐⭐/); assert.match(e.text, /Entregou rápido/)
})
test('agendamento: mostra o serviço e a data', () => {
  const e = islandEventFor({ kind: 'appointment_new', meta: { title: 'Corte', date: '2026-10-30', time: '14:00' } })
  assert.match(e.text, /Corte/); assert.match(e.text, /30\/10\/2026 às 14:00/)
})
test('"Estou no local": o aviso ao cliente fica 20 s na ilha e leva ao pedido', () => {
  const e = islandEventFor({ kind: 'delivery_at_door', meta: { title: 'Dani chegou', text: 'Dani está no seu endereço com o pedido da Pizzaria — vá receber', path: '/carrinho?aba=pedidos' } })
  assert.ok(e && e.level === 'success' && e.duration >= 15000); assert.equal(e.path, '/carrinho?aba=pedidos'); assert.match(e.text, /está no seu endereço/); assert.equal(e.actionLabel, 'Ver pedido')
})
test('frase pronta e "estou no local" trazem a RESPOSTA de um toque; o aviso de problema da loja é vermelho', () => {
  const door = islandEventFor({ kind: 'delivery_at_door', meta: { title: 'Dani chegou', text: 'Dani está no seu endereço', path: '/carrinho?aba=pedidos', ride_id: 'r1', reply_code: 'coming', reply_label: 'Já estou descendo' } })
  assert.deepEqual(door?.reply, { rideId: 'r1', code: 'coming', label: 'Já estou descendo' })
  const msg = islandEventFor({ kind: 'delivery_message', meta: { title: 'Dani', text: 'Dani: Estou em frente ao endereço', path: '/carrinho?aba=pedidos' } })
  assert.equal(msg?.reply, undefined); assert.equal(msg?.level, 'message'); assert.match(msg.text, /Estou em frente/)
  const issue = islandEventFor({ kind: 'delivery_issue', meta: { title: 'Entrega com problema', text: 'Dani com Ana: ninguém atende na porta', path: '/painel-loja/x' } })
  assert.equal(issue?.level, 'error'); assert.ok(issue.duration >= 10000)
  // favoritos: convite (motorista) e resposta (loja)
  const inv = islandEventFor({ kind: 'favorite_invite', meta: { title: 'Convite de loja', text: 'Pizzaria quer você entre os entregadores favoritos', path: '/entregas' } })
  assert.equal(inv?.level, 'info'); assert.equal(inv?.path, '/entregas'); assert.match(inv.text, /favoritos/)
  assert.equal(islandEventFor({ kind: 'favorite_accepted', meta: { title: 'Novo entregador favorito', text: '@dani agora é seu entregador favorito', path: '/painel-loja/x' } })?.level, 'success')
  const dues = islandEventFor({ kind: 'dues_update', meta: { title: 'Repasse à loja', text: 'Repasse R$ 130,00 à Pizzaria', path: '/entregas' } })
  assert.equal(dues?.path, '/entregas'); assert.match(dues.text, /Repasse/)
  assert.equal(islandEventFor({ kind: 'dispute_update', meta: { title: 'Entrega contestada', text: 'Veja e responda', path: '/painel-loja/x' } })?.level, 'message')
  // a resposta só existe se vierem a entrega E o código
  assert.equal(islandEventFor({ kind: 'delivery_at_door', meta: { title: 'x', text: 'y', reply_code: 'coming' } })?.reply, undefined)
})


test('negociação do valor da corrida: a proposta do outro lado aparece na ilha, com tempo para responder', () => {
  const e = islandEventFor({ kind: 'ride_offer_new', meta: { title: 'Nova oferta do passageiro', text: 'O passageiro ofereceu R$ 14,00 pela corrida.', path: '/aceitar-corridas?aba=candidatos&ride=r1' } })
  assert.equal(e?.level, 'message'); assert.equal(e?.actionLabel, 'Responder'); assert.ok(e && e.duration >= 15000); assert.match(e.path, /aceitar-corridas/)
  for (const k of ['ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired']) assert.ok(islandEventFor({ kind: k, meta: { title: 't', text: 'x', path: '/pedir-motorista' } }), k)
  assert.equal(islandEventFor({ kind: 'ride_offer_new', meta: {} }), null)
})

test('pedido digital: a loja é avisada para liberar o acesso e o cliente quando abre', () => {
  const nw = islandEventFor({ kind: 'digital_order_new', meta: { title: 'Pedido digital novo', text: 'Ana quer "Curso de Pizza" · R$ 49,90 · libere o acesso quando receber o Pix', path: '/painel-loja/x/pedidos' } })
  assert.equal(nw?.level, 'message'); assert.equal(nw?.actionLabel, 'Liberar acesso'); assert.equal(nw?.path, '/painel-loja/x/pedidos'); assert.match(nw.text, /libere o acesso/)
  const ok = islandEventFor({ kind: 'digital_access_released', meta: { title: 'Acesso liberado', text: 'Pizzaria liberou "Curso de Pizza" — toque para começar', path: '/minhas-compras-digitais/p1' } })
  assert.equal(ok?.level, 'success'); assert.equal(ok?.path, '/minhas-compras-digitais/p1'); assert.equal(ok?.actionLabel, 'Começar')
  assert.equal(islandEventFor({ kind: 'digital_order_new', meta: {} }), null)
})

test('espera na corrida: o pedido chega ao motorista com tempo para aprovar; os demais avisos aparecem na ilha', () => {
  const e = islandEventFor({ kind: 'ride_wait_requested', meta: { title: 'Pedido de tempo de espera', text: 'Ana pediu para você esperar numa parada.', path: '/aceitar-corridas/mapa?ride=r1' } })
  assert.equal(e?.level, 'message'); assert.equal(e?.actionLabel, 'Responder'); assert.ok(e && e.duration >= 15000); assert.match(e.path, /aceitar-corridas\/mapa/)
  for (const k of ['ride_wait_started', 'ride_wait_declined', 'ride_wait_ended']) assert.ok(islandEventFor({ kind: k, meta: { title: 't', text: 'x', path: '/pedir-motorista' } }), k)
  assert.equal(islandEventFor({ kind: 'ride_wait_requested', meta: {} }), null)
})

test('aviso da loja com destino no painel leva ao PEDIDO, à corrida da entrega ou aos Repasses (antes ia à mesma página e nada acontecia)', () => {
  const id = 'a2828e6f-9a59-4dea-808b-316888f226a8'
  assert.equal(islandEventFor({ kind: 'order_new', ref_id: id, meta: { text: 'Pedido novo', path: '/painel-loja/pizza' } })?.path, `/painel-loja/pizza?pedido=${id}`)
  assert.equal(islandEventFor({ kind: 'delivery_picked_up', ref_id: id, meta: { text: 'Tito saiu', path: '/painel-loja/pizza' } })?.path, `/painel-loja/pizza?corrida=${id}`)
  assert.equal(islandEventFor({ kind: 'dues_update', ref_id: id, meta: { text: 'Tito levou a maquininha', path: '/painel-loja/pizza' } })?.path, '/painel-loja/pizza?secao=repasses')
  // destino que já tem foco, de outra página ou ref estranho: fica como veio
  assert.equal(focusPath('order_new', '/painel-loja/pizza/pedidos', id), '/painel-loja/pizza/pedidos')
  assert.equal(focusPath('order_new', '/carrinho?aba=pedidos', id), '/carrinho?aba=pedidos')
  assert.equal(focusPath('order_new', '/painel-loja/pizza', 'x;drop'), '/painel-loja/pizza')
})
