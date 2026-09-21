import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Acompanhe a corrida',
    description: 'Veja em tempo real o status da corrida, os endereços e quem é o motorista — sem precisar de conta.',
    path: '/acompanhar-corrida',
    kind: 'corrida',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
