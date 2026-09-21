import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Abra a sua loja no iUser',
    description: 'Cadastre produtos, receba pedidos e chame motoristas para entregar. Comece sem mensalidade no plano Pós-pago.',
    path: '/criar-loja',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
