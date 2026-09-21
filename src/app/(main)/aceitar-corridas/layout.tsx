import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Corridas esperando por você',
    description: 'Novas corridas aparecem aqui em tempo real, com alerta sonoro. Escolha a tarifa iUser ou a sua e candidate-se.',
    path: '/aceitar-corridas',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
