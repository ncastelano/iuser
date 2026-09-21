import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'As lojas que estão em alta',
    description: 'Descubra as lojas mais vistas e mais bem avaliadas do iUser e peça com entrega ou retirada.',
    path: '/lojas-em-destaque',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
