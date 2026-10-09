import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Todos os produtos',
    description: 'Veja os produtos de todas as lojas e perfis do iUser, com preço, avaliação e quem vende.',
    path: '/produtos',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
