// Testes das regras puras do Radar (src/modules/radar/domain.ts).
// Rodar: npm run test:radar
import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, formatDistance, filterItems, sortItems, crownRanks, countByKind } from '../src/modules/radar/domain.ts'

const PV = { lat: -8.7612, lng: -63.9039 }
const mk = (o) => ({
    id: 'x', kind: 'loja', name: 'X', imageUrl: null, lat: PV.lat, lng: PV.lng, subtitle: null, open: true, rating: null, ratingsCount: 0,
    views: 0, sales: 0, comments: 0, followers: 0, createdAt: '2026-01-01', price: null, href: '/x', live: false, points: 0, ownerId: null, ...o,
})
const near = (id, km, o = {}) => mk({ id, name: id, lat: PV.lat + km / 111, ...o })

test('distância e formato', () => {
    assert.equal(distanceKm(PV, PV), 0)
    assert.ok(Math.abs(distanceKm(PV, { lat: PV.lat + 0.009, lng: PV.lng }) - 1) < 0.05)
    assert.equal(formatDistance(0.85), '850 m')
    assert.equal(formatDistance(2.34), '2,3 km')
    assert.equal(formatDistance(14.6), '15 km')
    assert.equal(formatDistance(null), '')
})

const base = { kind: 'loja', query: '', onlyOpen: false, radiusKm: null }

test('filtro por tipo, busca sem acento e @', () => {
    const items = [near('padaria', 1, { name: 'Padaria São José' }), near('dona', 1, { kind: 'pessoa', name: '@dona' })]
    assert.deepEqual(filterItems(items, base, PV).map((i) => i.id), ['padaria'])
    assert.deepEqual(filterItems(items, { ...base, query: 'sao jose' }, PV).map((i) => i.id), ['padaria'])
    assert.deepEqual(filterItems(items, { ...base, kind: 'pessoa', query: '@dona' }, PV).map((i) => i.id), ['dona'])
})
test('aberto agora só vale pra lojas', () => {
    const items = [near('aberta', 1, { open: true }), near('fechada', 1, { open: false }), near('prod', 1, { kind: 'produto', open: null })]
    assert.deepEqual(filterItems(items, { ...base, onlyOpen: true }, PV).map((i) => i.id), ['aberta'])
    assert.deepEqual(filterItems(items, { ...base, kind: 'produto', onlyOpen: true }, PV).map((i) => i.id), ['prod'])
})
test('raio filtra com a posição; sem posição não filtra', () => {
    const items = [near('perto', 1), near('longe', 8)]
    assert.deepEqual(filterItems(items, { ...base, radiusKm: 5 }, PV).map((i) => i.id), ['perto'])
    assert.deepEqual(filterItems(items, { ...base, radiusKm: 5 }, null).map((i) => i.id), ['perto', 'longe'])
})
test('ordenação: mais perto, mais vistos, avaliados', () => {
    const items = filterItems([near('a', 5, { views: 10, rating: 4 }), near('b', 1, { views: 1, rating: 5 }), near('c', 3, { views: 99, rating: 3 })], base, PV)
    assert.deepEqual(sortItems(items, 'perto').map((i) => i.id), ['b', 'c', 'a'])
    assert.deepEqual(sortItems(items, 'vistos').map((i) => i.id), ['c', 'a', 'b'])
    assert.deepEqual(sortItems(items, 'avaliados').map((i) => i.id), ['b', 'a', 'c'])
})
test('mais perto sem posição cai em mais vistos', () => {
    const items = filterItems([near('a', 5, { views: 1 }), near('b', 1, { views: 9 })], base, null)
    assert.deepEqual(sortItems(items, 'perto').map((i) => i.id), ['b', 'a'])
})
test('coroas: três mais populares; pessoas por pontos; zero não leva coroa', () => {
    const r = crownRanks([near('a', 1, { views: 5 }), near('b', 1, { views: 50 }), near('c', 1, { views: 20 }), near('d', 1, { views: 1 }), near('z', 1, { views: 0 })])
    assert.deepEqual([...r.entries()], [['b', 1], ['c', 2], ['a', 3]])
    const p = crownRanks([near('p1', 1, { kind: 'pessoa', views: 999, points: 7 }), near('p2', 1, { kind: 'pessoa', points: 30 })])
    assert.equal(p.get('p2'), 1)
})
test('contagem por tipo respeita os filtros', () => {
    const items = [near('l1', 1), near('l2', 9), near('s1', 1, { kind: 'servico' }), near('pe', 1, { kind: 'pessoa' })]
    assert.deepEqual(countByKind(items, { query: '', onlyOpen: false, radiusKm: 5 }, PV), { loja: 1, servico: 1, produto: 0, pessoa: 1 })
})
