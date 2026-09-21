import type { Metadata } from 'next'
import { categorias } from '@/lib/categorias'
import { pageMetadata } from '@/lib/pageMetadata'

type Props = { params: Promise<{ categoria: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { categoria } = await params
    const cat = categorias.find((c) => c.slug === categoria)
    const name = cat ? cat.nome : 'Lojas'
    return pageMetadata({
        title: cat ? `Lojas de ${name} perto de você` : 'Lojas perto de você',
        description: cat
            ? `Veja o que está aberto agora em ${name}, compare as avaliações e peça direto pelo iUser, com entrega ou retirada.`
            : 'Descubra lojas perto de você no iUser.',
        path: `/lojas/${categoria}`,
    })
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
