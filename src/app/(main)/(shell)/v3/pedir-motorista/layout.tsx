import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Precisa de um motorista?',
    description: 'Carro, moto ou bicicleta para levar você, uma encomenda ou o seu pet. Receba propostas e escolha o melhor preço.',
    path: '/pedir-motorista',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
