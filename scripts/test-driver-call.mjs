// Testes da página de chamar um motorista (src/modules/driver-call). Rodar: npm run test:driver-call
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCallRide, callCta, firstName, parseChange, placeFromParams, tripMinutes } from '../src/modules/driver-call/domain.ts'

const base = { driverName: 'Ana Paula', isSelf: false, hasOrigin: true, hasDestination: true, payment: 'pix', price: 23.4, submitting: false }

test('o botão diz o que falta, na ordem: partida, chegada, pagamento', () => {
    assert.equal(callCta({ ...base, hasOrigin: false }).missing, 'origin')
    assert.equal(callCta({ ...base, hasDestination: false }).missing, 'destination')
    assert.equal(callCta({ ...base, payment: null }).label, 'Escolha o pagamento')
    assert.equal(callCta(base).label, 'Chamar Ana · R$ 23,40')
    assert.equal(callCta({ ...base, price: null }).label, 'Chamar Ana')
})

test('ninguém chama a si mesmo; enviando, o botão trava', () => {
    assert.equal(callCta({ ...base, isSelf: true }).disabled, true)
    assert.equal(callCta({ ...base, submitting: true }).disabled, true)
    assert.equal(firstName(null), 'o motorista')
})

test('o pedido vai com o motorista preferido, 1 pessoa e o veículo dele', () => {
    const r = buildCallRide({ requesterId: 'u1', driverId: 'd1', vehicleKind: 'moto', origin: { address: ' Rua A ', coords: [-63.9, -8.76] }, destination: { address: 'Rua B', coords: [-63.8, -8.7] },
        originComplement: '', notes: ' portão azul ', payment: 'dinheiro', cashChange: '50,00', contactless: true, route: { distanceKm: 5, durationMin: 7.5 } })
    assert.equal(r.preferred_driver_id, 'd1')
    assert.equal(r.vehicle_type, 'moto')
    assert.equal(r.passenger_count, 1)
    assert.equal(r.origin_address, 'Rua A')
    assert.equal(r.origin_lat, -8.76)
    assert.equal(r.notes, 'portão azul')
    assert.equal(r.cash_change_for, 50)
    assert.equal(r.card_is_contactless, null)
    assert.equal(buildCallRide({ ...r, requesterId: 'd1', driverId: 'd1', vehicleKind: 'carro', origin: { address: 'a', coords: null }, destination: { address: 'b', coords: null }, originComplement: '', notes: '', payment: 'pix', cashChange: '', contactless: null, route: null }).preferred_driver_id, null)
})

test('troco, tempo e parâmetros da URL', () => {
    assert.equal(parseChange(''), null)
    assert.equal(parseChange('1.000,50'), 1000.5)
    assert.equal(tripMinutes(10), 15)
    const p = placeFromParams(new URLSearchParams('origem=Rua+X&origem_lat=-8.78&origem_lng=-63.87'), 'origem')
    assert.deepEqual(p, { address: 'Rua X', coords: [-63.87, -8.78] })
    assert.deepEqual(placeFromParams(new URLSearchParams('origem=Rua+X&origem_lat=abc'), 'origem'), { address: 'Rua X', coords: null })
    assert.equal(placeFromParams(new URLSearchParams(''), 'chegada'), null)
})
