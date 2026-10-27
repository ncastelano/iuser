// Testes das regras puras da página /pessoas (src/modules/people/domain.ts). Rodar: npm run test:people
import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, personFromMapRow, sortNearby, formatKm, peopleLabel, joinedLabel, placeFromRow, normalizeQuery, canSearch } from '../src/modules/people/domain.ts'

const PVH = { lat: -8.7619, lng: -63.9039 }
test('distância: zero no mesmo ponto e ~1,1 km a 0,01° de latitude', () => {
    assert.equal(distanceKm(PVH, PVH), 0)
    const d = distanceKm(PVH, { lat: PVH.lat + 0.01, lng: PVH.lng })
    assert.ok(d > 1.05 && d < 1.15, String(d))
})
test('pessoa do mapa: precisa de @ e id; distância só com local de referência', () => {
    assert.equal(personFromMapRow({ id: 'a' }, null), null)
    const near = personFromMapRow({ id: 'a', profile_slug: 'ana', name: 'Ana', lat: PVH.lat + 0.01, lng: PVH.lng, points: 5 }, PVH)
    assert.ok(near && near.distanceKm && near.distanceKm > 1)
    const none = personFromMapRow({ id: 'a', profile_slug: 'ana', name: 'Ana', lat: 1, lng: 1 }, null)
    assert.equal(none?.distanceKm, null)
})
test('ordem: perto primeiro; sem local ou empate, mais pontos', () => {
    const mk = (id, d, pts) => ({ id, name: id, slug: id, avatarPath: null, points: pts, distanceKm: d })
    assert.deepEqual(sortNearby([mk('longe', 5, 99), mk('perto', 1, 1), mk('sem', null, 50)], true).map((p) => p.id), ['perto', 'longe', 'sem'])
    assert.deepEqual(sortNearby([mk('a', null, 1), mk('b', null, 9)], false).map((p) => p.id), ['b', 'a'])
})
test('textos: distância, pessoas e quando entrou', () => {
    assert.equal(formatKm(0.34), '340 m')
    assert.equal(formatKm(2.46), '2,5 km')
    assert.equal(peopleLabel(1), '1 pessoa'); assert.equal(peopleLabel(37), '37 pessoas')
    const now = new Date('2026-10-27T12:00:00Z').getTime()
    assert.equal(joinedLabel('2026-10-27T01:00:00Z', now), 'entrou hoje')
    assert.equal(joinedLabel('2026-10-26T01:00:00Z', now), 'entrou ontem')
    assert.equal(joinedLabel('2026-10-22T12:00:00Z', now), 'entrou há 5 dias')
})
test('local e busca', () => {
    assert.equal(placeFromRow({}), null)
    assert.deepEqual(placeFromRow({ place: 'Centro', people_count: '37', avatars: ['a', null, 'b'] }), { place: 'Centro', count: 37, avatars: ['a', 'b'] })
    assert.equal(normalizeQuery('  @João  '), 'joao')
    assert.equal(canSearch('a'), false); assert.equal(canSearch('jo'), true)
})
