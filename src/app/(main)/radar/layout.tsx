import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Radar de lojas',
    description: 'Veja no mapa as lojas, serviços e produtos perto de você — e o ranking dos mais vistos, mais vendidos e mais comentados.',
    path: '/radar',
    kind: 'radar',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
