import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Comprar',
    description: 'Produtos e lojas perto de você: peça de novo, veja o que está em alta e compre com entrega ou retirada.',
    path: '/comprar',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
