// app/(main)/lojas/[categoria]/page.tsx

import { notFound } from 'next/navigation'
import { Star, Clock, ChevronRight, ArrowLeft } from 'lucide-react'
import { dadosMockados, type Store } from '@/app/(main)/inicio/dadoDeLojas'
import AnimatedBackground from '@/components/AnimatedBackground'
import Link from 'next/link'

const categoriasInfo: Record<string, { titulo: string; descricao: string }> = {
    restaurantes: { titulo: 'Restaurantes', descricao: 'Peça sua comida favorita' },
    mercados: { titulo: 'Mercados', descricao: 'Compras do dia a dia' },
    farmacias: { titulo: 'Farmácias', descricao: 'Saúde e bem-estar' },
    petshops: { titulo: 'Pet Shops', descricao: 'Para seu melhor amigo' },
    fitness: { titulo: 'Fitness', descricao: 'Academias e suplementos' },
    roupas: { titulo: 'Roupas', descricao: 'Moda e estilo' },
    entregas: { titulo: 'Entregas', descricao: 'Envie ou receba pacotes' },
}

async function getStores(categoria: string): Promise<Store[]> {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return dadosMockados[categoria] || []
}

function formatPrepTime(store: Store): string {
    if (store.prep_time_min === null && store.prep_time_max === null) return 'Indisponível'
    if (store.prep_time_min !== null && store.prep_time_max !== null) {
        return `${store.prep_time_min}–${store.prep_time_max} min`
    }
    if (store.prep_time_min !== null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
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

    const stores = await getStores(categoria)

    return (
        <div className="relative min-h-screen">
            {/* Fundo */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            <main className="relative z-10 min-h-screen pb-24">
                {/* HEADER */}
                <header className="sticky top-0 z-20 pt-4 pb-2">
                    <div className="mx-3 rounded-2xl bg-white/90 backdrop-blur-lg border border-white/40 shadow-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Link
                                href="/"
                                className="text-gray-500 hover:text-orange-500 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>

                            <h1 className="text-xl font-black text-gray-800">
                                {info.titulo}
                            </h1>
                        </div>

                        <p className="text-sm text-gray-500 ml-7">
                            {info.descricao}
                        </p>
                    </div>
                </header>

                {/* LISTA */}
                <section className="px-2 mt-4 space-y-3">
                    {stores.map((store) => (
                        <Link
                            key={store.id}
                            href={`/lojas/${categoria}/${store.storeSlug}`}
                            className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 border border-white/40 shadow-sm hover:shadow-md transition-all flex gap-3"
                        >
                            {/* logo / imagem */}
                            <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                                {store.logo_url ? (
                                    <img
                                        src={store.logo_url}
                                        alt={store.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                        Sem logo
                                    </div>
                                )}
                            </div>

                            {/* infos */}
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800">
                                        {store.name}
                                    </h3>
                                    <p className="text-xs text-gray-500 line-clamp-2">
                                        {store.description}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                    <span className="flex items-center gap-1">
                                        <Star className="w-3 h-3 text-yellow-500" />
                                        {store.ratings_avg} ({store.ratings_count})
                                    </span>

                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatPrepTime(store)}
                                    </span>
                                </div>
                            </div>

                            <ChevronRight className="w-5 h-5 text-gray-400 self-center" />
                        </Link>
                    ))}
                </section>
            </main>
        </div>
    )
}