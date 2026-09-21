import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Pedir serviço',
    description: 'Encontre profissionais de confiança pra pintura, encanamento, elétrica, limpeza e mais. Receba propostas e escolha.',
    path: '/pedir-servico',
    kind: 'servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
