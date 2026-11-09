// /painel-teste — laboratório do NOVO PAINEL DA LOJA para a 3.0 (só teste: não faz parte do app; pode ser apagado).
// Fora da casca e fora de busca. Tudo aqui é exemplo: nada lê nem grava dado de verdade.
import type { Metadata } from 'next'
import PainelLab from './PainelLab'

export const metadata: Metadata = { title: 'Laboratório do painel da loja', robots: { index: false, follow: false } }

export default function PainelTeste() {
    return <PainelLab />
}
