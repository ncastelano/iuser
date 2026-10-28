// Testes das regras de resolução de versão da interface (src/versions/resolve.ts).
// Rodar: npm run test:versions
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVersion, internalPathFor, canonicalFromInternal, equivalentPath, parseVersion, versionOfInternalPath, usesShell, isV3OnlyPath } from '../src/versions/resolve.ts'

test('quem nunca escolheu fica na v2', () => {
    assert.equal(resolveVersion({ hasAccess: true }), 'v2')
})
test('cookie vale mais que a preferência do perfil', () => {
    assert.equal(resolveVersion({ cookie: 'v3', profilePref: 'v2', hasAccess: true }), 'v3')
    assert.equal(resolveVersion({ cookie: 'v2', profilePref: 'v3', hasAccess: true }), 'v2')
})
test('sem cookie, vale a preferência do perfil', () => {
    assert.equal(resolveVersion({ profilePref: 'v3', hasAccess: true }), 'v3')
})
test('valor inválido é ignorado', () => {
    assert.equal(resolveVersion({ cookie: 'v9', profilePref: 'xx', hasAccess: true }), 'v2')
    assert.equal(parseVersion('v3'), 'v3')
    assert.equal(parseVersion(undefined), null)
})
test('sem permissão para a 3.0: v2, mesmo com cookie v3', () => {
    assert.equal(resolveVersion({ cookie: 'v3', profilePref: 'v3', hasAccess: false }), 'v2')
})
test('rewrite só nas rotas compartilhadas', () => {
    assert.equal(internalPathFor('v3', '/'), '/v3')
    assert.equal(internalPathFor('v3', '/carrinho'), '/v3/carrinho')
    assert.equal(internalPathFor('v3', '/conversas/'), '/v3/conversas')
    assert.equal(internalPathFor('v3', '/lojas'), '/v3/lojas')
    assert.equal(internalPathFor('v3', '/solicitar-servico'), '/v3/solicitar-servico')
    assert.equal(internalPathFor('v3', '/pedir-motorista'), '/v3/pedir-motorista')
    assert.equal(internalPathFor('v2', '/pedir-motorista'), null)
    assert.equal(internalPathFor('v3', '/radar'), '/v3/radar')
    assert.equal(internalPathFor('v2', '/radar'), null)
    assert.equal(internalPathFor('v2', '/solicitar-servico'), null)
    assert.equal(internalPathFor('v3', '/lojas/alimentacao'), null)
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
    assert.equal(equivalentPath('v2', '/v3'), '/') // a home da 3.0 volta para a home da 2.0
    assert.equal(equivalentPath('v2', '/painel-loja/minha-loja'), '/')
  assert.equal(equivalentPath('v2', '/flash'), '/')
  assert.equal(equivalentPath('v2', '/social'), '/')
  assert.equal(equivalentPath('v2', '/entregas'), '/')
  assert.equal(equivalentPath('v2', '/editar-loja/minha-loja'), '/')
    assert.equal(equivalentPath('v2', '/veiculo/abc'), '/')
})

test('casca da 3.0: todas as páginas na v3, exceto o link público do entregador', () => {
    assert.equal(usesShell('v3', '/social'), true)
    assert.equal(usesShell('v3', '/lojas/moda/minha-loja'), true)
    assert.equal(usesShell('v3', '/entregador/abc123'), false)
    assert.equal(usesShell('v3', '/aceitar-corridas/mapa'), true)
    assert.equal(usesShell('v3', '/radar'), true)
    assert.equal(usesShell('v3', '/aceitar-corridas'), true)
})
test('na v2 só as páginas exclusivas da 3.0 usam a casca', () => {
    assert.equal(usesShell('v2', '/social'), true) // Social só existe na 3.0: na 2.0 abre dentro da casca
    assert.equal(usesShell('v2', '/'), false)
    assert.equal(usesShell('v2', '/painel-perfil'), true)
    assert.equal(usesShell('v2', '/veiculo/abc'), true)
    assert.equal(isV3OnlyPath('/v3/carrinho'), false)
})

test('/comprar existe só na 3.0', () => {
    assert.equal(isV3OnlyPath('/comprar'), true)
})

test('aluguel de imóveis existe só na 3.0', () => {
    for (const p of ['/imoveis', '/imoveis/apto-centro-x1y2z', '/anunciar-imovel', '/meus-imoveis']) assert.equal(isV3OnlyPath(p), true, p)
})
