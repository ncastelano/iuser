import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Crie sua loja',
    description: 'Monte sua loja em minutos: produtos, pedidos, entrega com motorista iUser e Club VIP. Sem mensalidade no plano Pós-pago.',
    path: '/criar-loja',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
