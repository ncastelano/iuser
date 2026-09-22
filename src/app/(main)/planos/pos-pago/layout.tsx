import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Pós-pago: sem mensalidade, pague só pelo que usar',
    description: 'Entenda o plano Pós-pago do iUser: você paga por serviço realizado, com valores que variam por tipo, e acompanha cada cobrança, sem mensalidade.',
    path: '/planos/pos-pago',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
