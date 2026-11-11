import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Social: pessoas e o que está rolando no iUser',
    description: 'Flash, publicações, melhores perfis, quem você segue e gente perto de você num só lugar. Entre, acompanhe e participe.',
    path: '/social',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
