// Testes das regras puras da moderação (src/modules/moderation/domain.ts). Rodar: npm run test:moderation
// (ocultar de verdade, limite diário e decisões do admin são testados no banco: python3 scripts/local/test-moderation.py)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REASONS, TARGETS, HIDE_THRESHOLD, resultText, reasonSummary, ADMIN_ACTIONS } from '../src/modules/moderation/domain.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000013_moderation.sql', import.meta.url), 'utf8')

test('tipos e motivos do app são os MESMOS do banco', () => {
    const inDb = (re) => [...(sql.match(re)?.[1] || '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    assert.deepEqual(TARGETS.map((t) => t.code).sort(), inDb(/target_type text NOT NULL CHECK \(target_type IN \(([^)]*)\)/).sort())
    assert.deepEqual(REASONS.map((r) => r.code).sort(), inDb(/reason\s+text NOT NULL CHECK \(reason IN \(([^)]*)\)/).sort())
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
