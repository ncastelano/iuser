import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Quanto custa a sua corrida?',
    description: 'Calcule pela distância o preço de uma corrida de carro, moto ou bicicleta e compare com a tarifa iUser.',
    path: '/calculadora-de-corrida',
    kind: 'calculadora',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
