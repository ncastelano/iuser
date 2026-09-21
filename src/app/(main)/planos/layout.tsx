import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Descubra o melhor plano para você',
    description: 'Veja os planos e as ofertas do iUser: Motorista, Prestador, Loja, Combo ou o Pós-pago sem mensalidade. Compare e escolha o que combina com o seu momento.',
    path: '/planos',
    kind: 'planos',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
