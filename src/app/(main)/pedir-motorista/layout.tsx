import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Pedir motorista',
    description: 'Peça um motorista de carro, moto ou bicicleta pra levar você, um objeto ou um animal. Escolha o preço entre os candidatos.',
    path: '/pedir-motorista',
    kind: 'corrida',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
