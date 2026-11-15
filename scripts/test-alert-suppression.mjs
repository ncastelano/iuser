// scripts/test-alert-suppression.mjs — a regra de "aviso redundante" (lib/alertSuppression.ts) e o que a usa. npm run test:alert-suppression
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALERT_SEEN_ON, isAlertRedundant } from '../src/lib/alertSuppression.ts'

test('nova corrida é redundante em /aceitar-corridas e /entregas (e subpáginas), não nas outras', () => {
    assert.equal(isAlertRedundant('new_ride', '/aceitar-corridas'), true)
    assert.equal(isAlertRedundant('new_ride', '/aceitar-corridas/mapa'), true)
    assert.equal(isAlertRedundant('new_ride', '/entregas'), true)
    assert.equal(isAlertRedundant('new_ride', '/'), false)
    assert.equal(isAlertRedundant('new_ride', '/painel-motorista'), false)
    assert.equal(isAlertRedundant('new_ride', '/aceitar-corridas-outra'), false)
    assert.equal(isAlertRedundant('new_ride', null), false)
    assert.equal(isAlertRedundant('new_ride', undefined), false)
})

test('o service worker repete os mesmos prefixos (ele não importa TS)', () => {
    const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    for (const prefix of ALERT_SEEN_ON.new_ride) assert.ok(sw.includes(`'${prefix}'`), `public/sw.js sem o prefixo ${prefix}`)
})

test('o aviso global e a página usam a regra, e a página não escreve mais o aviso de corrida nova', () => {
    const listener = readFileSync(new URL('../src/components/DriverRideAlertListener.tsx', import.meta.url), 'utf8')
    assert.ok(listener.includes("isAlertRedundant('new_ride'"))
    const page = readFileSync(new URL('../src/components/AceitarCorridas/AceitarCorridas.tsx', import.meta.url), 'utf8')
    assert.ok(!/Nova corrida disponível!|novas corridas disponíveis/.test(page), 'AceitarCorridas voltou a avisar "nova corrida disponível" na faixa')
})
