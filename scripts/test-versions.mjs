// Testes da moldura das páginas (src/versions/resolve.ts). Desde 14/11/2026 só existe a 3.0; em 16/11/2026 as páginas saíram
// de /v3/... para o endereço de verdade e o código da 2.0 foi apagado.
// Rodar: npm run test:versions
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { usesShell, canonicalFromLegacy } from '../src/versions/resolve.ts'

test('todas as páginas abrem na casca, menos o link do entregador e os laboratórios', () => {
    for (const p of ['/', '/social', '/lojas', '/lojas/moda/minha-loja', '/radar', '/aceitar-corridas', '/aceitar-corridas/mapa', '/painel-perfil', '/veiculo/abc', '/carrinho/'])
        assert.equal(usesShell(p), true, p)
    for (const p of ['/entregador', '/entregador/abc123', '/paginateste', '/painel-teste', '/painel-teste?lab=bordas'])
        assert.equal(usesShell(p), false, p)
    assert.equal(usesShell('/entregadores'), true) // só o prefixo exato com barra
})

test('endereços internos antigos da 3.0 voltam ao endereço de verdade', () => {
    assert.equal(canonicalFromLegacy('/v3'), '/')
    assert.equal(canonicalFromLegacy('/v3/'), '/')
    assert.equal(canonicalFromLegacy('/v3/carrinho'), '/carrinho')
    assert.equal(canonicalFromLegacy('/v3/pedir-motorista'), '/pedir-motorista')
    assert.equal(canonicalFromLegacy('/carrinho'), null)
    assert.equal(canonicalFromLegacy('/v3loja'), null) // uma loja chamada "v3loja" não é desvio
    assert.equal(canonicalFromLegacy('/'), null)
})

test('as páginas que eram servidas por /v3 moram no endereço de verdade', () => {
    const app = new URL('../src/app/(main)/', import.meta.url)
    for (const f of ['(shell)/page.tsx', '(shell)/carrinho/page.tsx', '(shell)/conversas/page.tsx', '(shell)/radar/page.tsx', '(shell)/solicitar-servico/page.tsx', 'lojas/page.tsx', 'pedir-motorista/page.tsx'])
        assert.ok(existsSync(new URL(f, app)), f)
    assert.equal(existsSync(new URL('(shell)/v3', app)), false)
})

test('o proxy não decide mais versão e manda /v3 de volta', () => {
    const proxy = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8')
    assert.match(proxy, /canonicalFromLegacy\(pathname\)/)
    assert.doesNotMatch(proxy, /resolveUiVersion|resolveRequestVersion|VERSION_COOKIE/)
    for (const r of ['/carrinho', '/conversas', '/radar', '/pedir-motorista', '/solicitar-servico']) assert.ok(proxy.includes(`'${r}'`), r)
})

test('nenhum resto da 2.0: sem useIsV3, sem a prop ui e sem a escolha de versão', () => {
    const files = ['src/components/MaintenanceNotice.tsx', 'src/app/(main)/layout.tsx', 'src/versions/AppFrame.tsx']
    for (const f of files) assert.doesNotMatch(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /useIsV3|UiVersion|VERSION_COOKIE/, f)
    assert.equal(existsSync(new URL('../src/versions/access.ts', import.meta.url)), false)
})
