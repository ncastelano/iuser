import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Comunidades',
    description: 'Entre nas comunidades da sua cidade: converse, tire dúvidas e descubra o que está acontecendo perto de você.',
    path: '/comunidade',
    kind: 'comunidade',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
