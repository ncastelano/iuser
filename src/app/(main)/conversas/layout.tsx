import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = {
    ...pageMetadata({
        title: 'Conversas',
        description: 'Suas conversas no iUser: pessoas e lojas que entraram em contato com você.',
        path: '/conversas',
    }),
    robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
