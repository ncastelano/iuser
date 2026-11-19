// app/(main)/(shell)/forum/page.tsx — o Fórum do iUser: novidades das versões e ideias de quem usa (versions/v3/screens/ForumScreen)
import type { Metadata } from 'next'
import ForumScreen from '@/versions/v3/screens/ForumScreen'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Fórum do iUser',
    description: 'Veja o que mudou em cada versão do iUser, sugira o que você quer no app e vote nas ideias das outras pessoas.',
    path: '/forum',
})

export default function ForumPage() {
    return <ForumScreen />
}
