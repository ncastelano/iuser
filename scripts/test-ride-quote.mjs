// Testes da conta do valor da corrida para o motorista (src/lib/rideQuote.ts). Rodar: npm run test:ride-quote
import test from 'node:test'
import assert from 'node:assert/strict'
import { rideQuote } from '../src/lib/rideQuote.ts'

// fórmulas de brinquedo com a mesma forma da tarifa real: base + R$/km acima da distância base
const fare = (s, km) => (km == null ? s.fee : s.fee + Math.max(0, km - s.base) * s.perKm)
const pickupFee = (s, km) => km * s.perKm
const platform = { fee: 7, base: 2, perKm: 2 }
const custom = { fee: 10, base: 3, perKm: 2 }
const base = { offeredPrice: null, distanceKm: 3.6, routeKm: 9.3, platformShape: platform, customShape: null, useCustom: false, pickupKm: 9.8, pickupMin: 20, tripMin: 18, minHourly: null, minPerMinute: null, tripFare: fare, pickupFee }

test('a distância da ROTA vale no lugar do km gravado quando divergem', () => {
    const q = rideQuote(base)
    assert.equal(q.tripKm, 9.3)
    assert.equal(q.platformTrip, 7 + 7.3 * 2)     // 21,60
    assert.equal(q.platform, 21.6 + 19.6)         // + deslocamento
    assert.equal(rideQuote({ ...base, routeKm: 3.7 }).tripKm, 3.6)   // diferença de 0,1 km: fica o gravado
    assert.equal(rideQuote({ ...base, routeKm: null }).tripKm, 3.6)
    assert.equal(rideQuote({ ...base, distanceKm: null }).tripKm, 9.3)
})
test('frete de loja é fixo: nem rota nem piso mexem', () => {
    const q = rideQuote({ ...base, offeredPrice: 8, minHourly: 100 })
    assert.equal(q.shown, 8); assert.equal(q.shownKind, 'offered'); assert.equal(q.tripKm, 3.6)
})
test('o motorista com tarifa própria vê a tarifa própria; sem ela, a Tarifa iUser com o deslocamento', () => {
    const own = rideQuote({ ...base, customShape: custom, useCustom: true })
    assert.equal(own.shownKind, 'custom'); assert.equal(own.shown, 10 + 6.3 * 2 + 9.8 * 2)   // corrida + deslocamento até a partida pelo km dele
    const plat = rideQuote({ ...base, customShape: custom, useCustom: false })
    assert.equal(plat.shownKind, 'platform'); assert.equal(plat.shown, plat.platform)
    assert.equal(rideQuote({ ...base, customShape: null, useCustom: true }).shownKind, 'platform')   // marcou "própria" mas sem tarifa definida
})
test('o piso por hora só sobe a tarifa própria, nunca a Tarifa iUser de referência', () => {
    const q = rideQuote({ ...base, customShape: custom, useCustom: true, minHourly: 60 })
    assert.equal(q.minutes, 38)
    assert.equal(q.custom, 42.2)                  // por km: 10 + 6,3×2 + 9,8×2 = R$ 42,20 já passa de 38 min × R$ 60/h = R$ 38,00
    assert.equal(rideQuote({ ...base, customShape: custom, useCustom: true, minHourly: 120 }).custom, 76)   // 38 min × R$ 120/h = R$ 76,00 sobe a tarifa
    assert.equal(q.platform, 21.6 + 19.6)         // referência intacta
    assert.equal(rideQuote({ ...base, customShape: custom, useCustom: true, minHourly: 10 }).custom, 42.2)  // piso menor: vale a tarifa por km
})
test('Minha tarifa soma o deslocamento até a partida pelo km da tarifa PRÓPRIA; sem posição, só a corrida', () => {
    const own = { ...base, customShape: { fee: 10, base: 3, perKm: 3 }, useCustom: true }
    const q = rideQuote(own)
    assert.equal(q.custom, 10 + 6.3 * 3 + 9.8 * 3)   // R$ 58,30: o km do deslocamento é o da tarifa dele (R$ 3), não o da plataforma (R$ 2)
    assert.equal(q.platform, 21.6 + 19.6)             // a Tarifa iUser segue pela dela
    assert.equal(rideQuote({ ...own, pickupKm: null }).custom, 10 + 6.3 * 3)
    assert.equal(rideQuote({ ...own, offeredPrice: 8 }).shown, 8)   // frete de loja é fixo
})
test('ganho por hora = valor ÷ tempo total; sem os minutos não há', () => {
    const q = rideQuote(base)
    assert.equal(q.perHour, Math.round((41.2 / 38) * 60 * 100) / 100)
    assert.equal(rideQuote({ ...base, pickupMin: null }).perHour, null)
    assert.equal(rideQuote({ ...base, pickupKm: null }).platform, 21.6)       // sem posição: só a corrida
})

test('piso da plataforma (R$ 0,50 por minuto): nem a Tarifa iUser nem a tarifa própria saem abaixo dele; frete de loja fica de fora', () => {
    const cheap = { ...base, distanceKm: 1, routeKm: 1, pickupKm: 0.5, pickupMin: 25, tripMin: 15, minPerMinute: 0.5 }   // 40 min de trabalho: piso R$ 20,00
    const q = rideQuote({ ...cheap, customShape: custom, useCustom: true })
    assert.equal(q.platformMin, 20)
    assert.equal(q.platform, 20)                  // tarifa por km (7 + 1) seria bem menor
    assert.equal(q.custom, 20)                    // a própria também sobe até o piso
    assert.equal(q.shown, 20)
    const above = rideQuote({ ...base, minPerMinute: 0.5 })                 // 38 min → piso R$ 19,00; Tarifa iUser já é R$ 41,20
    assert.equal(above.platformMin, 19); assert.equal(above.platform, 41.2)
    assert.equal(rideQuote({ ...cheap, offeredPrice: 8 }).platformMin, 0)   // entrega: frete fixo
    assert.equal(rideQuote({ ...cheap, minPerMinute: 0 }).platformMin, 0)   // 0 desliga
    assert.equal(rideQuote({ ...cheap, pickupMin: null, minPerMinute: 0.5 }).platformMin, 0)   // sem os minutos não dá para medir
})
