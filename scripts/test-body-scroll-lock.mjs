// Teste do travamento da rolagem da página com contador (src/lib/bodyScrollLock.ts). Rodar: npm run test:scroll-lock
import test from 'node:test'
import assert from 'node:assert/strict'
globalThis.document = { body: { style: { overflow: '' } } }
const { lockBodyScroll, __lockCount } = await import('../src/lib/bodyScrollLock.ts')

test('um travamento: trava e solta', () => {
    const un = lockBodyScroll()
    assert.equal(document.body.style.overflow, 'hidden')
    un()
    assert.equal(document.body.style.overflow, '')
})
test('dois sobrepostos, em qualquer ordem de saída: a página NUNCA fica presa', () => {
    const a = lockBodyScroll(); const b = lockBodyScroll()
    a()                                                  // o primeiro sai antes: ainda travado pelo segundo
    assert.equal(document.body.style.overflow, 'hidden')
    b()
    assert.equal(document.body.style.overflow, '')       // antes do contador, aqui ficava 'hidden' para sempre
    const c = lockBodyScroll(); const d = lockBodyScroll()
    d(); c()
    assert.equal(document.body.style.overflow, '')
    assert.equal(__lockCount(), 0)
})
test('soltar duas vezes não destrava o do outro', () => {
    const a = lockBodyScroll(); const b = lockBodyScroll()
    a(); a()
    assert.equal(document.body.style.overflow, 'hidden')
    b()
    assert.equal(document.body.style.overflow, '')
})
test('respeita um overflow que já existia antes do primeiro travamento', () => {
    document.body.style.overflow = 'scroll'
    const a = lockBodyScroll(); const b = lockBodyScroll()
    b(); a()
    assert.equal(document.body.style.overflow, 'scroll')
    document.body.style.overflow = ''
})
