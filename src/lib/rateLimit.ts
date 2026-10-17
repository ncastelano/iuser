// src/lib/rateLimit.ts
//
// Limite simples por chave (ex.: IP) em memória, janela deslizante. Em ambiente serverless cada instância tem a sua
// contagem, então é uma barreira contra varredura/abuso barato, não uma garantia global (o token de 160 bits é a
// proteção de verdade; isto só encarece tentativas em massa).
const buckets = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
    const now = Date.now()
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs)
    if (hits.length >= max) {
        buckets.set(key, hits)
        return false
    }
    hits.push(now)
    buckets.set(key, hits)
    if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
    return true
}

export function clientIp(req: Request): string {
    const fwd = req.headers.get('x-forwarded-for')
    return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'unknown'
}
