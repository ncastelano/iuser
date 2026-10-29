// Testes das regras puras dos produtos digitais (src/modules/digital/domain.ts). Rodar: npm run test:digital
import test from 'node:test'
import assert from 'node:assert/strict'
import { kindFromFile, isSafeHttps, validateItem, formatDuration, formatSize, groupByModule, curriculumStats, curriculumSummary, isDigitalCart, storagePathFor, DIGITAL_MAX_BYTES } from '../src/modules/digital/domain.ts'

const it = (o) => ({ id: 'x', module_title: null, title: 't', kind: 'video', duration_seconds: null, size_bytes: null, position: 0, is_preview: false, unlocked: false, ...o })

test('tipo do arquivo pelo mime ou pela extensão', () => {
    assert.equal(kindFromFile('video/mp4', 'a.mp4'), 'video')
    assert.equal(kindFromFile('', 'aula.MOV'), 'video')
    assert.equal(kindFromFile('audio/mpeg', 'a'), 'audio')
    assert.equal(kindFromFile('application/pdf', 'livro.pdf'), 'document')
    assert.equal(kindFromFile(null, 'planilha.xlsx'), 'document')
})
test('link só https', () => {
    assert.equal(isSafeHttps('https://vimeo.com/123'), true)
    assert.equal(isSafeHttps('http://vimeo.com/123'), false)
    assert.equal(isSafeHttps('javascript:alert(1)'), false)
    assert.equal(isSafeHttps('vimeo.com'), false)
})
test('validar item: nome, tamanho e link', () => {
    assert.match(validateItem({ title: ' ', url: 'https://a.com' }), /nome/i)
    assert.match(validateItem({ title: 'x'.repeat(141), url: 'https://a.com' }), /140/)
    assert.match(validateItem({ title: 'Aula', file: { size: DIGITAL_MAX_BYTES + 1 } }), /500 MB/)
    assert.equal(validateItem({ title: 'Aula', file: { size: 10 } }), null)
    assert.match(validateItem({ title: 'Aula' }), /arquivo ou/)
    assert.match(validateItem({ title: 'Aula', url: 'http://x.com' }), /https/)
    assert.equal(validateItem({ title: 'Aula', url: 'https://x.com/v' }), null)
})
test('duração e tamanho legíveis', () => {
    assert.equal(formatDuration(0), '')
    assert.equal(formatDuration(65), '1:05')
    assert.equal(formatDuration(3725), '1h 02min')
    assert.equal(formatSize(512), '1 KB')
    assert.equal(formatSize(2.5 * 1024 * 1024), '2.5 MB')
    assert.equal(formatSize(250 * 1024 * 1024), '250 MB')
})
test('módulos na ordem em que aparecem; itens sem módulo juntos', () => {
    const g = groupByModule([it({ module_title: 'A' }), it({ module_title: null }), it({ module_title: 'B' }), it({ module_title: ' A ' })])
    assert.deepEqual(g.map((x) => [x.title, x.items.length]), [['A', 2], [null, 1], ['B', 1]])
})
test('sumário do que o produto entrega', () => {
    assert.equal(curriculumSummary([]), 'Conteúdo em preparação')
    const items = [it({ kind: 'video', duration_seconds: 600, module_title: 'M1' }), it({ kind: 'video', duration_seconds: 540, module_title: 'M1' }), it({ kind: 'document' }), it({ kind: 'link', is_preview: true })]
    assert.equal(curriculumSummary(items), '2 aulas em vídeo · 1 arquivo · 1 link · 19:00')
    const s = curriculumStats(items)
    assert.equal(s.modules, 1); assert.equal(s.previews, 1); assert.equal(s.total, 4)
})
test('carrinho só digital', () => {
    assert.equal(isDigitalCart([]), false)
    assert.equal(isDigitalCart([{ product: { type: 'digital' } }, { product: { type: 'digital' } }]), true)
    assert.equal(isDigitalCart([{ product: { type: 'digital' } }, { product: { type: 'physical' } }]), false)
})
test('caminho no bucket: pasta da pessoa, nome limpo', () => {
    const p = storagePathFor('u1', 'p1', 'Módulo 1 — Introdução (final).MP4', 123)
    assert.ok(p.startsWith('u1/p1/123-'))
    assert.match(p, /^[A-Za-z0-9/._-]+$/)
})
