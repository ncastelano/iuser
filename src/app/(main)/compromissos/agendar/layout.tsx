import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Agende o seu horário',
    description: 'Escolha o dia e o horário e marque direto com a loja ou o profissional, sem troca de mensagens.',
    path: '/compromissos/agendar',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
