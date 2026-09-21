import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Pós-pago: sem mensalidade, só R$ 0,50 por serviço',
    description: 'Entenda o plano Pós-pago do iUser: você só paga R$ 0,50 por serviço realizado e acompanha cada cobrança, sem mensalidade.',
    path: '/planos/pos-pago',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
