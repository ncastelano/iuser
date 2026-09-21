import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Converse com a sua cidade',
    description: 'Entre nas comunidades do iUser, tire dúvidas, combine encontros e descubra o que está acontecendo perto de você.',
    path: '/comunidade',
    kind: 'comunidade',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
