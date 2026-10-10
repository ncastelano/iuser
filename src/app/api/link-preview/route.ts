// app/api/link-preview/route.ts
//
// Cartão de link (igual ao do WhatsApp): busca a página e devolve título, descrição, imagem e site.
// Protegido contra SSRF: só http/https, resolve o DNS e recusa endereço interno/privado (a cada redirecionamento),
// com limite de tempo e de tamanho. Resultado guardado em memória por 1 hora.
import { NextResponse } from 'next/server'
import { lookup } from 'dns/promises'
import net from 'net'

export const runtime = 'nodejs'

const TIMEOUT_MS = 5000
const MAX_BYTES = 600_000
const MAX_REDIRECTS = 3
const TTL_MS = 60 * 60 * 1000

interface Preview { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null; domain: string }
const cache = new Map<string, { at: number; value: Preview | null }>()

function isPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number)
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    }
    if (net.isIPv6(ip)) {
        const v = ip.toLowerCase()
        return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.')
    }
    return true
}

async function assertPublicHost(hostname: string) {
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('host')
    if (net.isIP(hostname)) { if (isPrivateIp(hostname)) throw new Error('private'); return }
    const addrs = await lookup(hostname, { all: true })
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error('private')
}

async function fetchHtml(startUrl: string): Promise<{ html: string; finalUrl: string } | null> {
    let current = startUrl
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const u = new URL(current)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
        await assertPublicHost(u.hostname)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
        try {
            const res = await fetch(u.toString(), {
                redirect: 'manual',
                signal: ctrl.signal,
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (compatible; iUserLinkPreview/1.0; +https://www.iuser.com.br)',
                    Accept: 'text/html,application/xhtml+xml',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
                },
            })
            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get('location')
                if (!loc) return null
                current = new URL(loc, u).toString()
                continue
            }
            if (!res.ok) return null
            const type = res.headers.get('content-type') || ''
            if (!/text\/html|application\/xhtml/i.test(type)) return null
            const reader = res.body?.getReader()
            if (!reader) return null
            const chunks: Uint8Array[] = []
            let total = 0
            while (total < MAX_BYTES) {
                const { done, value } = await reader.read()
                if (done || !value) break
                chunks.push(value)
                total += value.length
            }
            try { await reader.cancel() } catch { /* já terminou */ }
            const html = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))))
            return { html, finalUrl: u.toString() }
        } finally {
            clearTimeout(timer)
        }
    }
    return null
}

const decode = (s: string) => s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim()

function metaContent(html: string, keys: string[]): string | null {
    const tags = html.match(/<meta\b[^>]*>/gi) || []
    for (const key of keys) {
        for (const tag of tags) {
            const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
            if (prop !== key) continue
            const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag)
            const v = content ? (content[1] ?? content[2]) : null
            if (v && v.trim()) return decode(v)
        }
    }
    return null
}

export async function GET(req: Request) {
    const raw = new URL(req.url).searchParams.get('url') || ''
    let target: URL
    try {
        target = new URL(raw)
        if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('proto')
    } catch {
        return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
    }
    const key = target.toString()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ preview: hit.value })

    let preview: Preview | null = null
    try {
        const page = await fetchHtml(key)
        if (page) {
            const base = new URL(page.finalUrl)
            const title = metaContent(page.html, ['og:title', 'twitter:title']) || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1] || '') || null
            const description = metaContent(page.html, ['og:description', 'twitter:description', 'description'])
            let image = metaContent(page.html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])
            if (image) { try { image = new URL(image, base).toString() } catch { image = null } }
            const siteName = metaContent(page.html, ['og:site_name'])
            if (title || description || image) {
                preview = {
                    url: page.finalUrl,
                    title: title ? title.slice(0, 160) : null,
                    description: description ? description.slice(0, 260) : null,
                    image,
                    siteName,
                    domain: base.hostname.replace(/^www\./, ''),
                }
            }
        }
    } catch {
        preview = null
    }

    cache.set(key, { at: Date.now(), value: preview })
    if (cache.size > 500) { const first = cache.keys().next().value; if (first) cache.delete(first) }
    return NextResponse.json({ preview })
}
