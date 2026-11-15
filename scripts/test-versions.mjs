// Testes das regras de resolução de versão da interface (src/versions/resolve.ts).
// Rodar: npm run test:versions
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVersion, internalPathFor, canonicalFromInternal, equivalentPath, parseVersion, versionOfInternalPath, usesShell, isV3OnlyPath } from '../src/versions/resolve.ts'

// DESDE 14/11/2026 A 3.0 É A ÚNICA VERSÃO: cookie, preferência do perfil e liberação do admin não mudam mais nada
test('todo mundo vê a 3.0, seja qual for a escolha antiga', () => {
    for (const input of [{ hasAccess: true }, { hasAccess: false }, { cookie: 'v2', hasAccess: true }, { cookie: 'v2', profilePref: 'v2', hasAccess: false },
                         { cookie: 'v3', hasAccess: false }, { profilePref: 'v2', hasAccess: true }, { cookie: 'v9', profilePref: 'xx', hasAccess: true }]) {
        assert.equal(resolveVersion(input), 'v3', JSON.stringify(input))
    }
})
test('valores de versão continuam sendo lidos (para links antigos)', () => {
    assert.equal(parseVersion('v3'), 'v3')
    assert.equal(parseVersion('v9'), null)
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
