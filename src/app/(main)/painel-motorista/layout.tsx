import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Painel do Motorista',
    description: 'Cadastre seu carro, moto ou bicicleta, defina sua tarifa e ligue o Aceitar-corridas pra começar a receber corridas.',
    path: '/painel-motorista',
    kind: 'motorista',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
