// src/app/(main)/lojas/[categoria]/page.tsx
import { notFound } from 'next/navigation'
import { MapPin, Star, Clock, ChevronRight, ArrowLeft } from 'lucide-react'
import { dadosMockados, type Loja } from '@/app/(main)/inicio/dadomockado'
import AnimatedBackground from '@/components/AnimatedBackground'
import Link from 'next/link'

// Mapeamento de categorias para título e descrição
const categoriasInfo: Record<string, { titulo: string; descricao: string }> = {
    restaurantes: { titulo: 'Restaurantes', descricao: 'Peça sua comida favorita' },
    mercados: { titulo: 'Mercados', descricao: 'Compras do dia a dia' },
    farmacias: { titulo: 'Farmácias', descricao: 'Saúde e bem-estar' },
    petshops: { titulo: 'Pet Shops', descricao: 'Para seu melhor amigo' },
    fitness: { titulo: 'Fitness', descricao: 'Academias e suplementos' },
    roupas: { titulo: 'Roupas', descricao: 'Moda e estilo' },
    entregas: { titulo: 'Entregas', descricao: 'Envie ou receba pacotes' },
}

// Função que retorna os dados mockados (substitua por fetch real)
async function getLojas(categoria: string): Promise<Loja[]> {
    await new Promise(resolve => setTimeout(resolve, 100))
    return dadosMockados[categoria] || []
}

export default async function ListaCategoriaPage({
    params,
}: {
    params: Promise<{ categoria: string }>
}) {
    const { categoria } = await params
    const info = categoriasInfo[categoria]

    if (!info) {
        notFound()
    }

    const lojas = await getLojas(categoria)

    return (
        <div className="relative min-h-screen">
            {/* Fundo animado */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            {/* Conteúdo principal */}
            <main className="relative z-10 min-h-screen pb-24">
                {/* Header com título e botão voltar */}
                <header className="sticky top-0 z-20 pt-4 pb-2">
                    <div className="mx-3 rounded-2xl bg-white/90 backdrop-blur-lg border border-white/40 shadow-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Link href="/" className="text-gray-500 hover:text-orange-500 transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <h1 className="text-xl font-black text-gray-800">{info.titulo}</h1>
                        </div>
                        <p className="text-sm text-gray-500 ml-7">{info.descricao}</p>
                    </div>
                </header>

                {/* Lista de lojas */}
                <section className="px-2 mt-4 space-y-3">
                    {lojas.map((loja) => (
                        <div
                            key={loja.id}
                            className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 border border-white/40 shadow-sm hover:shadow-md transition-all cursor-pointer flex gap-3"
                        >
                            {/* Imagem da loja */}
                            <div className="w-24 h-24 rounded-xl shrink-0 relative overflow-hidden">
                                <img
                                    src={loja.imagem}
                                    alt={loja.nome}
                                    className="w-full h-full object-cover"
                                />

                                {/* overlay pra dar efeito premium */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                            </div>

                            {/* Informações */}
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800">{loja.nome}</h3>
                                    <p className="text-xs text-gray-500 line-clamp-2">{loja.descricao}</p>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                    <span className="flex items-center gap-1">
                                        <Star className="w-3 h-3 text-yellow-500" />
                                        {loja.avaliacao}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {loja.tempo_entrega}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {loja.distancia}
                                    </span>
                                </div>
                            </div>

                            <ChevronRight className="w-5 h-5 text-gray-400 self-center" />
                        </div>
                    ))}
                </section>
            </main>
        </div>
    )
}