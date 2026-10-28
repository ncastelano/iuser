// Testes do push dos avisos da ilha (src/lib/livePushPayload.ts). Rodar: npm run test:live-push
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LIVE_PUSH_KINDS, livePushFor } from '../src/lib/livePushPayload.ts'

test('a lista de tipos do código é a MESMA do gatilho do banco', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261130000010_live_push.sql', import.meta.url), 'utf8')
    const block = sql.slice(sql.indexOf('ARRAY['), sql.indexOf(']) THEN'))
    const inDb = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    assert.deepEqual(inDb, Object.keys(LIVE_PUSH_KINDS).sort())
})
test('tipos que já têm push próprio ou ficam só na lista NÃO entram', () => {
    for (const k of ['order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_done', 'ride_selected', 'ride_review', 'follow', 'publication_like', 'appointment_new']) {
        assert.equal(livePushFor({ id: '1', kind: k, meta: { title: 'x', text: 'y' } }), null, k)
    }
})
test('a linha vira título, corpo, destino e urgência', () => {
    const p = livePushFor({ id: 'n1', kind: 'delivery_at_door', meta: { title: 'Dani chegou', text: 'Dani está no seu endereço', path: '/carrinho?aba=pedidos', ride_id: 'r1', reply_code: 'coming', reply_label: 'Já estou descendo' } })
    assert.equal(p?.title, 'Dani chegou'); assert.equal(p?.body, 'Dani está no seu endereço'); assert.equal(p?.url, '/carrinho?aba=pedidos')
    assert.equal(p?.urgent, true); assert.equal(p?.live, true); assert.equal(p?.tag, 'live-delivery_at_door-r1')
    assert.deepEqual(p?.replyAction, { rideId: 'r1', code: 'coming', label: 'Já estou descendo' })
})
test('sem resposta pronta não há botão; título igual ao texto não repete', () => {
    const p = livePushFor({ id: 'n2', kind: 'favorite_invite', meta: { title: 'Convite de loja', text: 'Convite de loja', path: '/entregas' } })
    assert.equal(p?.replyAction, undefined); assert.equal(p?.body, 'Toque para ver'); assert.equal(p?.urgent, false)
    assert.equal(livePushFor({ id: 'n3', kind: 'delivery_at_door', meta: { title: 'x', text: 'y', reply_code: 'coming' } })?.replyAction, undefined)
})
test('destino só do próprio app e sem texto não vira push', () => {
    assert.equal(livePushFor({ id: 'n4', kind: 'delivery_message', meta: { text: 'oi', path: 'https://evil.example' } })?.url, '/')
    assert.equal(livePushFor({ id: 'n5', kind: 'delivery_message', meta: { text: 'oi', path: '//evil.example' } })?.url, '/')
    assert.equal(livePushFor({ id: 'n6', kind: 'delivery_message', meta: {} }), null)
})
