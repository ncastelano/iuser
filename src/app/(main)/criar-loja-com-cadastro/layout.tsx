import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Crie a conta e abra sua loja',
    description: 'Cadastre-se em poucos minutos e comece a vender: produtos, pedidos, entrega com motorista iUser e Club VIP.',
    path: '/criar-loja-com-cadastro',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
