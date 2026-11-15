// npm run test:review-prompt — avaliação sem acúmulo (src/lib/reviewPrompt.ts)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestToReview, REVIEW_WINDOW_MS } from '../src/lib/reviewPrompt.ts'

const now = Date.parse('2026-11-11T12:00:00Z')
const ago = (h) => new Date(now - h * 3600000).toISOString()

test('só a MAIS RECENTE, nunca uma fila', () => {
    const items = [{ id: 'a', at: ago(5) }, { id: 'b', at: ago(1) }, { id: 'c', at: ago(30) }]
    assert.equal(latestToReview(items, 0, now).id, 'b')
})
test('nada mais antigo que 2 dias', () => {
    assert.equal(REVIEW_WINDOW_MS, 2 * 86400000)
    assert.equal(latestToReview([{ id: 'x', at: ago(49) }], 0, now), null)
    assert.equal(latestToReview([{ id: 'y', at: ago(47) }], 0, now).id, 'y')
})
test('depois de avaliar ou fechar, tudo o que terminou antes some; só o que terminar depois volta a perguntar', () => {
    const closedAt = now - 2 * 3600000
    const items = [{ id: 'velho', at: ago(3) }, { id: 'velho2', at: ago(10) }]
    assert.equal(latestToReview(items, closedAt, now), null)
    assert.equal(latestToReview([...items, { id: 'novo', at: ago(1) }], closedAt, now).id, 'novo')
})
test('data ausente ou inválida não entra', () => {
    assert.equal(latestToReview([{ id: 'n', at: null }, { id: 'i', at: 'ontem' }], 0, now), null)
})
