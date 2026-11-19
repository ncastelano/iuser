// Testes da tela de prazos e limites da operação de entrega (src/modules/delivery-rules). Rodar: npm run test:delivery-rules
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RULE_GROUPS, parseField, rulesDiff, validateRules } from '../src/modules/delivery-rules/domain.ts'

const migrations = ['20261130000068_delivery_cycle_guards.sql', '20261130000054_driver_before_store.sql', '20261130000012_delivery_dues_disputes.sql',
    '20261130000069_delivery_cash_trust.sql', '20261130000057_postpaid_debt_limit.sql', '20261130000075_postpaid_monthly_cap.sql']
    .map((f) => readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8')).join('\n')

test('todo campo da tela existe numa das tabelas (nada de nome inventado)', () => {
    for (const g of RULE_GROUPS) for (const f of g.fields) assert.match(migrations, new RegExp(`\\b${f.key}\\b`), `${g.id}.${f.key}`)
})
test('faixa, inteiro e campo vazio', () => {
    const ok = { enabled: true, suggest_after_minutes: 3, timeout_minutes: 15 }
    assert.deepEqual(validateRules('hold', ok), {})
    assert.ok(validateRules('hold', { ...ok, timeout_minutes: 999 }).timeout_minutes)
    assert.ok(validateRules('hold', { ...ok, timeout_minutes: 2.5 }).timeout_minutes)
    assert.ok(validateRules('hold', { ...ok, timeout_minutes: null }).timeout_minutes)
    assert.deepEqual(validateRules('postpaid', { debt_limit: 100, monthly_cap: null }), {}, 'teto vazio = sem teto')
})
test('regras que comparam campos', () => {
    assert.ok(validateRules('hold', { enabled: true, suggest_after_minutes: 20, timeout_minutes: 15 }).suggest_after_minutes)
    const t = Object.fromEntries(RULE_GROUPS.find((g) => g.id === 'trust').fields.map((f) => [f.key, f.kind === 'bool' ? true : 10]))
    assert.ok(validateRules('trust', { ...t, min_rating: 4.5, min_deliveries: 10, full_after_deliveries: 5 }).full_after_deliveries)
})
test('só manda o que mudou', () => {
    assert.deepEqual(rulesDiff('hold', { enabled: true, suggest_after_minutes: 3, timeout_minutes: 15 }, { enabled: true, suggest_after_minutes: 5, timeout_minutes: 15 }), { suggest_after_minutes: 5 })
    assert.deepEqual(rulesDiff('postpaid', { debt_limit: 100, monthly_cap: 100 }, { debt_limit: 100, monthly_cap: null }), { monthly_cap: null })
})
test('lê o texto do formulário', () => {
    const f = { key: 'x', label: 'x', kind: 'money' }
    assert.equal(parseField(f, '1.234,50'), 1234.5)
    assert.equal(parseField(f, ''), null)
    assert.ok(Number.isNaN(parseField(f, 'abc')))
})
