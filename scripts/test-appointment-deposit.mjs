// Entrada no agendamento (src/lib/appointmentDeposit.ts). Rodar: npm run test:appointment-deposit
import test from 'node:test'
import assert from 'node:assert/strict'
import { previewDeposit, depositConfigOf, depositRuleLabel } from '../src/lib/appointmentDeposit.ts'

test('sem entrada: zero', () => {
    assert.equal(previewDeposit({ mode: 'none', value: 0 }, 200), 0)
    assert.equal(depositConfigOf({ deposit_mode: 'lixo', deposit_value: 50 }).mode, 'none')
})

test('porcentagem do total, em centavos; 100% = valor total', () => {
    assert.equal(previewDeposit({ mode: 'percent', value: 30 }, 220), 66)
    assert.equal(previewDeposit({ mode: 'percent', value: 33 }, 100.5), 33.17)
    assert.equal(previewDeposit({ mode: 'percent', value: 100 }, 180), 180)
    assert.equal(previewDeposit({ mode: 'percent', value: 30 }, 0), 0)
})

test('valor fixo, limitado ao total quando o serviço custa menos', () => {
    assert.equal(previewDeposit({ mode: 'fixed', value: 50 }, 220), 50)
    assert.equal(previewDeposit({ mode: 'fixed', value: 50 }, 30), 30)
    assert.equal(previewDeposit({ mode: 'fixed', value: 50 }, 0), 50)
})

test('textos da regra', () => {
    assert.match(depositRuleLabel({ mode: 'percent', value: 30 }), /30%/)
    assert.match(depositRuleLabel({ mode: 'percent', value: 100 }), /valor total/)
    assert.match(depositRuleLabel({ mode: 'fixed', value: 50 }), /50,00/)
})
