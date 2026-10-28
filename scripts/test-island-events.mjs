// A tradução dos eventos do sistema em avisos da ilha (src/lib/islandEvents.ts). Rodar: npm run test:island-events
import test from 'node:test'
import assert from 'node:assert/strict'
import { islandEventFor } from '../src/lib/islandEvents.ts'

test('pedido e entrega: usam o título, o texto e o destino que o banco mandou', () => {
  const e = islandEventFor({ kind: 'order_ready', meta: { title: 'Pedido pronto', text: 'Pizzaria: seu pedido está pronto', path: '/carrinho?aba=pedidos' } })
  assert.equal(e?.level, 'success'); assert.equal(e?.text, 'Pizzaria: seu pedido está pronto'); assert.equal(e?.path, '/carrinho?aba=pedidos'); assert.equal(e?.title, 'Pedido pronto')
})
test('o código de retirada fica na tela por mais tempo', () => {
  const e = islandEventFor({ kind: 'delivery_driver_arrived', meta: { title: 'Dani chegou', text: 'Dani chegou para retirar 2 pedidos · código 1234', path: '/painel-loja/x' } })
  assert.ok(e && e.duration >= 15000); assert.match(e.text, /código 1234/); assert.equal(e.actionLabel, 'Ver código')
})
test('recusa e cancelamento são erro (vermelho)', () => {
  for (const kind of ['order_rejected', 'delivery_driver_cancelled', 'delivery_cancelled']) assert.equal(islandEventFor({ kind, meta: { text: 'x' } })?.level, 'error')
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
