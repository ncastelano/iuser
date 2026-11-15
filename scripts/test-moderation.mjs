// Testes das regras puras da moderação (src/modules/moderation/domain.ts). Rodar: npm run test:moderation
// (ocultar de verdade, limite diário e decisões do admin são testados no banco: python3 scripts/local/test-moderation.py)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REASONS, TARGETS, HIDE_THRESHOLD, resultText, reasonSummary, ADMIN_ACTIONS } from '../src/modules/moderation/domain.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000013_moderation.sql', import.meta.url), 'utf8')
// a 28 (produto digital) redefine as listas do CHECK: valem as dela
const sql28 = readFileSync(new URL('../supabase/migrations/20261130000028_digital_moderation.sql', import.meta.url), 'utf8')

test('tipos e motivos do app são os MESMOS do banco', () => {
    const inDb28 = (re) => [...(sql28.match(re)?.[1] || '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    assert.deepEqual(TARGETS.map((t) => t.code).sort(), inDb28(/content_reports_target_type_check CHECK \(target_type IN \(([^)]*)\)/).sort())
    assert.deepEqual(REASONS.map((r) => r.code).sort(), inDb28(/content_reports_reason_check CHECK \(reason IN \(([^)]*)\)/).sort())
})
test('o limite para ocultar é o mesmo do banco (3 pessoas)', () => {
    assert.equal(HIDE_THRESHOLD, 3)
    assert.match(sql, /v_n >= 3/)
})
test('textos de retorno', () => {
    assert.match(resultText('hidden'), /ocultado/)
    assert.match(resultText('already'), /já denunciou/)
    assert.match(resultText('reported'), /analisar/)
})
test('resumo dos motivos, o mais citado primeiro', () => {
    assert.equal(reasonSummary(['spam', 'scam', 'spam']), 'Spam ×2 · Golpe ou fraude ×1')
    assert.equal(reasonSummary([]), '')
})
test('ações do admin = as do banco', () => {
    assert.deepEqual(ADMIN_ACTIONS.map((a) => a.code), ['hide', 'clear', 'restore'])
})
test('a função report_content da 28 aceita os mesmos tipos e motivos do app', () => {
    for (const t of TARGETS) assert.ok(sql28.includes(`'${t.code}'`), t.code)
    for (const r of REASONS) assert.ok(sql28.includes(`'${r.code}'`), r.code)
    assert.match(sql28, /v_n >= 3/)
})
