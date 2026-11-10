// npm run test:driver-channel — os cartões de corrida do Canal do Motorista (src/modules/driver-channel/domain.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileOf, sortTiles, shortPlace } from '../src/modules/driver-channel/domain.ts'

const fare = (km) => 7 + Math.max(0, km - 3) * 2      // a Tarifa iUser de exemplo
const floor = (min) => Math.max(8, (min || 0) * 0.8)    // mínimo da plataforma de exemplo
const base = { id: 'r', ride_type: 'pessoa', vehicle_type: 'carro', origin_address: 'Av. Calama, Olaria', destination_address: 'Rua X, Centro', distance_km: 10, duration_min: 20, offered_price: null, passenger_offer: null, order_id: null, created_at: '2026-11-10T10:00:00Z' }

test('sem oferta: Tarifa iUser "a partir de" (nunca abaixo do mínimo), com tempo, distância e R$/h', () => {
    const t = tileOf(base, fare, floor)
    assert.equal(t.value, 21); assert.equal(t.approx, true); assert.equal(t.kind, 'corrida')
    assert.equal(t.minutes, 20); assert.equal(t.km, 10); assert.equal(t.perHour, 50)   // 21 ÷ (20 + 5 min de ir buscar) × 60
    assert.equal(t.route, 'Olaria → Centro'); assert.equal(t.href, '/aceitar-corridas?ride=r')
    assert.equal(tileOf({ ...base, distance_km: 1, duration_min: 30 }, fare, floor).value, 24)   // o piso de 30 min vence
})
test('oferta do passageiro vale; 20% acima da Tarifa iUser = valorizada', () => {
    assert.equal(tileOf({ ...base, passenger_offer: 22 }, fare, floor).kind, 'corrida')
    const v = tileOf({ ...base, passenger_offer: 26 }, fare, floor)
    assert.equal(v.kind, 'valorizada'); assert.equal(v.value, 26); assert.equal(v.approx, false)
})
test('entrega de loja usa o frete fixo', () => {
    const e = tileOf({ ...base, order_id: 'o', offered_price: 9.5, vehicle_type: 'moto' }, fare, floor)
    assert.equal(e.kind, 'entrega'); assert.equal(e.value, 9.5); assert.equal(e.vehicle, 'Entrega de loja')
})
test('ordem: valorizadas primeiro, depois quem paga mais por hora (com os 5 min de ir buscar)', () => {
    const a = tileOf({ ...base, id: 'a' }, fare, floor)
    const b = tileOf({ ...base, id: 'b', passenger_offer: 40 }, fare, floor)
    const c = tileOf({ ...base, id: 'c', duration_min: 10 }, fare, floor)
    assert.deepEqual(sortTiles([a, c, b]).map((t) => t.id), ['b', 'c', 'a'])
})
test('lugar curto: o bairro', () => {
    assert.equal(shortPlace('Rua das Flores, Centro'), 'Centro'); assert.equal(shortPlace('Centro'), 'Centro'); assert.equal(shortPlace(null), '—')
})
