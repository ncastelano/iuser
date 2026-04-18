import type { Viewport, Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://iuser.com.br'),
  title: 'iUser | Catálogo Digital Inteligente',
  description: 'Descubra as melhores lojas e produtos em um ecossistema digital premium.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'iUser | Catálogo Digital Inteligente',
    description: 'Descubra as melhores lojas e produtos em um ecossistema digital premium.',
    url: 'https://iuser.com.br',
    siteName: 'iuser.com.br',
    images: [{
      url: '/logo.png',
      width: 1200,
      height: 630,
      alt: 'iUser'
    }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iUser | Catálogo Digital Inteligente',
    description: 'Descubra as melhores lojas e produtos em um ecossistema digital premium.',
    images: ['/logo.png'],
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
