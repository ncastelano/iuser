// Motoristas ativos no mapa (src/lib/activeDrivers.ts): validação do que a RPC devolve e contagem. A privacidade e as regras de
// "ativo" são provadas no banco: supabase/tests/active_drivers_map_scenarios.sql (npm run test:active-drivers:staging).
// Rodar: npm run test:active-drivers
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseActiveDrivers, countByKind, fetchActiveDrivers } from '../src/lib/activeDrivers.ts'

test('aceita só carro/moto/bicicleta com coordenadas válidas e descarta o resto', () => {
    const list = parseActiveDrivers([
        { kind: 'moto', lat: -8.76, lng: -63.9, age_seconds: 12 },
        { kind: 'carro', lat: '-8.75', lng: '-63.91', age_seconds: 0 },
        { kind: 'bicicleta', lat: -8.7, lng: -63.8, age_seconds: -5 },
        { kind: 'aviao', lat: 1, lng: 1 },
        { kind: 'moto', lat: 200, lng: 0 },
        { kind: 'moto', lat: 'x', lng: 0 },
        null,
    ])
    assert.deepEqual(list.map((d) => d.kind), ['moto', 'carro', 'bicicleta'])
    assert.equal(list[2].ageSeconds, 0)
    assert.deepEqual(parseActiveDrivers('lixo'), [])
})

test('conta por tipo', () => {
    assert.deepEqual(countByKind(parseActiveDrivers([{ kind: 'moto', lat: 0, lng: 0 }, { kind: 'moto', lat: 0, lng: 0 }, { kind: 'carro', lat: 0, lng: 0 }])), { carro: 1, moto: 2, bicicleta: 0 })
})

test('falha da consulta devolve null (não confunde com "sem motoristas")', async () => {
    const boom = { rpc: async () => ({ data: null, error: { message: 'x' } }) }
    const thrown = { rpc: async () => { throw new Error('rede') } }
    const ok = { rpc: async () => ({ data: [{ kind: 'moto', lat: 1, lng: 2, age_seconds: 3 }], error: null }) }
    assert.equal(await fetchActiveDrivers(boom, 0, 0), null)
    assert.equal(await fetchActiveDrivers(thrown, 0, 0), null)
    assert.equal((await fetchActiveDrivers(ok, 0, 0)).length, 1)
    const empty = { rpc: async () => ({ data: [], error: null }) }
    assert.deepEqual(await fetchActiveDrivers(empty, 0, 0), [])
})
