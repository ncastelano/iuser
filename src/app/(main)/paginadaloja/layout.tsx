import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Conheça esta loja',
    description: 'Produtos, horários, formas de entrega e avaliações de clientes: tudo da loja num só link.',
    path: '/paginadaloja',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
