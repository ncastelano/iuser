import type { Metadata } from 'next'
import { categorias } from '@/lib/categorias'
import { pageMetadata } from '@/lib/pageMetadata'

type Props = { params: Promise<{ categoria: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { categoria } = await params
    const cat = categorias.find((c) => c.slug === categoria)
    const name = cat ? cat.nome : 'Lojas'
    return pageMetadata({
        title: cat ? `Lojas de ${name}` : 'Lojas',
        description: cat
            ? `As melhores lojas de ${name} perto de você no iUser: veja o que está aberto agora, avaliações e peça com entrega.`
            : 'Descubra lojas perto de você no iUser.',
        path: `/lojas/${categoria}`,
        kind: 'loja',
    })
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
