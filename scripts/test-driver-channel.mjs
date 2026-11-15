// npm run test:driver-channel — os cartões de corrida do Canal do Motorista (src/modules/driver-channel/domain.ts). O VALOR vem pronto da conta
// de /aceitar-corridas (lib/rideQuote, testada em test:ride-quote); aqui se confere o que o cartão faz com ele.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileOf, sortTiles, shortPlace } from '../src/modules/driver-channel/domain.ts'

const base = { id: 'r', ride_type: 'pessoa', vehicle_type: 'carro', origin_address: 'Av. Calama, Olaria', destination_address: 'Rua X, Centro', distance_km: 10, duration_min: 20, offered_price: null, passenger_offer: null, order_id: null, created_at: '2026-11-10T10:00:00Z' }
const q = { price: 24.6, platform: 24.6, fromPassenger: false, approx: false, tripKm: 10.4, tripMin: 19.6, totalMin: 30 }

test('mostra o valor, os km e os minutos da corrida da conta de /aceitar-corridas; R$/h = valor ÷ (ir buscar + corrida)', () => {
    const t = tileOf(base, q)
    assert.equal(t.value, 24.6); assert.equal(t.approx, false); assert.equal(t.kind, 'corrida')
    assert.equal(t.km, 10.4); assert.equal(t.minutes, 20); assert.equal(t.perHour, 49)   // 24,60 ÷ 30 min × 60
    assert.equal(t.route, 'Olaria → Centro'); assert.equal(t.href, '/aceitar-corridas?ride=r')
})
test('sem a posição de quem dirige: "a partir de" e sem R$/h', () => {
    const t = tileOf(base, { ...q, approx: true, totalMin: null })
    assert.equal(t.approx, true); assert.equal(t.perHour, null)
})
test('oferta do passageiro 20% acima da Tarifa iUser = valorizada (a mesma regra do card)', () => {
    assert.equal(tileOf(base, { ...q, price: 27, fromPassenger: true }).kind, 'corrida')
    assert.equal(tileOf(base, { ...q, price: 30, fromPassenger: true }).kind, 'valorizada')
    assert.equal(tileOf(base, { ...q, price: 30, fromPassenger: false }).kind, 'corrida')   // Minha tarifa alta não é "valorizada"
})
test('entrega de loja', () => {
    const e = tileOf({ ...base, order_id: 'o', vehicle_type: 'moto' }, { ...q, price: 9.5 })
    assert.equal(e.kind, 'entrega'); assert.equal(e.value, 9.5); assert.equal(e.vehicle, 'Entrega de loja')
})
test('ordem: valorizadas primeiro, depois quem paga mais por hora', () => {
    const a = tileOf({ ...base, id: 'a' }, q)
    const b = tileOf({ ...base, id: 'b' }, { ...q, price: 40, fromPassenger: true })
    const c = tileOf({ ...base, id: 'c' }, { ...q, totalMin: 20 })
    assert.deepEqual(sortTiles([a, c, b]).map((t) => t.id), ['b', 'c', 'a'])
})
test('lugar curto: o bairro', () => {
    assert.equal(shortPlace('Rua das Flores, Centro'), 'Centro'); assert.equal(shortPlace('Centro'), 'Centro'); assert.equal(shortPlace(null), '—')
})
