// Testes das regras puras dos motoristas favoritos (src/modules/favorites/domain.ts). Rodar: npm run test:favorites
// (as regras de verdade — janela, visibilidade, candidatura — são testadas no banco: python3 scripts/local/test-favorites.py)
import test from 'node:test'
import assert from 'node:assert/strict'
import { WINDOW_CHOICES, DEFAULT_WINDOW, MAX_FAVORITES, windowLabel, secondsLeft, countdown, acceptedOnly, slotsLeft, summaryLine, canChooseFavorites } from '../src/modules/favorites/domain.ts'

const drv = (status, online = false, id = Math.random().toString()) => ({ driverId: id, name: 'X', slug: 'x', photo: null, status, online, deliveries: 0, ratingAvg: null, ratingCount: 0 })

test('tempos da janela: os mesmos que o banco aceita, padrão de 2 min', () => {
    assert.deepEqual([...WINDOW_CHOICES], [60, 120, 180, 300])
    assert.equal(DEFAULT_WINDOW, 120)
    assert.equal(windowLabel(60), '1 min')
    assert.equal(windowLabel(300), '5 min')
})
test('contagem regressiva: nunca negativa e no formato m:ss', () => {
    const now = 1_000_000
    assert.equal(secondsLeft(now + 90_000, now), 90)
    assert.equal(secondsLeft(now - 5_000, now), 0)
    assert.equal(secondsLeft(now + 1, now), 1)
    assert.equal(countdown(90), '1:30')
    assert.equal(countdown(5), '0:05')
    assert.equal(countdown(0), '0:00')
})
test('só conta como favorito quem aceitou; o limite é de 10 entre convidados e aceitos', () => {
    const items = [drv('accepted'), drv('invited'), drv('accepted', true)]
    assert.equal(acceptedOnly(items).length, 2)
    assert.equal(slotsLeft(items), MAX_FAVORITES - 3)
    assert.equal(slotsLeft(Array.from({ length: 12 }, () => drv('accepted'))), 0)
    assert.equal(slotsLeft([drv('declined')]), MAX_FAVORITES)
})
test('"Favoritos primeiro" só é oferecido quando há favorito aceito', () => {
    assert.equal(canChooseFavorites([]), false)
    assert.equal(canChooseFavorites([drv('invited')]), false)
    assert.equal(canChooseFavorites([drv('invited'), drv('accepted')]), true)
})
test('resumo da loja', () => {
    assert.equal(summaryLine([]), '0 favoritos')
    assert.equal(summaryLine([drv('accepted', true)]), '1 favorito · 1 online agora')
    assert.equal(summaryLine([drv('accepted'), drv('accepted', true), drv('invited')]), '2 favoritos · 1 online agora · 1 convite esperando')
})
