// Testes das regras puras da estimativa (src/modules/delivery-estimate/domain.ts). A fórmula do frete é testada no
// banco (supabase/tests/delivery_estimate_scenarios.sql). Rodar: npm run test:delivery-estimate
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    parseEstimateRequest, destinationMatchesAddress, haversineKm, estimateTotals, formatBRLFromCents, toDeliveryEstimate, ESTIMATE_MESSAGE,
} from '../src/modules/delivery-estimate/domain.ts'

const STORE = '93e432b4-0472-4ae4-abb1-45b516e2f7bd'
const ok = { storeId: STORE, lat: -8.75, lng: -63.9, address: 'Rua Dom Pedro II, 800, Porto Velho' }

test('aceita só os quatro campos e descarta valores de frete, distância e tarifa enviados pelo app', () => {
    const r = parseEstimateRequest({ ...ok, delivery_fee: 1, estimated_freight: 1, distance: 0.1, distance_km: 0.1, base_fare: 0, price_per_km: 0, min_freight: 0, max_freight: 1 })
    assert.equal(r.ok, true)
    assert.deepEqual(Object.keys(r.value).sort(), ['address', 'lat', 'lng', 'storeId'])
})

test('rejeita loja, coordenadas e endereço inválidos', () => {
    assert.equal(parseEstimateRequest(null).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, storeId: 'abc' }).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, lat: '1' }).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, lat: NaN }).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, lng: 400 }).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, address: '  ' }).ok, false)
    assert.equal(parseEstimateRequest({ ...ok, address: 'x'.repeat(301) }).ok, false)
})

test('coerência do destino: endereço geocodificado precisa estar perto do ponto enviado', () => {
    assert.equal(destinationMatchesAddress({ lat: -8.75, lng: -63.9 }, { lat: -8.7505, lng: -63.9005 }), true)
    assert.equal(destinationMatchesAddress({ lat: -8.75, lng: -63.9 }, { lat: -8.9, lng: -63.9 }), false)
    assert.ok(haversineKm(-8.75, -63.9, -8.75, -63.9) < 1e-9)
})

test('totais em centavos, sem ponto flutuante', () => {
    const t = estimateTotals(0.1 + 0.2, 8.47)
    assert.deepEqual(t, { itemsCents: 30, freightCents: 847, totalCents: 877 })
    assert.equal(formatBRLFromCents(877), 'R$ 8,77')
})

test('resposta pública traz só o necessário e a mensagem deixa claro que é estimativa', () => {
    const e = toDeliveryEstimate({ estimate_id: 'e1', estimated_freight: '8.47', distance_km: '5.310', calculation_version: 'est-v1', expires_at: '2026-10-16T12:00:00Z', base_cents: 800 })
    assert.deepEqual(Object.keys(e).sort(), ['calculationVersion', 'distanceKm', 'estimateId', 'estimatedFreight', 'expiresAt'])
    assert.equal(e.estimatedFreight, 8.47)
    assert.match(ESTIMATE_MESSAGE, /poderá ser ajustado/)
    assert.match(ESTIMATE_MESSAGE, /valor final antes do pagamento/)
})
