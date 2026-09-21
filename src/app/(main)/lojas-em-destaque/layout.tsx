import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Lojas em destaque',
    description: 'As lojas que estão bombando no iUser: mais vistas, mais bem avaliadas e com entrega. Descubra e peça agora.',
    path: '/lojas-em-destaque',
    kind: 'loja',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
