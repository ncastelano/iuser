// Testes das regras de resolução de versão da interface (src/versions/resolve.ts).
// Rodar: npm run test:versions
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVersion, internalPathFor, canonicalFromInternal, equivalentPath, parseVersion, versionOfInternalPath } from '../src/versions/resolve.ts'

test('quem nunca escolheu fica na v2', () => {
    assert.equal(resolveVersion({ offerEnabled: true }), 'v2')
})
test('cookie vale mais que a preferência do perfil', () => {
    assert.equal(resolveVersion({ cookie: 'v3', profilePref: 'v2', offerEnabled: true }), 'v3')
    assert.equal(resolveVersion({ cookie: 'v2', profilePref: 'v3', offerEnabled: true }), 'v2')
})
test('sem cookie, vale a preferência do perfil', () => {
    assert.equal(resolveVersion({ profilePref: 'v3', offerEnabled: true }), 'v3')
})
test('valor inválido é ignorado', () => {
    assert.equal(resolveVersion({ cookie: 'v9', profilePref: 'xx', offerEnabled: true }), 'v2')
    assert.equal(parseVersion('v3'), 'v3')
    assert.equal(parseVersion(undefined), null)
})
test('oferta da 3.0 desligada: todos na v2, mesmo com cookie v3', () => {
    assert.equal(resolveVersion({ cookie: 'v3', profilePref: 'v3', offerEnabled: false }), 'v2')
})
test('rewrite só nas rotas compartilhadas', () => {
    assert.equal(internalPathFor('v3', '/'), '/modeloinicial')
    assert.equal(internalPathFor('v3', '/carrinho'), '/v3/carrinho')
    assert.equal(internalPathFor('v3', '/conversas/'), '/v3/conversas')
    assert.equal(internalPathFor('v3', '/social'), null)
    assert.equal(internalPathFor('v2', '/carrinho'), null)
})
test('caminho interno volta ao canônico', () => {
    assert.equal(canonicalFromInternal('/v3/carrinho'), '/carrinho')
    assert.equal(canonicalFromInternal('/v3'), '/')
    assert.equal(canonicalFromInternal('/carrinho'), null)
    assert.equal(versionOfInternalPath('/v3/conversas'), 'v3')
    assert.equal(versionOfInternalPath('/vender'), null)
})
test('troca de versão: página equivalente ou home válida, sem 404', () => {
    // para a v3
    assert.equal(equivalentPath('v3', '/'), '/')
    assert.equal(equivalentPath('v3', '/carrinho'), '/carrinho')
    assert.equal(equivalentPath('v3', '/social'), '/social')
    // para a v2
    assert.equal(equivalentPath('v2', '/carrinho'), '/carrinho')
    assert.equal(equivalentPath('v2', '/v3/conversas'), '/conversas')
    assert.equal(equivalentPath('v2', '/painel-perfil'), '/')
    assert.equal(equivalentPath('v2', '/modeloinicial'), '/')
    assert.equal(equivalentPath('v2', '/painel-loja/minha-loja'), '/')
    assert.equal(equivalentPath('v2', '/veiculo/abc'), '/')
})
