import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Seu painel de motorista',
    description: 'Ligue o Aceitar-corridas, cadastre carro, moto ou bicicleta e defina a sua tarifa. Comece a receber corridas hoje.',
    path: '/painel-motorista',
    kind: 'motorista',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
