// app/api/csp-report/route.ts
//
// Relatórios da CSP em modo "só observar" (next.config.js, Content-Security-Policy-Report-Only): o navegador avisa aqui o que a
// política BLOQUEARIA. Só anota um resumo curto nos logs (diretiva, origem bloqueada, página — sem query, sem dado pessoal) para
// decidir quando ligar o bloqueio de verdade. Limite por IP para não virar lixo nos logs.
import { NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rateLimit'

const short = (u: unknown) => {
    const v = String(u || '')
    try { const x = new URL(v); return x.origin + x.pathname.slice(0, 60) } catch { return v.slice(0, 80) }
}

export async function POST(req: Request) {
    if (!rateLimit(`csp:${clientIp(req)}`, 20, 60_000)) return new NextResponse(null, { status: 204 })
    const text = (await req.text().catch(() => '')).slice(0, 8000)
    try {
        const body = JSON.parse(text)
        const r = body?.['csp-report'] || (Array.isArray(body) ? body[0]?.body : body?.body) || {}
        console.warn('[CSP]', JSON.stringify({
            dir: String(r['violated-directive'] || r.effectiveDirective || r['effective-directive'] || '').slice(0, 40),
            blocked: short(r['blocked-uri'] || r.blockedURL),
            page: short(r['document-uri'] || r.documentURL),
        }))
    } catch { /* corpo inválido: ignora */ }
    return new NextResponse(null, { status: 204 })
}
