// npm run test:ride-places — estimativa e filtro das sugestões de lugares do /pedir-motorista (src/modules/ride-places/domain.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeEstimate, roadKm, matches, PICKUP_ESTIMATE } from '../src/modules/ride-places/domain.ts'

const fare = (km) => 7 + Math.max(0, km - 3) * 2     // tarifa de exemplo (R$ 7 até 3 km, R$ 2 por km depois)
test('estimativa = corrida (nunca abaixo do mínimo) + R$ 6 de deslocamento', () => {
    assert.equal(PICKUP_ESTIMATE, 6)
    assert.deepEqual(placeEstimate(10, fare, 8), { value: 27, approx: false })   // 21 + 6
    assert.deepEqual(placeEstimate(1, fare, 8), { value: 14, approx: false })    // 7 sobe para o mínimo 8, + 6
    assert.deepEqual(placeEstimate(null, fare, 8), { value: 14, approx: true })  // sem referência: mínimo + 6, "a partir de"
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
