// npm run test:ride-places — estimativa e filtro das sugestões de lugares do /pedir-motorista (src/modules/ride-places/domain.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeQuote, legFromKm, roadKm, matches, PICKUP_DEFAULT_KM } from '../src/modules/ride-places/domain.ts'
import { setMinRideFare } from '../src/modules/negotiation/domain.ts'

// tarifa de exemplo: R$ 7 até 3 km, R$ 2 por km depois; deslocamento R$ 2 por km
const shape = { base: 7, perKm: 2 }
const tripFare = (s, km) => (km == null ? s.base : s.base + Math.max(0, km - 3) * s.perKm)
const pickupFee = (s, km) => Math.round(km * s.perKm * 100) / 100
const quote = (trip, pickup, minPerMinute = 40 / 60) => placeQuote({ trip, pickup, shape, tripFare, pickupFee, minPerMinute }).value

test('estimativa = a conta do card do motorista: corrida + deslocamento, com os mínimos', () => {
    setMinRideFare(8)
    assert.equal(PICKUP_DEFAULT_KM, 3)
    // 10 km em 15 min, motorista a 2 km/4 min: 21 + 4 = 25; o piso (19 min × R$ 40/h = 12,67) não vale
    assert.equal(quote({ km: 10, min: 15 }, { km: 2, min: 4 }), 25)
    // sem motorista por perto: 3 km supostos (R$ 6), como o dono definiu
    assert.equal(quote({ km: 10, min: 15 }, null), 27)
    // corrida curta e LENTA: o mínimo de R$ 40 por hora manda (30 + 4,5 min = 34,5 min × 0,6667 ≈ 23)
    assert.ok(Math.abs(quote({ km: 2, min: 30 }, null) - 23) < 0.05)
    // ainda sem partida: só o mínimo da corrida + o deslocamento suposto
    assert.equal(quote(null, null), 13)
})
test('perna pela distância: tempo a 40 km/h', () => {
    assert.deepEqual(legFromKm(10), { km: 10, min: 15 })
})
test('km de rua = linha reta × 1,3', () => {
    const km = roadKm([-63.9039, -8.7612], [-63.8990, -8.7640])
    assert.ok(km > 0.6 && km < 0.9, String(km))
    assert.equal(roadKm(null, [-63.9, -8.7]), null)
})
test('filtro sem acento nem maiúscula', () => {
    assert.ok(matches('Farmácia Plantão 24h', 'farmacia'))
    assert.ok(matches('Qualquer', ''))
    assert.ok(!matches('Pizzaria', 'adega'))
    assert.ok(matches('Farmácia Plantão — Av. Sete de Setembro, 850', 'avenida sete'))   // avenida = Av.
    assert.ok(matches('Adega do Zé 24h', '24h ade'))                                    // qualquer ordem, começo das palavras
    assert.ok(!matches('Rua Carambola', 'avenida'))
})
