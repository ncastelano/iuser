// Testes do tipo do perfil (src/lib/profileType.ts). Rodar: npm run test:profile-type
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROFILE_TYPES, defaultProfileTab, parseProfileType, profileMainAction, profileTabOrder, profileTypeMissing } from '../src/lib/profileType.ts'

test('os tipos do app são os mesmos do CHECK do banco', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261130000071_profile_type.sql', import.meta.url), 'utf8')
    const m = sql.match(/profile_type IN \(([^)]+)\)/)
    assert.deepEqual(m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)), PROFILE_TYPES.map((p) => p.id))
})

test('valor desconhecido vira pessoal', () => {
    assert.equal(parseProfileType('motorista'), 'motorista')
    assert.equal(parseProfileType('loja'), 'pessoal')
    assert.equal(parseProfileType(null), 'pessoal')
})

test('aba que abre e a ordem das abas', () => {
    assert.equal(defaultProfileTab('servicos', { publications: 3, services: 2 }), 'services')
    assert.equal(defaultProfileTab('servicos', { publications: 3, services: 0 }), 'publications')
    assert.equal(defaultProfileTab('agendamentos', { publications: 0, services: 1 }), 'services')
    assert.equal(defaultProfileTab('pessoal', { publications: 0, services: 5 }), 'publications')
    assert.equal(defaultProfileTab('motorista', { publications: 0, services: 5 }), 'publications')
    assert.deepEqual(profileTabOrder('servicos'), ['services', 'publications', 'profile_comments'])
    assert.deepEqual(profileTabOrder('pessoal'), ['publications', 'services', 'profile_comments'])
})

test('botão principal para quem visita', () => {
    const base = { allowScheduling: false, hasVehicle: false, chatEnabled: false, services: 0 }
    assert.equal(profileMainAction('pessoal', { ...base, allowScheduling: true, hasVehicle: true, chatEnabled: true }), null)
    assert.equal(profileMainAction('agendamentos', { ...base, allowScheduling: true }), 'schedule')
    assert.equal(profileMainAction('agendamentos', { ...base, chatEnabled: true }), 'hire')   // agenda desligada: cai em contratar
    assert.equal(profileMainAction('agendamentos', base), null)
    assert.equal(profileMainAction('motorista', { ...base, hasVehicle: true }), 'ride')
    assert.equal(profileMainAction('motorista', base), null)                                  // sem veículo não pede corrida
    assert.equal(profileMainAction('servicos', { ...base, services: 1 }), 'hire')
    assert.equal(profileMainAction('servicos', base), null)
})

test('o que falta para o tipo funcionar (aviso ao dono)', () => {
    const s = { allowScheduling: false, hasVehicle: false, services: 0 }
    assert.equal(profileTypeMissing('agendamentos', s), 'agenda')
    assert.equal(profileTypeMissing('motorista', s), 'vehicle')
    assert.equal(profileTypeMissing('servicos', s), 'service')
    assert.equal(profileTypeMissing('pessoal', s), null)
    assert.equal(profileTypeMissing('motorista', { ...s, hasVehicle: true }), null)
})
