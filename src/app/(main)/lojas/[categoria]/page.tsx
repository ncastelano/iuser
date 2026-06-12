// app/(main)/lojas/[categoria]/page.tsx
import { notFound } from 'next/navigation'
import { Star, Clock, ChevronRight, Search, ArrowLeft } from 'lucide-react'
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

    // Simula "últimos clicados" com as primeiras 3 lojas da categoria
    const recentStores = stores.slice(0, 3)

    return (
        <div className="relative min-h-screen">
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            <main className="relative z-10 min-h-screen pb-24">
                {/* HEADER – ESTILO INICIO (PRETO) */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000000, #000000)',
                        padding: '20px 24px',
                        color: '#ffffff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Imagem decorativa sutil à direita (logo transparente) */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -30,
                            top: -30,
                            opacity: 0.15,
                            transform: 'rotate(10deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}
                    >
                        <img
                            src="/logotransparente.png"
                            alt="Logo"
                            style={{ width: 200, height: 200, objectFit: 'contain' }}
                        />
                    </div>

                    {/* Conteúdo do header */}
                    <div className="relative z-10">
                        {/* Botão de voltar com seta + "Voltar" */}
                        <div className="flex items-center gap-3 mb-1">
                            <Link
                                href="/"
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <ArrowLeft className="w-5 h-5 text-white" />
                            </Link>
                            <h2 className="text-lg font-semibold opacity-90">Voltar</h2>
                        </div>

                        {/* Nome da categoria em destaque (como o @profileslug) */}
                        <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                            {info.titulo}
                        </h1>

                        {/* Últimos clicados (simulados com as 3 primeiras lojas) */}
                        {recentStores.length > 0 && (
                            <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                                {recentStores.map((store) => (
                                    <Link
                                        key={store.id}
                                        href={`/lojas/${categoria}/${store.storeSlug}`}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                                        style={{
                                            background: 'rgba(255,255,255,0.15)',
                                            backdropFilter: 'blur(10px)',
                                            color: '#fff',
                                        }}
                                    >
                                        {store.logo_url ? (
                                            <img
                                                src={store.logo_url}
                                                alt={store.name}
                                                className="w-5 h-5 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs">
                                                {store.name.charAt(0)}
                                            </div>
                                        )}
                                        <span>{store.name}</span>
                                    </Link>
                                ))}
                            </div>
                        )}

                        {/* Barra de busca */}
                        <div
                            className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
                            style={{
                                background: 'rgba(255,255,255,0.10)',
                                backdropFilter: 'blur(10px)',
                            }}
                        >
                            <Search size={18} className="opacity-70" />
                            <span className="opacity-70">Buscar em {info.titulo.toLowerCase()}...</span>
                        </div>
                    </div>
                </div>

                {/* LISTA DE LOJAS COMPLETA */}
                <section className="px-0 mt-6">
                    <div className="space-y-3 px-2">
                        {stores.map((store) => (
                            <Link
                                key={store.id}
                                href={`/lojas/${categoria}/${store.storeSlug}`}
                                className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 border border-white/40 shadow-sm hover:shadow-md transition-all flex gap-3"
                            >
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

                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-800">{store.name}</h3>
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
                    </div>
                </section>
            </main>
        </div>
    )
}