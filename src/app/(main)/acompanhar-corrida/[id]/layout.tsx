import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Acompanhe a corrida ao vivo',
    description: 'Veja o status, os endereços e quem é o motorista em tempo real. Sem precisar de conta no iUser.',
    path: '/acompanhar-corrida',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
