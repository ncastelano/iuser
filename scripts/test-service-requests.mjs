// Testes das regras puras do pedido de serviço (src/modules/service-requests/domain.ts).
// Rodar: npm run test:service-requests
import test from 'node:test'
import assert from 'node:assert/strict'
import { missingFields, splitAddress, shortAddress, distanceKm, formatDistance, aroundMe, countBy } from '../src/modules/service-requests/domain.ts'

const ok = { serviceType: 'pintor', customService: '', address: 'Rua A, 10, Centro', description: 'Pintar a sala', photoCount: 1 }

test('pedido completo: nada falta', () => assert.deepEqual(missingFields(ok), []))
test('falta tudo, na ordem da tela', () => {
    assert.deepEqual(missingFields({ serviceType: null, customService: '', address: '', description: '', photoCount: 0 }), ['serviço', 'endereço', 'descrição', 'foto'])
})
test('"Outro" exige o nome do serviço', () => {
    assert.deepEqual(missingFields({ ...ok, serviceType: 'outro', customService: '  ' }), ['serviço'])
    assert.deepEqual(missingFields({ ...ok, serviceType: 'outro', customService: 'Chaveiro' }), [])
})
test('espaços não contam como preenchido', () => {
    assert.deepEqual(missingFields({ ...ok, address: '   ', description: ' ' }), ['endereço', 'descrição'])
})
test('endereço dividido em rua e bairro/cidade', () => {
    assert.deepEqual(splitAddress('Rua A, 10, Centro, Porto Velho - RO'), { street: 'Rua A', area: '10, Centro' })
    assert.deepEqual(splitAddress('Porto Velho'), { street: 'Porto Velho', area: '' })
})
test('endereço curto é cortado', () => {
    assert.equal(shortAddress('Rua A, 10'), 'Rua A')
    assert.equal(shortAddress('Avenida Presidente Dutra Muito Comprida, 1', 20), 'Avenida Presidente...')
})

const PV = { lat: -8.7612, lng: -63.9039 } // Porto Velho
test('distância: mesmo ponto = 0; ~1 km de latitude ≈ 0,009°', () => {
    assert.equal(distanceKm(PV, PV), 0)
    const d = distanceKm(PV, { lat: PV.lat + 0.009, lng: PV.lng })
    assert.ok(d > 0.95 && d < 1.05)
})
test('distância: sem coordenada = null', () => {
    assert.equal(distanceKm(PV, { lat: null, lng: null }), null)
    assert.equal(distanceKm(null, PV), null)
})
test('formato da distância', () => {
    assert.equal(formatDistance(0.85), '850 m')
    assert.equal(formatDistance(2.34), '2,3 km')
    assert.equal(formatDistance(14.6), '15 km')
    assert.equal(formatDistance(null), '')
})
test('ao redor: raio filtra e ordena por distância; sem coordenada sai com raio ativo', () => {
    const items = [
        { id: 'longe', lat: PV.lat + 0.2, lng: PV.lng },
        { id: 'perto', lat: PV.lat + 0.005, lng: PV.lng },
        { id: 'sem', lat: null, lng: null },
        { id: 'meio', lat: PV.lat + 0.05, lng: PV.lng },
    ]
    assert.deepEqual(aroundMe(items, PV, 10).map((i) => i.id), ['perto', 'meio'])
    assert.deepEqual(aroundMe(items, PV, null).map((i) => i.id), ['perto', 'meio', 'longe', 'sem'])
})
test('ao redor: sem a posição da pessoa, não filtra nem reordena', () => {
    const items = [{ id: 'a', lat: 1, lng: 1 }, { id: 'b', lat: null, lng: null }]
    assert.deepEqual(aroundMe(items, null, 5).map((i) => i.id), ['a', 'b'])
})
test('contagem por tipo, do maior pro menor', () => {
    assert.deepEqual(countBy(['pintor', 'loja', 'pintor', 'eletricista'], (x) => x), [
        { key: 'pintor', count: 2 }, { key: 'eletricista', count: 1 }, { key: 'loja', count: 1 },
    ])
})
