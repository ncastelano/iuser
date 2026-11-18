// Testes das regras puras dos aceites legais e de "Quem vende" (src/modules/legal). Rodar: npm run test:legal
// (quem aceita, versão, trava do modo motorista e o documento mascarado são testados no banco: supabase/tests/legal_acceptances_scenarios.sql)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { docValid, formatDoc, parseMyLegal, termsGateHidden, DECLARATIONS } from '../src/modules/legal/domain.ts'

const sql = readFileSync(new URL('../supabase/migrations/20261130000082_legal_acceptances_seller.sql', import.meta.url), 'utf8')

test('CPF e CNPJ: a mesma conta do banco (_doc_valid)', () => {
    assert.equal(docValid('cpf', '529.982.247-25'), true)
    assert.equal(docValid('cpf', '529.982.247-24'), false)
    assert.equal(docValid('cpf', '111.111.111-11'), false)
    assert.equal(docValid('cnpj', '11.222.333/0001-81'), true)
    assert.equal(docValid('cnpj', '11.222.333/0001-82'), false)
    assert.equal(docValid('cnpj', '529.982.247-25'), false)
})
test('máscara enquanto digita', () => {
    assert.equal(formatDoc('cpf', '52998224725'), '529.982.247-25')
    assert.equal(formatDoc('cnpj', '11222333000181'), '11.222.333/0001-81')
    assert.equal(formatDoc('cpf', '5299'), '529.9')
})
test('a janela dos Termos não cobre os próprios textos nem o login', () => {
    for (const p of ['/termos', '/privacidade', '/login?redirect=/x', '/cadastrar']) assert.equal(termsGateHidden(p), true, p)
    for (const p of ['/', '/carrinho', '/termos-extra']) assert.equal(termsGateHidden(p), false, p)
})
test('documentos do app = os do banco', () => {
    const inDb = [...(sql.match(/doc IN \(([^)]*)\)/)?.[1] || '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    assert.deepEqual(['terms', ...Object.keys(DECLARATIONS)].sort(), inDb)
    assert.deepEqual(parseMyLegal({ terms: { version: 'v1', title: 'T', accepted: true, accepted_at: 'x' }, outro: {} }), { terms: { version: 'v1', title: 'T', accepted: true, acceptedAt: 'x' } })
})
