// /painel-teste — laboratórios do painel da loja (só teste: não fazem parte do app; podem ser apagados). Fora da casca e fora de busca.
//   /painel-teste               → o novo painel da loja (3.0)
//   /painel-teste?lab=bordas    → níveis e bordas da loja
// Tudo aqui é exemplo: nada lê nem grava dado de verdade.
import type { Metadata } from 'next'
import PainelLab from './PainelLab'
import BordasLab from './BordasLab'

export const metadata: Metadata = { title: 'Laboratório do painel da loja', robots: { index: false, follow: false } }

export default async function PainelTeste({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
    const { lab } = await searchParams
    return lab === 'bordas' ? <BordasLab /> : <PainelLab />
}
