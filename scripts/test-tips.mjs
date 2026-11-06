// Testes das regras puras da gorjeta (src/modules/tips/domain.ts). Rodar: npm run test:tips
// (quem pode o quê, limite por hora e confirmação da loja são testados no banco: supabase/tests/store_tips_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TIP_MIN_CENTS, TIP_MAX_CENTS, TIP_PRESETS, TIP_MESSAGE_MAX, formatCents, parseAmountCents, validateTipAmount, supportersLabel, TIP_STATUS_LABEL } from '../src/modules/tips/domain.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000029_store_tips.sql', import.meta.url), 'utf8')

test('a faixa e o recado são os MESMOS do banco', () => {
    assert.match(sql, new RegExp(`amount_cents BETWEEN ${TIP_MIN_CENTS} AND ${TIP_MAX_CENTS}`))
    assert.match(sql, new RegExp(`char_length\\(message\\) <= ${TIP_MESSAGE_MAX}`))
    assert.ok(TIP_PRESETS.every((c) => c >= TIP_MIN_CENTS && c <= TIP_MAX_CENTS))
})
test('o estado "expirou" existe no painel da loja (awaiting com mais de 24 h)', () => {
    assert.match(sql, /interval '24 hours'/)
    assert.equal(TIP_STATUS_LABEL.expired, 'Expirou')
})
test('o que a pessoa digita vira centavos', () => {
    assert.equal(parseAmountCents('7,5'), 750)
    assert.equal(parseAmountCents('7.50'), 750)
    assert.equal(parseAmountCents('R$ 12'), 1200)
    assert.equal(parseAmountCents(' 1000 '), 100000)
    assert.equal(parseAmountCents('0,05'), 5)
    assert.equal(parseAmountCents(''), null)
    assert.equal(parseAmountCents('abc'), null)
    assert.equal(parseAmountCents('1,234'), null)
    assert.equal(parseAmountCents('-5'), null)
})
test('validação do valor', () => {
    assert.match(validateTipAmount(null), /valor/)
    assert.match(validateTipAmount(99), /mínimo/)
    assert.match(validateTipAmount(100001), /máximo/)
    assert.equal(validateTipAmount(100), null)
    assert.equal(validateTipAmount(100000), null)
})
test('textos', () => {
    assert.equal(formatCents(1000), 'R$ 10,00')
    assert.equal(formatCents(1050), 'R$ 10,50')
    assert.equal(supportersLabel(0), '')
    assert.equal(supportersLabel(1), '1 apoiador')
    assert.equal(supportersLabel(7), '7 apoiadores')
})
