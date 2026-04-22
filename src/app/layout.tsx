import type { Viewport, Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
  colorScheme: 'light',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://iuser.com.br'),
  title: 'iUser | Catálogo Digital Inteligente',
  description: 'Os melhores produtos e serviços, você encontra aqui!',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'iUser | Catálogo Digital Inteligente',
    description: 'Os melhores produtos e serviços, você encontra aqui!',
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
    description: 'Os melhores produtos e serviços, você encontra aqui!',
    images: ['/logo.png'],
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
