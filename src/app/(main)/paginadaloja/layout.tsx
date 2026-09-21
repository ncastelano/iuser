import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Página da loja',
    description: 'Conheça a página da loja no iUser: produtos, horários, entrega e avaliações.',
    path: '/paginadaloja',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
