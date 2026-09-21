import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Social iUser',
    description: 'Publicações, novidades e pessoas do iUser num só lugar.',
    path: '/social',
    kind: 'comunidade',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
