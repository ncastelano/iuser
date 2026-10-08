import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Lojas perto de você',
    description: 'Veja as lojas do iUser de todas as categorias, compare as avaliações e peça com entrega ou retirada.',
    path: '/lojas',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
