// Testes das regras puras do pedido de serviço (src/modules/service-requests/domain.ts).
// Rodar: npm run test:service-requests
import test from 'node:test'
import assert from 'node:assert/strict'
import { missingFields, splitAddress, shortAddress } from '../src/modules/service-requests/domain.ts'

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
