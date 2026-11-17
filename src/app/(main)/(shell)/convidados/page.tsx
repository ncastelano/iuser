// app/(main)/(shell)/convidados/page.tsx — Convidados iUser: convidar, a graduação, a rede, o saldo e o saque (versions/v3/screens/ConvidadosScreen)
import type { Metadata } from 'next'
import ConvidadosScreen from '@/versions/v3/screens/ConvidadosScreen'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Convidados iUser',
    description: 'Convide pessoas para o iUser com o seu link e ganhe uma parte do que elas pagam no plano. Veja a sua rede, o saldo e saque por Pix.',
    path: '/convidados',
})

export default function ConvidadosPage() {
    return <ConvidadosScreen />
}
