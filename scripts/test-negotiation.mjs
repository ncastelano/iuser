// Testes das regras puras da negociação de corridas (src/modules/negotiation/domain.ts). Rodar: npm run test:negotiation
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAmount, parseMoney, totalMinutes, perHour, hourlyFloor, suggestedFare, belowMinimum, belowMinimumText, parseHourlyCheck, quickValues, midpoint, offerFromRow, secondsLeft, isExpired, clock, currentOffer, whoMustRespond, roundsLeft, negotiationError, platformFloor, belowPlatformFloor, platformFloorText, DEFAULT_MIN_PER_MINUTE, DEFAULT_MIN_PER_MINUTE_CAP, minPerMinuteProblem, capProblem, fareDriver, fareDriverText } from '../src/modules/negotiation/domain.ts'

test('valor válido: positivo e até R$ 100.000', () => {
    assert.equal(validateAmount(12.5), null)
    for (const bad of [0, -1, NaN, null, undefined, 100001]) assert.ok(validateAmount(bad), String(bad))
})
test('valor digitado em reais', () => {
    assert.equal(parseMoney('12,50'), 12.5)
    assert.equal(parseMoney('R$ 1.250,50'), 1250.5)
    assert.equal(parseMoney('12.5'), 12.5)
    assert.equal(parseMoney('abc'), null)
})
test('tempo total = buscar + corrida; ganho por hora contínuo', () => {
    assert.equal(totalMinutes(20, 18), 38)
    assert.equal(totalMinutes(null, 18), 18)
    assert.equal(totalMinutes(10, null), null)
    assert.equal(perHour(27.72, 38), 43.77)        // o caso da corrida longa: ~R$ 44/h, não "R$ 28/h"
    assert.equal(perHour(12, 20), 36)
    assert.equal(perHour(0, 20), null)
    assert.equal(perHour(10, 0), null)
})
test('piso por tempo e tarifa sugerida: o MAIOR, nunca a soma', () => {
    assert.equal(hourlyFloor(38, 50), 31.67)
    assert.equal(hourlyFloor(38, null), null)
    assert.equal(suggestedFare(27.72, hourlyFloor(38, 50)), 31.67)   // piso maior que a tarifa por km
    assert.equal(suggestedFare(40, hourlyFloor(38, 50)), 40)         // tarifa por km já cobre
    assert.equal(suggestedFare(27.72, null), 27.72)                  // sem mínimo: comportamento atual
})
test('abaixo do mínimo e o texto do aviso', () => {
    assert.equal(belowMinimum(32, 50), true)
    assert.equal(belowMinimum(50, 50), false)
    assert.equal(belowMinimum(32, null), false)
    assert.equal(belowMinimum(null, 50), false)
    assert.equal(belowMinimumText(32, 50), 'Esta oferta representa aproximadamente R$ 32/h, abaixo do seu mínimo de R$ 50/h.')
})
test('resposta do banco → verificação do mínimo', () => {
    const c = parseHourlyCheck({ minutes: '30.0', per_hour: 40, min_hourly: 50, protection: 'block', below: true, blocked: true })
    assert.deepEqual(c, { minutes: 30, perHour: 40, minHourly: 50, protection: 'block', below: true, blocked: true, platformMin: null, belowPlatform: false })
    const p = parseHourlyCheck({ minutes: 30, per_hour: 28, platform_min: 15, below_platform: true, blocked: true })
    assert.equal(p.platformMin, 15); assert.equal(p.belowPlatform, true)
    assert.equal(parseHourlyCheck(null), null)
    assert.equal(parseHourlyCheck({ min_hourly: null }).minHourly, null)
    assert.equal(parseHourlyCheck({}).protection, 'warn')
})
test('valores rápidos: dinâmicos, sem repetir, em R$ 1', () => {
    assert.deepEqual(quickValues(16), [14, 16, 18, 20])
    assert.deepEqual(quickValues(100), [88, 100, 112, 125])
    const small = quickValues(2)
    assert.ok(small.length >= 3 && new Set(small).size === small.length && small.every((v) => v >= 1))
    assert.deepEqual(quickValues(0), [])
    assert.deepEqual(quickValues(null), [])
    assert.ok(quickValues(16, { max: 17 }).every((v) => v <= 17))
})
test('sugestão do iUser: o meio, só quando há distância', () => {
    assert.equal(midpoint(12, 16), 14)
    assert.equal(midpoint(16, 12), 14)
    assert.equal(midpoint(12, 13), null)
    assert.equal(midpoint(12, 12), null)
    assert.equal(midpoint(null, 12), null)
    assert.equal(midpoint(0, 12), null)
})
test('linha do histórico de propostas', () => {
    const row = { id: 'o', ride_request_id: 'r', application_id: 'a', author_role: 'driver', amount: '16.00', status: 'pending', expires_at: null, created_at: '2026-01-01T00:00:00Z' }
    assert.equal(offerFromRow(row).amount, 16)
    assert.equal(offerFromRow({ ...row, status: 'estranho' }), null)
    assert.equal(offerFromRow({ ...row, author_role: 'admin' }), null)
    assert.equal(offerFromRow({ ...row, amount: 0 }), null)
    assert.equal(offerFromRow(null), null)
})
test('expiração e relógio', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    assert.equal(secondsLeft('2026-01-01T00:02:45Z', now), 165)
    assert.equal(isExpired('2025-12-31T23:59:00Z', now), true)
    assert.equal(isExpired(null, now), false)
    assert.equal(clock(165), '2:45')
    assert.equal(clock(5), '0:05')
})
test('proposta aberta mais recente e de quem é a vez', () => {
    const now = Date.parse('2026-01-01T00:10:00Z')
    const mk = (id, role, status, created, exp = null) => ({ id, rideId: 'r', applicationId: 'a', authorRole: role, amount: 10, status, expiresAt: exp, createdAt: created })
    const list = [mk('1', 'driver', 'superseded', '2026-01-01T00:01:00Z'), mk('2', 'passenger', 'pending', '2026-01-01T00:05:00Z', '2026-01-01T00:08:00Z'), mk('3', 'driver', 'pending', '2026-01-01T00:09:00Z', '2026-01-01T00:12:00Z')]
    assert.equal(currentOffer(list, now).id, '3')                                     // a de 00:05 já expirou; vale a mais nova aberta
    assert.equal(whoMustRespond(currentOffer(list, now)), 'passenger')
    assert.equal(whoMustRespond(mk('x', 'passenger', 'pending', '')), 'driver')
    assert.equal(currentOffer([mk('2', 'passenger', 'pending', '2026-01-01T00:05:00Z', '2026-01-01T00:08:00Z')], now), null)
    assert.equal(whoMustRespond(null), null)
    assert.equal(roundsLeft(list, 'driver'), 1)
    assert.equal(roundsLeft(list, 'passenger'), 2)
})
test('mensagens de erro em português', () => {
    assert.match(negotiationError({ hint: 'below_min_hourly' }), /ganho mínimo/)
    assert.match(negotiationError({ hint: 'offer_expired' }), /expirou/)
    assert.equal(negotiationError({ message: 'x' }), 'x')
    assert.ok(negotiationError(null))
})

test('valor mínimo da plataforma: minutos × mínimo por minuto, arredondado para cima', () => {
    assert.equal(platformFloor(38, 0.5), 19)
    assert.equal(platformFloor(38.05, 0.5), 19.03)
    assert.equal(platformFloor(12, 0.5), 6)
    assert.equal(platformFloor(null, 0.5), 0)
    assert.equal(platformFloor(30, 0), 0)
    assert.equal(platformFloor(30, null), 0)
    assert.equal(belowPlatformFloor(18.99, 19), true)
    assert.equal(belowPlatformFloor(19, 19), false)
    assert.equal(belowPlatformFloor(5, 0), false)
    assert.equal(platformFloorText(19, 0.5), 'O valor mínimo da plataforma para esta corrida é R$ 19,00 (R$ 0,50 por minuto de trabalho).')
    assert.match(negotiationError({ hint: 'below_platform_min', message: 'O valor mínimo é R$ 19,00' }), /R\$ 19,00/)
})

test('mínimo padrão R$ 0,80 por minuto, teto R$ 1,00; só o admin eleva o teto', () => {
    assert.equal(DEFAULT_MIN_PER_MINUTE, 0.8)
    assert.equal(DEFAULT_MIN_PER_MINUTE_CAP, 1)
    assert.equal(platformFloor(38, DEFAULT_MIN_PER_MINUTE), 30.4)              // 38 min não saem por menos de R$ 30,40
    assert.equal(minPerMinuteProblem(0.8), null)
    assert.equal(minPerMinuteProblem(1), null)                                  // no teto: vale
    assert.equal(minPerMinuteProblem(0), null)                                  // 0 desliga
    assert.match(minPerMinuteProblem(1.01), /não pode passar de R\$ 1,00/)
    assert.equal(minPerMinuteProblem(1.5, 2), null)                             // com o teto elevado pelo admin
    assert.ok(minPerMinuteProblem(-1))
    assert.ok(minPerMinuteProblem(NaN))
    assert.equal(capProblem(1.5, 0.8), null)
    assert.match(capProblem(0.7, 0.8), /abaixo do mínimo/)
    assert.ok(capProblem(25, 0.8))
    assert.ok(capProblem(0, 0))
})

test('o que decidiu a Minha tarifa: km, ganho mínimo por hora ou mínimo da plataforma', () => {
    assert.equal(fareDriver(30, null, 0), 'km')
    assert.equal(fareDriver(30, 25, 20), 'km')
    assert.equal(fareDriver(7, 5, 9), 'platform')
    assert.equal(fareDriver(7, 12, 6.37), 'hourly')
    assert.equal(fareDriver(7, 5, 6.37), 'km')            // o piso não subiu nada
    assert.equal(fareDriver(7, 12, 12), 'platform')      // empate com o da plataforma: é regra da plataforma
    assert.equal(fareDriver(7, 7, 7), 'km')                // nada subiu a tarifa
    assert.equal(fareDriverText('km', 7, null, 0.8), '')
    assert.match(fareDriverText('platform', 7, null, 0.8), /mínimo da plataforma \(R\$ 0,80 por minuto/)
    assert.match(fareDriverText('hourly', 7, 60, 0.8), /ganho mínimo de R\$ 60,00 por hora/)
})
