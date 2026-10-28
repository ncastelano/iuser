// Testes das regras puras da Central de entregas do motorista (src/modules/deliveries/domain.ts). Rodar: npm run test:deliveries
import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityState, phaseOf, routeOrder, routeKm, suggestBatches, withinRadius, paymentRecap, itemsList, shortAddress, etaMinutes, haversineKm, earnings } from '../src/modules/deliveries/domain.ts'

const STORE = { lat: -8.758, lng: -63.8995 }
const near = (dx, dy) => ({ lat: STORE.lat + dx, lng: STORE.lng + dy })
const offer = (id, to, price = 8, storeName = 'Pizzaria') => ({ id, orderId: id, storeName, storeAddress: '', store: STORE, address: id, to, items: '', price, km: null, units: 1, itemsCount: 1, createdAt: '' })

test('mochila: ocupada, livre e cheia', () => {
    assert.deepEqual(capacityState(2, 4), { used: 2, capacity: 4, left: 2, full: false, ratio: 0.5 })
    assert.equal(capacityState(4, 4).full, true)
    assert.equal(capacityState(0, 0).capacity, 1)
})
test('etapa da saída', () => {
    assert.equal(phaseOf([]), 'idle')
    assert.equal(phaseOf([{ enRoute: false, arrived: false, started: false }]), 'accepted')
    assert.equal(phaseOf([{ enRoute: true, arrived: false, started: false }]), 'to_store')
    assert.equal(phaseOf([{ enRoute: true, arrived: true, started: false }, { enRoute: true, arrived: true, started: false }]), 'at_store')
    assert.equal(phaseOf([{ enRoute: true, arrived: true, started: true }, { enRoute: true, arrived: true, started: false }]), 'delivering')
})
test('ordem de entrega: sempre a mais perto do ponto atual; sem coordenada vai por último', () => {
    const a = { id: 'a', to: near(0.02, 0) }, b = { id: 'b', to: near(0.005, 0) }, c = { id: 'c', to: near(0.012, 0) }, x = { id: 'x', to: null }
    assert.deepEqual(routeOrder(STORE, [a, x, b, c]).map((s) => s.id), ['b', 'c', 'a', 'x'])
    assert.ok(routeKm(STORE, routeOrder(STORE, [a, b, c])) <= routeKm(STORE, [a, b, c]))
})
test('combos: junta entregas perto, no máximo o que cabe, e não repete grupos', () => {
    const offers = [offer('o1', near(0.01, 0)), offer('o2', near(0.012, 0.002)), offer('o3', near(0.014, 0.001)), offer('longe', near(0.2, 0.2))]
    const s = suggestBatches(offers, 3)
    assert.equal(s[0].offers.length, 3)
    assert.ok(!s[0].offers.some((o) => o.id === 'longe'))
    assert.equal(s[0].total, 24)
    assert.equal(suggestBatches(offers, 2)[0].offers.length, 2)
    assert.deepEqual(suggestBatches(offers, 0), [])
    const keys = s.map((x) => x.offers.map((o) => o.id).sort().join())
    assert.equal(new Set(keys).size, keys.length)
})
test('raio do motorista', () => {
    const offers = [offer('perto', near(0.01, 0)), { ...offer('longe', near(0, 0)), store: { lat: -8.9, lng: -63.9 } }]
    assert.deepEqual(withinRadius(offers, STORE, 5).map((o) => o.id), ['perto'])
    assert.equal(withinRadius(offers, null, 5).length, 2)
})
test('pagamento na porta', () => {
    assert.equal(paymentRecap('pix', null).collect, false)
    assert.match(paymentRecap('dinheiro', 100).note, /100,00/)
    assert.match(paymentRecap('cartao', null).note, /maquininha/)
})
test('textos: itens, endereço curto, tempo e ganho', () => {
    assert.deepEqual(itemsList('Pedido da loja Pizzaria Forno de Ouro: 2x Pizza Margherita (grande), 1x Coca-Cola 2 L'), ['2x Pizza Margherita (grande)', '1x Coca-Cola 2 L'])
    assert.equal(shortAddress('Rua A, 12, Centro, Porto Velho - RO'), 'Rua A, 12 · Centro')
    assert.ok(etaMinutes(1) >= 1)
    assert.ok(haversineKm(STORE, near(0.01, 0)) > 1)
    assert.equal(earnings([{ price: 8 }, { price: 9.5 }]), 17.5)
})

test('volume: o que cabe na mochila em unidades', async () => {
  const { unitsState, fitsUnits, loadLabel, suggestBatches } = await import('../src/modules/deliveries/domain.ts')
  assert.equal(unitsState(2, null).full, false)
  assert.equal(unitsState(6, 6).full, true)
  assert.equal(fitsUnits(5, 1, 6), true)
  assert.equal(fitsUnits(5.5, 1, 6), false)
  assert.equal(fitsUnits(99, 5, null), true)
  assert.equal(loadLabel(3, 2.5), '3 itens · 2,5 un.')
  assert.equal(loadLabel(1, 1), '1 item · 1 un.')
  // combo respeita o volume: 4 entregas de 1 un. com 2 un. sobrando → no máx. 2 no grupo
  const mk = (id, lat, units) => ({ id, orderId: id, storeName: 'P', storeAddress: '', store: { lat: -8.76, lng: -63.9 }, address: id, to: { lat: -8.76 + lat, lng: -63.9 }, items: '', price: 8, km: null, units, itemsCount: 1, createdAt: '' })
  const offers = [mk('a', 0.010, 1), mk('b', 0.011, 1), mk('c', 0.012, 1), mk('d', 0.013, 1)]
  assert.ok(suggestBatches(offers, 4, 3.5, 3, 2)[0].offers.length <= 2)
  assert.deepEqual(suggestBatches([mk('x', 0.01, 3)], 4, 3.5, 3, 2), [])   // nenhuma sugestão que a mochila não comporte
})
