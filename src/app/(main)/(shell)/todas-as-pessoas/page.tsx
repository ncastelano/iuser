// app/(main)/(shell)/todas-as-pessoas/page.tsx — todas as pessoas do iUser (versions/v3/screens/TodasAsPessoasScreen)
import type { Metadata } from 'next'
import TodasAsPessoasScreen from '@/versions/v3/screens/TodasAsPessoasScreen'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Todas as pessoas',
    description: 'Veja as pessoas que estão no iUser, as mais novas primeiro, e procure por nome ou @.',
    path: '/todas-as-pessoas',
})

export default function TodasAsPessoasPage() {
    return <TodasAsPessoasScreen />
}
