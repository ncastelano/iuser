import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Aceitar corridas',
    description: 'Veja as corridas disponíveis perto de você em tempo real e candidate-se com a sua tarifa ou a tarifa iUser.',
    path: '/aceitar-corridas',
    kind: 'corrida',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
