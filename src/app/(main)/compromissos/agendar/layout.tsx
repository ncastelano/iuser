import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Agendar horário',
    description: 'Escolha o dia e o horário e agende direto com a loja ou o profissional pelo iUser.',
    path: '/compromissos/agendar',
    kind: 'servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
