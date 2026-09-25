import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Precisa de um profissional?',
    description: 'Conte o que você precisa (pintura, elétrica, hidráulica, limpeza...) e receba propostas de profissionais da sua região.',
    path: '/solicitar-servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
