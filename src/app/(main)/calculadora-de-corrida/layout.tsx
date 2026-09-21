import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Calculadora de corrida',
    description: 'Calcule quanto custa uma corrida de carro, moto ou bicicleta pela distância e compare com a tarifa iUser.',
    path: '/calculadora-de-corrida',
    kind: 'calculadora',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
