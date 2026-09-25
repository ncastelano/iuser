import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Minhas entregas',
    description: 'Veja suas entregas atribuídas e a melhor rota. Sem precisar de conta no iUser.',
    path: '/entregador',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
