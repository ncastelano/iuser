import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Procurar serviço',
    description: 'Pedidos de serviço abertos perto de você: pintor, encanador, eletricista, diarista e mais. Candidate-se e ganhe clientes.',
    path: '/procurar-servico',
    kind: 'servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
