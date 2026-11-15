// Testes das regras puras da VÁLVULA DE SEGURANÇA dos uploads (src/modules/uploads/valve.ts). Rodar: npm run test:upload-valve
// (quem mede, desliga e religa de verdade é o banco: supabase/tests/upload_valve_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { valveLevel, valveState, eventText, valveToForm, valveFormToPatch, validateValvePatch, usedOfText, VALVE_DEFAULTS } from '../src/modules/uploads/valve.ts'

const s = { enabled: true, trip_pct: 80, critical_pct: 95, resume_pct: 65, storage_quota_gb: 1, egress_quota_gb: 5, cycle_day: 13, egress_manual_gb: null, egress_manual_cycle: null, override_until: null, tripped_at: null, tripped_stage: null, tripped_reason: null, last_eval_at: null, last_storage_pct: null, last_egress_pct: null }

test('padrões: religar < desligar < crítico', () => {
    assert.ok(VALVE_DEFAULTS.resume_pct < VALVE_DEFAULTS.trip_pct && VALVE_DEFAULTS.trip_pct < VALVE_DEFAULTS.critical_pct)
})
test('cor da barra: ok, atenção 10 pontos antes, disparo e crítico', () => {
    assert.equal(valveLevel(10, s), 'ok'); assert.equal(valveLevel(69, s), 'ok'); assert.equal(valveLevel(70, s), 'warn')
    assert.equal(valveLevel(79, s), 'warn'); assert.equal(valveLevel(80, s), 'trip'); assert.equal(valveLevel(94, s), 'trip'); assert.equal(valveLevel(95, s), 'critical'); assert.equal(valveLevel(300, s), 'critical')
})
test('estado: desligada, vigiando, liberada por um tempo, disparada', () => {
    const now = Date.parse('2026-11-03T12:00:00Z')
    assert.equal(valveState({ enabled: false, override_until: null, tripped_at: '2026-11-03T10:00:00Z' }, now), 'off')   // desligada vale mais que tudo
    assert.equal(valveState({ enabled: true, override_until: null, tripped_at: null }, now), 'watching')
    assert.equal(valveState({ enabled: true, override_until: null, tripped_at: '2026-11-03T10:00:00Z' }, now), 'tripped')
    assert.equal(valveState({ enabled: true, override_until: '2026-11-03T18:00:00Z', tripped_at: null }, now), 'override')
    assert.equal(valveState({ enabled: true, override_until: '2026-11-03T08:00:00Z', tripped_at: '2026-11-03T10:00:00Z' }, now), 'tripped')   // liberação vencida
})
test('histórico em português', () => {
    const base = { stage: 1, reason: 'storage', storage_pct: 84, egress_pct: 20, kinds: ['Música', 'Programa'] }
    assert.match(eventText({ ...base, action: 'trip' }), /Disparou o estágio 1 por armazenamento.*84%.*Música, Programa/)
    assert.match(eventText({ ...base, action: 'escalate', stage: 2, reason: 'egress', kinds: ['Flash'] }), /Subiu para o estágio 2 por banda de download/)
    assert.match(eventText({ ...base, action: 'resume' }), /Religou/)
    assert.match(eventText({ ...base, action: 'override', kinds: [] }), /nada estava desligado/)
    assert.match(eventText({ ...base, action: 'off', kinds: [] }), /Válvula desligada/)
})
test('formulário sem mudança não gera alteração; com mudança manda só o que mudou', () => {
    const f = valveToForm(s, false)
    const same = valveFormToPatch(f, s, false); assert.ok(same.ok); assert.deepEqual(same.patch, {})
    const r = valveFormToPatch({ ...f, trip_pct: '85', egress_quota_gb: '7,5' }, s, false); assert.ok(r.ok); assert.deepEqual(r.patch, { trip_pct: 85, egress_quota_gb: 7.5 })
})
test('formulário recusa números ruins e a ordem errada', () => {
    const f = valveToForm(s, false)
    const bad = valveFormToPatch({ ...f, trip_pct: '40', cycle_day: '31', storage_quota_gb: '0', egress_quota_gb: 'abc' }, s, false)
    assert.ok(!bad.ok); assert.ok(bad.errors.trip_pct); assert.ok(bad.errors.cycle_day); assert.ok(bad.errors.storage_quota_gb); assert.ok(bad.errors.egress_quota_gb)
    const order = valveFormToPatch({ ...f, resume_pct: '90' }, s, false); assert.ok(!order.ok); assert.match(order.errors.resume_pct, /religar < desligar < crítico/)
    const order2 = valveFormToPatch({ ...f, critical_pct: '75' }, s, false); assert.ok(!order2.ok)
})
test('banda digitada: vale no ciclo, vazio apaga, só aparece no formulário se for do ciclo atual', () => {
    const withManual = { ...s, egress_manual_gb: 3.2, egress_manual_cycle: '2026-10-13' }
    assert.equal(valveToForm(withManual, true).egress_manual_gb, '3.2')
    assert.equal(valveToForm(withManual, false).egress_manual_gb, '')                       // número de outro ciclo não aparece
    const f = valveToForm(withManual, true)
    const clear = valveFormToPatch({ ...f, egress_manual_gb: '' }, withManual, true); assert.ok(clear.ok); assert.deepEqual(clear.patch, { egress_manual_gb: null })
    const set = valveFormToPatch({ ...valveToForm(s, false), egress_manual_gb: '4,1' }, s, false); assert.ok(set.ok); assert.deepEqual(set.patch, { egress_manual_gb: 4.1 })
    assert.ok(!valveFormToPatch({ ...f, egress_manual_gb: '-1' }, withManual, true).ok)
})
test('a rota só aceita campos conhecidos com o tipo certo', () => {
    assert.deepEqual(validateValvePatch({ enabled: true }), { ok: true, patch: { enabled: true } })
    assert.deepEqual(validateValvePatch({ trip_pct: 85, egress_manual_gb: null }), { ok: true, patch: { trip_pct: 85, egress_manual_gb: null } })
    for (const bad of [null, [], 'x', {}, { enabled: 'sim' }, { trip_pct: 85.5 }, { trip_pct: 10 }, { cycle_day: 0 }, { egress_quota_gb: 0 }, { egress_quota_gb: '5' }, { hack: 1 }, { tripped_at: null }, { trip_pct: NaN }]) assert.ok(!validateValvePatch(bad).ok, JSON.stringify(bad))
})
test('texto do uso', () => { assert.match(usedOfText(1024 * 1024 * 1024, 5 * 1024 * 1024 * 1024), /1 GB de 5 GB/) })
