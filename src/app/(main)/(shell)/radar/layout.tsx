import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Veja o que tem perto de você',
    description: 'O mapa do iUser: lojas, serviços, produtos e pessoas ao seu redor, com distância, nota e o que está aberto agora.',
    path: '/radar',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
