// /paginateste — laboratórios (só teste: não fazem parte do app; podem ser apagados). Fora da casca e fora de busca.
//   /paginateste               → a navbar (NavLab)
//   /paginateste?lab=corrida   → o card de corrida da home (RideCardLab)
import type { Metadata } from 'next'
import NavLab from './NavLab'
import RideCardLab from './RideCardLab'

export const metadata: Metadata = { title: 'Laboratório', robots: { index: false, follow: false } }

export default async function PaginaTeste({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
    const { lab } = await searchParams
    return lab === 'corrida' ? <RideCardLab /> : <NavLab />
}
