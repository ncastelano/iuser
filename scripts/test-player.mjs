// Testes das regras puras do mini-player (src/modules/player/domain.ts). Rodar: npm run test:player
import test from 'node:test'
import assert from 'node:assert/strict'
import { backTarget, clock, miniHidden, nextIndex, parseSaved, prevIndex, progressOf, serializeSaved, subtitleOf } from '../src/modules/player/domain.ts'

const music = { kind: 'musica', id: 'a1', title: 'Noites', sub: 'Banda do Forno · Música', cover: null, href: '/minhas-compras-digitais/p1' }
const aula = { kind: 'aula', id: 'v1', title: 'Aula 3', sub: 'Curso · Aula', cover: null, href: '/minhas-compras-digitais/p2?aula=v1' }
const flash = { kind: 'flash', id: 'f1', title: 'Entrega em 12 min', sub: 'Flash · @dani', cover: null, href: '/flash?de=f1' }

test('progresso e relógio', () => {
    assert.equal(progressOf(50, 200), 0.25)
    assert.equal(progressOf(300, 200), 1)
    assert.equal(progressOf(10, 0), 0)
    assert.equal(progressOf(-5, 100), 0)
    assert.equal(progressOf(NaN, 100), 0)
    assert.equal(clock(65), '1:05')
    assert.equal(clock(3723), '1:02:03')
    assert.equal(clock(-1), '0:00')
    assert.equal(clock(NaN), '0:00')
})

test('fila: próxima, anterior e o "voltar" que reinicia a faixa depois de 3 s', () => {
    assert.equal(nextIndex(0, 3), 1)
    assert.equal(nextIndex(2, 3), null)
    assert.equal(nextIndex(-1, 3), null)
    assert.equal(prevIndex(0), null)
    assert.equal(prevIndex(2), 1)
    assert.deepEqual(backTarget(2, 10), { restart: true, index: null })
    assert.deepEqual(backTarget(2, 1), { restart: false, index: 1 })
    assert.deepEqual(backTarget(0, 1), { restart: true, index: null })   // primeira faixa: só reinicia
})

test('subtítulo: aula e flash à espera dizem "continuar"; música pausada não', () => {
    assert.equal(subtitleOf(music, false), 'Banda do Forno · Música')
    assert.equal(subtitleOf(aula, true), 'Curso · Aula')
    assert.equal(subtitleOf(aula, false), 'Curso · Aula · continuar')
    assert.equal(subtitleOf(flash, false), 'Flash · @dani · continuar')
})

test('onde a faixa de cima some (para não repetir o que já está na tela)', () => {
    assert.equal(miniHidden(null, '/'), true)
    assert.equal(miniHidden(music, '/'), false)
    assert.equal(miniHidden(flash, '/flash'), true)
    assert.equal(miniHidden(flash, '/flash?de=x'), true)
    assert.equal(miniHidden(flash, '/social'), false)
    assert.equal(miniHidden(aula, '/minhas-compras-digitais/p2'), true)
    assert.equal(miniHidden(music, '/minhas-compras-digitais/p1'), true)
    assert.equal(miniHidden(music, '/comprar'), false)
})

test('guardar e ler do aparelho: só o que tem formato e endereço do próprio app', () => {
    const s = { item: music, queue: [{ itemId: 'a1', title: 'Noites' }, { itemId: 'a2', title: 'Dias' }], qIndex: 1, pos: 61.9, dur: 200.4 }
    const back = parseSaved(serializeSaved(s))
    assert.deepEqual(back, { ...s, pos: 61, dur: 200 })
    assert.equal(parseSaved(null), null)
    assert.equal(parseSaved('não é json'), null)
    assert.equal(parseSaved('{}'), null)
    assert.equal(parseSaved(JSON.stringify({ item: { ...music, kind: 'video' } })), null)
    assert.equal(parseSaved(JSON.stringify({ item: { ...music, href: 'https://outro.site' } })), null)   // link de fora nunca
    assert.equal(parseSaved(JSON.stringify({ item: { ...music, href: '//outro.site' } })), null)
    // índice fora da fila volta a 0; lixo na fila é descartado
    const odd = parseSaved(JSON.stringify({ item: aula, queue: [{ itemId: 1 }, { itemId: 'x', title: 'ok' }], qIndex: 9, pos: 'abc', dur: -3 }))
    assert.deepEqual(odd.queue, [{ itemId: 'x', title: 'ok' }])
    assert.equal(odd.qIndex, 0)
    assert.equal(odd.pos, 0)
    assert.equal(odd.dur, 0)
})
