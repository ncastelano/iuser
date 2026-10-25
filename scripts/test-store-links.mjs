// Links da loja (src/lib/storeLinks.ts): normalização e segurança. Rodar: npm run test:store-links
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoreLink, sanitizeStoreLinks, linksFromRows } from '../src/lib/storeLinks.ts'

test('aceita endereço com ou sem https e limpa o texto', () => {
    assert.deepEqual(normalizeStoreLink('  Cardápio   completo ', 'meusite.com.br/menu'), { label: 'Cardápio completo', url: 'https://meusite.com.br/menu' })
    assert.deepEqual(normalizeStoreLink('Site', 'http://exemplo.com'), { label: 'Site', url: 'http://exemplo.com/' })
})

test('recusa protocolos perigosos, endereço sem domínio, texto vazio ou longo demais', () => {
    assert.equal(normalizeStoreLink('x', 'javascript:alert(1)'), null)
    assert.equal(normalizeStoreLink('x', 'data:text/html,<script>'), null)
    assert.equal(normalizeStoreLink('x', 'ftp://exemplo.com'), null)
    assert.equal(normalizeStoreLink('x', 'localhost'), null)
    assert.equal(normalizeStoreLink('', 'https://exemplo.com'), null)
    assert.equal(normalizeStoreLink('a'.repeat(41), 'https://exemplo.com'), null)
    assert.equal(normalizeStoreLink('x', 'https://exemplo.com/' + 'a'.repeat(300)), null)
})

test('sanitizeStoreLinks ignora lixo e respeita o máximo de 8', () => {
    assert.deepEqual(sanitizeStoreLinks(null), [])
    assert.deepEqual(sanitizeStoreLinks('x'), [])
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, url: `https://s${i}.com` }))
    assert.equal(sanitizeStoreLinks([...many, { label: 'ruim', url: 'javascript:1' }]).length, 8)
    assert.deepEqual(sanitizeStoreLinks([{ label: 'ok', url: 'https://a.com' }, { label: '', url: 'https://b.com' }, 5]).map((l) => l.label), ['ok'])
})

test('linksFromRows: linhas vazias somem, linha pela metade dá erro', () => {
    assert.deepEqual(linksFromRows([{ label: '', url: '' }]), { ok: true, links: [] })
    assert.equal(linksFromRows([{ label: 'Site', url: '' }]).ok, false)
    assert.equal(linksFromRows([{ label: '', url: 'https://a.com' }]).ok, false)
    const r = linksFromRows([{ label: 'Site', url: 'a.com' }, { label: '', url: '' }])
    assert.deepEqual(r, { ok: true, links: [{ label: 'Site', url: 'https://a.com/' }] })
})
