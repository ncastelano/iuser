// app/layout.tsx

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
  metadataBase: new URL('https://www.iuser.com.br'),
  title: 'iUser | Mostre o que você tem de melhor!',
  description: 'iUser: Mostre o que você tem de melhor!',
  alternates: {
    canonical: 'https://www.iuser.com.br',
  },
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
    description: 'Tudo o que você precisa está aqui!',
    url: 'https://www.iuser.com.br',
    siteName: 'iuser.com.br',
    images: [
      {
        url: '/logo.png',
        width: 1254,
        height: 1254,
        alt: 'iUser',
        type: 'image/png',
      },
    ],
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary',
    title: 'iUser | Mostre o que você tem de melhor!',
    description: 'Tudo o que você precisa está aqui!',
    images: ['/logo.png'],
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

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'iUser',
  url: 'https://www.iuser.com.br',
  logo: 'https://www.iuser.com.br/logo.png',
  description: 'iUser: Mostre o que você tem de melhor!',
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'iUser',
  url: 'https://www.iuser.com.br',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
