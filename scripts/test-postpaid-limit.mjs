// scripts/test-postpaid-limit.mjs — o limite do Pós-pago nas telas tem de ser o MESMO do banco, e ninguém pode voltar a escrever 50 à mão.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { interpretLimit, limitText, salesUntilLimit, POSTPAID_LEGACY_LIMIT } from '../src/lib/postpaidRules.ts'
const lib = readFileSync('src/lib/postpaidRules.ts', 'utf8')
const mig = readFileSync('supabase/migrations/20261130000057_postpaid_debt_limit.sql', 'utf8')
const tsLimit = Number(lib.match(/POSTPAID_DEBT_LIMIT\s*=\s*(\d+)/)?.[1])
const dbLimit = Number(mig.match(/debt_limit numeric\(10,2\) NOT NULL DEFAULT (\d+)/)?.[1])

test('o número das telas é o mesmo do padrão do banco', () => {
    assert.ok(tsLimit > 0)
    assert.equal(tsLimit, dbLimit)
    assert.equal(tsLimit, Number(mig.match(/VALUES \(true, (\d+)\)/)?.[1]))
})

function walk(d, out = []) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
}
test('nenhuma tela declara o limite do Pós-pago à mão (usa lib/postpaid)', () => {
    const ruins = []
    for (const f of walk('src')) {
        if (f.endsWith('lib/postpaidRules.ts') || f.includes('painel-teste')) continue
        const s = readFileSync(f, 'utf8')
        if (/\b(DEBT_LIMIT|POSTPAID_LIMIT)\s*=\s*\d+/.test(s)) ruins.push(f)
        if (/(limite|chegar a|chegou a|ao chegar em|atingiu)[^\n'`"]{0,25}R\$ ?50\b/.test(s)) ruins.push(f + ' (texto com R$ 50)')
    }
    assert.deepEqual(ruins, [])
})

test('as funções do banco não comparam a dívida com 50 escrito à mão depois da migration 57', () => {
    assert.match(mig, /get_postpaid_debt_limit\(\)/)
    assert.match(mig, /prosrc ~ '\(get_driver_postpaid_debt/)
})

test('as telas leem o limite do banco: valor dele; 50 se a migration ainda não foi aplicada; falha de rede não decide nada', () => {
    assert.equal(interpretLimit(100, null), 100)
    assert.equal(interpretLimit('150.00', null), 150)
    assert.equal(interpretLimit(null, null), null)
    assert.equal(interpretLimit(0, null), null)
    assert.equal(interpretLimit(null, { code: 'PGRST202', message: 'Could not find the function public.get_postpaid_debt_limit' }), POSTPAID_LEGACY_LIMIT)
    assert.equal(interpretLimit(null, { code: '42883', message: 'function does not exist' }), 50)
    assert.equal(interpretLimit(null, { code: '', message: 'Failed to fetch' }), null)
})

test('textos do limite', () => {
    assert.equal(limitText(100), 'R$ 100')
    assert.equal(limitText(75.5), 'R$ 75,50')
    assert.equal(salesUntilLimit(100), 200)
    assert.equal(salesUntilLimit(50), 100)
})

test('ninguém importa o limite fixo para travar nada nas telas: só lib/postpaid e a rules o usam', () => {
    const uses = walk('src').filter((f) => !f.includes('painel-teste') && /POSTPAID_DEBT_LIMIT/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/'))
    assert.deepEqual(uses.sort(), ['src/lib/postpaid.ts', 'src/lib/postpaidRules.ts'])
})
