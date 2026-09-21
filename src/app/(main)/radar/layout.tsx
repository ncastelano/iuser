import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Veja o que tem perto de você',
    description: 'No radar do iUser você vê lojas, serviços e produtos ao seu redor: procure, compare e descubra o que está pertinho. Os mais vistos aparecem primeiro.',
    path: '/radar',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
