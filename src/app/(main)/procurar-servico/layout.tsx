import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Serviços procurando profissional',
    description: 'Pintor, encanador, eletricista, diarista e mais: veja os pedidos perto de você e candidate-se para fechar novos clientes.',
    path: '/procurar-servico',
    kind: 'servico',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
