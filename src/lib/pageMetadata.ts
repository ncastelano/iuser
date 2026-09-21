// src/lib/pageMetadata.ts
import type { Metadata } from 'next'

const BASE_URL = 'https://www.iuser.com.br'
const THUMB_SIZE = 200 // menos de 300px = miniatura do lado esquerdo no WhatsApp

// Metadados de prévia (WhatsApp, Telegram, iMessage...) de páginas fixas:
// logo do iUser (200x200) + título e descrição próprios de cada página. Páginas client ('use client')
// não exportam metadata, então cada rota usa isso num layout.tsx ao lado.
export function pageMetadata(params: { title: string; description: string; path: string }): Metadata {
    const image = `${BASE_URL}/logo-preview-thumb.png`
    const url = `${BASE_URL}${params.path}`
    return {
        title: `${params.title} | iUser`,
        description: params.description,
        alternates: { canonical: url },
        openGraph: {
            title: params.title,
            description: params.description,
            url,
            siteName: 'iUser',
            images: [{ url: image, width: THUMB_SIZE, height: THUMB_SIZE, alt: params.title, type: 'image/png' }],
            type: 'website',
            locale: 'pt_BR',
        },
        twitter: {
            card: 'summary',
            title: params.title,
            description: params.description,
            images: [image],
        },
    }
}
