import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Imóveis para alugar',
    description: 'Casas, apartamentos, quartos e salas para alugar, por mês ou por temporada, com o valor total e visita marcada pelo iUser.',
    path: '/imoveis',
})

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
