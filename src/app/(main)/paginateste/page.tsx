// /paginateste — laboratório da navbar (só teste: não faz parte do app; pode ser apagada). Fora da casca e fora de busca.
import type { Metadata } from 'next'
import NavLab from './NavLab'

export const metadata: Metadata = { title: 'Laboratório da navbar', robots: { index: false, follow: false } }

export default function PaginaTeste() {
    return <NavLab />
}
