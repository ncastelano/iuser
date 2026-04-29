import type { Viewport, Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f97316',
  colorScheme: 'light',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://iuser.com.br'),
  title: 'iUser | Catálogo Digital Inteligente',
  description: 'Os melhores produtos e serviços, você encontra aqui!',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
  manifest: '/manifest.json',
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
