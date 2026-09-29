import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Navegação da corrida',
    description: 'Mapa em tela cheia com sua posição ao vivo até o próximo ponto da corrida.',
    path: '/aceitar-corridas/mapa',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
