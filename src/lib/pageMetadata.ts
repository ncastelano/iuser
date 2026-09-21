// src/lib/pageMetadata.ts
import type { Metadata } from 'next'

const BASE_URL = 'https://www.iuser.com.br'
const THUMB_SIZE = 200 // menos de 300px = miniatura do lado esquerdo no WhatsApp

export type CardKind = 'planos' | 'motorista' | 'corrida' | 'servico' | 'loja' | 'radar' | 'comunidade' | 'calculadora'

// Metadados de prévia (WhatsApp, Telegram, iMessage...) de páginas fixas:
// miniatura quadrada 200x200 com ícone próprio + título e descrição do tipo
// de página. Páginas client ('use client') não exportam metadata, então cada
// rota usa isso num layout.tsx ao lado.
export function pageMetadata(params: { title: string; description: string; path: string; kind: CardKind }): Metadata {
    const image = `${BASE_URL}/api/og-card?kind=${params.kind}`
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
