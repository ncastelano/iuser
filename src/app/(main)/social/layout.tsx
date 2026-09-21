import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'O que está rolando no iUser',
    description: 'Publicações, novidades e pessoas do iUser num só lugar. Entre, acompanhe e participe.',
    path: '/social',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
