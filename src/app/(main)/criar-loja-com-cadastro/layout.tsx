import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Crie sua conta e sua loja',
    description: 'Cadastre-se e abra sua loja no iUser: venda, receba pedidos e chame motoristas para entregar.',
    path: '/criar-loja-com-cadastro',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
