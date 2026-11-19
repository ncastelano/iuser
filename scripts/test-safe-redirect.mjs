// Testes de src/lib/safeRedirect.ts (redirecionamento depois do login). Rodar: npm run test:safe-redirect
import test from 'node:test'
import assert from 'node:assert/strict'
import { safeInternalPath } from '../src/lib/safeRedirect.ts'

test('caminho interno passa', () => {
    assert.equal(safeInternalPath('/carrinho?aba=pedidos'), '/carrinho?aba=pedidos')
    assert.equal(safeInternalPath('/pizzaria-forno-de-ouro'), '/pizzaria-forno-de-ouro')
})
test('outro site vira o padrão', () => {
    for (const bad of ['https://golpe.com', 'http://x', '//golpe.com', '/\\golpe.com', 'javascript:alert(1)', ' //golpe.com', '/\tgolpe', 'golpe.com', '', null, undefined])
        assert.equal(safeInternalPath(bad), '/', String(bad))
    assert.equal(safeInternalPath('https://golpe.com', '/aceitar-corridas'), '/aceitar-corridas')
})
