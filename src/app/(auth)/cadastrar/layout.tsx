import type { Metadata } from 'next'

// Prévia própria do link de cadastro (antes saía a do app inteiro): diz que é para CRIAR A CONTA
const BASE = 'https://www.iuser.com.br'
export const metadata: Metadata = {
    title: 'Crie sua conta grátis no iUser',
    description: 'Cadastre-se em 1 minuto e comece a comprar, vender, prestar serviço ou dirigir pelo iUser.',
    alternates: { canonical: `${BASE}/cadastrar` },
    openGraph: {
        title: 'Crie sua conta grátis no iUser',
        description: 'Cadastre-se em 1 minuto e comece a comprar, vender, prestar serviço ou dirigir pelo iUser.',
        url: `${BASE}/cadastrar`,
        siteName: 'iUser',
        images: [{ url: `${BASE}/logo-preview-thumb.png`, width: 200, height: 200, alt: 'Cadastro no iUser' }],
        type: 'website',
    },
    twitter: { card: 'summary', title: 'Crie sua conta grátis no iUser', images: [`${BASE}/logo-preview-thumb.png`] },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
