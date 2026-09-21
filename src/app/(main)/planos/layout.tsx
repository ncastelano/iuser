import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Planos',
    description: 'Motorista, Prestador, Loja ou Combo. Ou sem mensalidade: no Pós-pago você paga só R$ 0,50 por serviço. Escolha o seu.',
    path: '/planos',
    kind: 'planos',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
