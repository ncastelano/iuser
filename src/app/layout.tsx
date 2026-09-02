// app/layout.tsx

import type { Viewport, Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'
import { ServiceWorkerRegister } from './(main)/ServiceWorkerRegister'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f97316',
  colorScheme: 'light',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://iuser.com.br'),
  title: 'iUser | Mostre o que você tem de melhor!',
  description: 'iUser: Mostre o que você tem de melhor!',
  verification: {
    google: 'lUgD-IyItAD8DLPH6GiHQxOcIXArO5WVoqV-yAZFXQk',
  },
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
    title: 'iUser | Mostre o que você tem de melhor!',
    description: 'Os melhores produtos e serviços, você encontra aqui!',
    url: 'https://iuser.com.br',
    siteName: 'iuser.com.br',
    images: [
      {
        url: '/logo-og.png',
        width: 1200,
        height: 630,
        alt: 'iUser',
        type: 'image/png',
      },
      {
        url: '/logo.png',
        width: 400,
        height: 400,
        alt: 'iUser',
      }
    ],
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iUser | Mostre o que você tem de melhor!',
    description: 'Os melhores produtos e serviços, você encontra aqui!',
    images: ['/logo-og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
          {/* ✅ Service Worker Register - Registra o SW em toda a aplicação */}
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  )
}