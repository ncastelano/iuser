// Redes sociais (src/lib/socialLinks.ts): normalização e segurança dos links. Rodar: npm run test:social-links
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSocialUrl, buildSocialLinks } from '../src/lib/socialLinks.ts'

test('aceita @usuario, usuario e o link completo de cada rede', () => {
    assert.equal(normalizeSocialUrl('instagram', '@loja.teste'), 'https://instagram.com/loja.teste')
    assert.equal(normalizeSocialUrl('instagram', 'loja_teste'), 'https://instagram.com/loja_teste')
    assert.equal(normalizeSocialUrl('instagram', 'https://www.instagram.com/loja/'), 'https://www.instagram.com/loja')
    assert.equal(normalizeSocialUrl('instagram', 'instagram.com/loja'), 'https://instagram.com/loja')
    assert.equal(normalizeSocialUrl('youtube', '@canal'), 'https://youtube.com/@canal')
    assert.equal(normalizeSocialUrl('youtube', 'https://youtu.be/abc123'), 'https://youtu.be/abc123')
    assert.equal(normalizeSocialUrl('x', '@perfil'), 'https://x.com/perfil')
    assert.equal(normalizeSocialUrl('x', 'https://twitter.com/perfil'), 'https://twitter.com/perfil')
    assert.equal(normalizeSocialUrl('github', 'octocat'), 'https://github.com/octocat')
})

test('recusa link de outro site, protocolos perigosos e lixo', () => {
    assert.equal(normalizeSocialUrl('instagram', 'https://evil.com/instagram.com/x'), null)
    assert.equal(normalizeSocialUrl('github', 'javascript:alert(1)'), null)
    assert.equal(normalizeSocialUrl('x', 'data:text/html,<script>'), null)
    assert.equal(normalizeSocialUrl('youtube', 'https://instagram.com/x'), null)
    assert.equal(normalizeSocialUrl('instagram', 'dois nomes'), null)
    assert.equal(normalizeSocialUrl('instagram', '   '), null)
    assert.equal(normalizeSocialUrl('instagram', null), null)
    assert.equal(normalizeSocialUrl('instagram', 'http://instagram.com.evil.com/x'), null)
})

test('buildSocialLinks: só as redes com link, na ordem Instagram, YouTube, X, GitHub; sem nada = lista vazia', () => {
    assert.deepEqual(buildSocialLinks({}), [])
    assert.deepEqual(buildSocialLinks({ instagram: '  ', github: null }), [])
    const l = buildSocialLinks({ github: 'octocat', instagram: '@a', x: '@b', youtube: '@c' })
    assert.deepEqual(l.map((x) => x.kind), ['instagram', 'youtube', 'x', 'github'])
    assert.deepEqual(l.map((x) => x.label), ['Instagram', 'YouTube', 'X', 'GitHub'])
})
