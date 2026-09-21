import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

// Miniatura 200x200 (menos de 300px = o WhatsApp mostra do lado esquerdo do
// texto) com um ícone diferente por tipo de link, pra cada página ter um
// destaque próprio na prévia. Só formas (sem texto) pra não depender de
// fontes instaladas no servidor.
const SIZE = 200

const ICONS: Record<string, string> = {
    // estrela (planos)
    planos: `<polygon points="100,38 121,80 168,86 134,118 143,164 100,141 57,164 66,118 32,86 79,80" fill="#fff"/>`,
    // carro (painel do motorista)
    motorista: `
        <rect x="42" y="98" width="116" height="42" rx="14" fill="#fff"/>
        <path d="M66 100 L80 68 Q82 64 87 64 L113 64 Q118 64 120 68 L134 100 Z" fill="#fff"/>
        <circle cx="72" cy="142" r="15" fill="#fff" stroke="url(#g)" stroke-width="6"/>
        <circle cx="128" cy="142" r="15" fill="#fff" stroke="url(#g)" stroke-width="6"/>`,
    // pino de mapa (corridas)
    corrida: `
        <path d="M100 36 C70 36 54 60 54 84 C54 116 100 168 100 168 C100 168 146 116 146 84 C146 60 130 36 100 36 Z" fill="#fff"/>
        <circle cx="100" cy="84" r="20" fill="url(#g)"/>`,
    // maleta (serviços)
    servico: `
        <rect x="44" y="78" width="112" height="76" rx="14" fill="#fff"/>
        <path d="M78 78 V66 Q78 56 88 56 H112 Q122 56 122 66 V78" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
        <rect x="44" y="108" width="112" height="8" fill="url(#g)"/>
        <rect x="92" y="102" width="16" height="20" rx="4" fill="url(#g)"/>`,
}

export async function GET(req: NextRequest) {
    const kind = req.nextUrl.searchParams.get('kind') || ''
    const icon = ICONS[kind] || ICONS.planos

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#dc2626"/></linearGradient></defs>
        <rect width="${SIZE}" height="${SIZE}" rx="36" fill="url(#g)"/>
        ${icon}
    </svg>`

    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return new NextResponse(new Uint8Array(png), {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
    })
}
