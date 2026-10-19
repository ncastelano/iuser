// Proxy de imagens (src/lib/imageProxy.ts + next.config.js + src/proxy.ts). Rodar: npm run test:image-proxy
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { proxyImageUrl } from '../src/lib/imageProxy.ts'

const root = path.resolve(import.meta.dirname, '..')
const SB = 'https://abcd1234.supabase.co'
const BASE = 'https://www.iuser.com.br'

test('link público do Storage vira link do proxy (com query string preservada)', () => {
    assert.equal(proxyImageUrl(`${SB}/storage/v1/object/public/avatars/u-1.jpg`, BASE, SB), `${BASE}/img/avatars/u-1.jpg`)
    assert.equal(proxyImageUrl(`${SB}/storage/v1/object/public/product-images/a/b.png?t=1`, BASE, SB), `${BASE}/img/product-images/a/b.png?t=1`)
    assert.equal(proxyImageUrl(`${SB}/storage/v1/object/public/avatars/u-1.jpg`, `${BASE}/`, `${SB}/`), `${BASE}/img/avatars/u-1.jpg`)
})

test('sem base (desenvolvimento local) ou link de outro lugar: devolve o link original', () => {
    const u = `${SB}/storage/v1/object/public/avatars/u-1.jpg`
    assert.equal(proxyImageUrl(u, '', SB), u)
    assert.equal(proxyImageUrl('https://images.unsplash.com/x.jpg', BASE, SB), 'https://images.unsplash.com/x.jpg')
    assert.equal(proxyImageUrl('https://outro.supabase.co/storage/v1/object/public/avatars/u.jpg', BASE, SB), 'https://outro.supabase.co/storage/v1/object/public/avatars/u.jpg')
    assert.equal(proxyImageUrl(`${SB}/storage/v1/object/sign/avatars/u.jpg`, BASE, SB), `${SB}/storage/v1/object/sign/avatars/u.jpg`)
    assert.equal(proxyImageUrl('', BASE, SB), '')
})

test('o roteador deixa /img/... passar, e a rota de imagens serve do Storage com cache da CDN', () => {
    const proxy = fs.readFileSync(path.join(root, 'src/proxy.ts'), 'utf8')
    assert.match(proxy, /IGNORED_PREFIXES = \[[\s\S]*'\/img\/'/)
    assert.match(proxy, /pathname\.startsWith\('\/img\/'\)\) return NextResponse\.next\(\)/)
    const route = fs.readFileSync(path.join(root, 'src/app/img/[...path]/route.ts'), 'utf8')
    assert.match(route, /s-maxage=\d+/, 'sem s-maxage a Vercel não guarda em cache')
    assert.match(route, /storage\/v1\/object\/public/)
})

test('todo getPublicUrl do cliente do navegador sai pelo proxy', () => {
    const c = fs.readFileSync(path.join(root, 'src/lib/supabase/client.ts'), 'utf8')
    assert.match(c, /api\.getPublicUrl = /)
    assert.match(c, /proxyImageUrl\(r\.data\.publicUrl\)/)
})

test('a rota de imagens nunca serve HTML/SVG nem bucket fora da lista (o endereço fica no domínio do site)', () => {
    const route = fs.readFileSync(path.join(root, 'src/app/img/[...path]/route.ts'), 'utf8')
    assert.doesNotMatch(route, /image\/svg/)
    assert.doesNotMatch(route, /text\/html/)
    assert.match(route, /BUCKETS\.has\(segments\[0\]\)/)
    assert.match(route, /ALLOWED_TYPES\.has\(type\)/)
    assert.match(route, /sandbox/)
    assert.match(route, /nosniff/)
})
