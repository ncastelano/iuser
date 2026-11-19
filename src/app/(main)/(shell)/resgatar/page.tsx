// app/(main)/(shell)/resgatar/page.tsx — o QR do CARTÃO DE CRÉDITO do iUser cai aqui (/resgatar?codigo=IU...). Tela: versions/v3/screens/ResgatarScreen
import type { Metadata } from 'next'
import ResgatarScreen from '@/versions/v3/screens/ResgatarScreen'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = { ...pageMetadata({
    title: 'Cartão de crédito iUser',
    description: 'Use o seu cartão do iUser: desconto no seu pedido em qualquer loja do iUser.',
    path: '/resgatar',
}), robots: { index: false, follow: false } }

export default function ResgatarPage() {
    return <ResgatarScreen />
}
