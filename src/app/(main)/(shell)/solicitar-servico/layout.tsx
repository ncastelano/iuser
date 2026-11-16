import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Contratar serviço',
    description: 'Peça um serviço, escolha quem vai fazer e acompanhe o que você contratou e já concluiu.',
    path: '/solicitar-servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
