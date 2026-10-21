import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Todos os serviços',
    description: 'Os serviços oferecidos por lojas e por pessoas no iUser, com preço, avaliação e quem faz.',
    path: '/servicos-disponiveis',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
