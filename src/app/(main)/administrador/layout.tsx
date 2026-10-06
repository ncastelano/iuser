import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Administrador',
    description: 'Painel do administrador geral do iUser.',
    path: '/administrador',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
