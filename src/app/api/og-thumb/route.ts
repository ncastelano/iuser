import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// Serve o arquivo local diretamente (em vez de redirecionar) — um redirect
// dependeria do host que o servidor vê na request, que atrás de proxy/dev
// server pode não bater com o domínio público.
async function fallbackLogo() {
    const buffer = await readFile(path.join(process.cwd(), 'public', 'logo-preview.png'))
    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
    })
}

// Redimensiona avatar/logo (tamanho arbitrário, vindo do Supabase Storage) pra
// um quadrado pequeno antes de servir como og:image/twitter:image — é isso
// que faz WhatsApp/Telegram/iMessage preferirem mostrar a miniatura do lado
// do texto em vez de esticar a imagem inteira em cima, como banner.
export async function GET(req: NextRequest) {
    const src = req.nextUrl.searchParams.get('src')
    if (!src) return fallbackLogo()

    let parsed: URL
    try {
        parsed = new URL(src)
    } catch {
        return fallbackLogo()
    }

    // Só busca imagens do nosso próprio Supabase Storage — sem isso, essa
    // rota vira um proxy aberto pra buscar qualquer URL da internet.
    const allowedOrigin = SUPABASE_URL ? new URL(SUPABASE_URL).origin : null
    if (!allowedOrigin || parsed.origin !== allowedOrigin) {
        return fallbackLogo()
    }

    try {
        const upstream = await fetch(parsed.toString())
        if (!upstream.ok) throw new Error(`upstream status ${upstream.status}`)
        const buffer = Buffer.from(await upstream.arrayBuffer())

        const resized = await sharp(buffer)
            .resize(300, 300, { fit: 'cover', position: 'centre' })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .png()
            .toBuffer()

        return new NextResponse(new Uint8Array(resized), {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
        })
    } catch (err) {
        console.error('[og-thumb] Erro ao gerar miniatura:', err)
        return fallbackLogo()
    }
}
