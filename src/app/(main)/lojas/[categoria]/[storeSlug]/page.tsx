'use client'

import { notFound, useParams } from 'next/navigation'
import {
    ArrowLeft,
    Star,
    Clock,
    ShoppingBag,
    MessageCircle,
    Share2,
    MapPin,
    Store as StoreIcon,
} from 'lucide-react'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'
import { dadosMockados, Store } from '@/app/(main)/inicio/dadoDeLojas'
import { dadosDosProdutos, Product } from '@/app/(main)/inicio/dadoDeProdutos'
import { agendamentosMockados, Appointment } from '@/app/(main)/inicio/dadosDeAgendamentos'


function findStore(categoria: string, slug: string): Store | undefined {
    const stores = dadosMockados[categoria] || []
    return stores.find((store) => store.storeSlug === slug)
}

const categoriasInfo: Record<string, { titulo: string; cor: string }> = {
    restaurantes: { titulo: 'Restaurante', cor: 'from-orange-500 to-red-500' },
    mercados: { titulo: 'Mercado', cor: 'from-green-500 to-emerald-600' },
    farmacias: { titulo: 'Farmácia', cor: 'from-yellow-400 to-red-500' },
    petshops: { titulo: 'Pet Shop', cor: 'from-pink-500 to-rose-500' },
    fitness: { titulo: 'Fitness', cor: 'from-purple-500 to-violet-600' },
    roupas: { titulo: 'Roupas', cor: 'from-blue-500 to-indigo-600' },
    entregas: { titulo: 'Entregas', cor: 'from-slate-500 to-gray-700' },
}

export default function StoreScreen() {
    const params = useParams<{ categoria: string; storeSlug: string }>()

    const categoria = params.categoria
    const storeSlug = params.storeSlug

    const store = findStore(categoria, storeSlug)
    const products: Product[] = dadosDosProdutos[storeSlug] ?? []
    const info = categoriasInfo[categoria]

    if (!store || !info) return notFound()

    const isOpen = store.is_open

    const prepTimeStr =
        store.prep_time_min != null
            ? store.prep_time_max != null && store.prep_time_max > 0
                ? `${store.prep_time_min}–${store.prep_time_max} min`
                : store.prep_time_min === 0
                    ? 'Presencial'
                    : `${store.prep_time_min} min`
            : 'Indisponível'

    // 🔥 APPOINTMENTS FILTRADOS POR LOJA
    const appointments: Appointment[] = agendamentosMockados

    const storeAppointments = appointments.filter(
        (a) => a.store_slug === storeSlug
    )

    return (
        <div className="relative min-h-screen bg-black">
            <div className="fixed inset-0 z-0">
                <AnimatedBackground />
            </div>

            <main className="relative z-10 pb-28">

                {/* HEADER */}
                <header className="p-4 flex items-center justify-between">
                    <Link
                        href={`/lojas/${categoria}`}
                        className="p-2 rounded-full bg-white/80 backdrop-blur"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>

                    <div
                        className={`px-4 py-1 rounded-full text-white text-xs font-semibold bg-gradient-to-r ${info.cor}`}
                    >
                        {info.titulo}
                    </div>
                </header>

                {/* HERO */}
                <section className="px-4">
                    <div className="relative rounded-3xl overflow-hidden shadow-xl">
                        <div
                            className={`absolute inset-0 bg-gradient-to-r ${info.cor} opacity-90`}
                        />

                        <div className="relative p-5 text-white">

                            <div className="flex items-start justify-between">

                                <div className="flex items-center gap-3">
                                    {store.logo_url && (
                                        <img
                                            src={store.logo_url}
                                            className="w-12 h-12 rounded-xl object-cover border border-white/30"
                                        />
                                    )}

                                    <div>
                                        <h1 className="text-xl font-black">
                                            {store.name}
                                        </h1>

                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                            <span className={`px-2 py-1 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}>
                                                {isOpen ? 'Aberto agora' : 'Fechado'}
                                            </span>

                                            <span>
                                                {store.ratings_avg} ★ ({store.ratings_count})
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <ShoppingBag className="w-8 h-8 opacity-80" />
                            </div>

                            <p className="text-sm opacity-90 mt-3">
                                {store.description}
                            </p>

                            <div className="flex flex-wrap gap-2 mt-4">

                                <button className="bg-white/20 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    WhatsApp
                                </button>

                                <button className="bg-white/20 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                    <StoreIcon className="w-3 h-3" />
                                    Seguir loja
                                </button>

                                <button className="bg-white/20 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                    <Share2 className="w-3 h-3" />
                                    Compartilhar
                                </button>

                                {store.address && (
                                    <button className="bg-white/20 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {store.address}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* INFO */}
                <section className="px-4 mt-4 grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-2xl p-3 text-center">
                        <Star className="w-4 h-4 mx-auto text-yellow-500" />
                        <p className="text-sm font-bold">{store.ratings_avg}</p>
                        <p className="text-[10px] text-gray-500">Avaliações</p>
                    </div>

                    <div className="bg-white rounded-2xl p-3 text-center">
                        <Clock className="w-4 h-4 mx-auto text-gray-600" />
                        <p className="text-sm font-bold">{prepTimeStr}</p>
                        <p className="text-[10px] text-gray-500">Tempo</p>
                    </div>

                    <div className="bg-white rounded-2xl p-3 text-center">
                        <ShoppingBag className="w-4 h-4 mx-auto text-gray-600" />
                        <p className="text-sm font-bold">
                            R$ {store.price_min?.toFixed(0)}+
                        </p>
                        <p className="text-[10px] text-gray-500">A partir</p>
                    </div>
                </section>

                {/* PRODUTOS */}
                <section className="px-4 mt-6">
                    <h2 className="text-lg font-bold mb-3">Produtos</h2>

                    <div className="grid grid-cols-2 gap-3">
                        {products.map((product) => (
                            <div key={product.id} className="bg-white rounded-2xl overflow-hidden">
                                <img
                                    src={product.image_url || ''}
                                    className="h-28 w-full object-cover"
                                />

                                <div className="p-3">
                                    <h3 className="font-semibold text-sm">{product.name}</h3>

                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {product.description}
                                    </p>

                                    <div className="flex justify-between mt-2">
                                        <p className="font-bold text-green-600">
                                            R$ {product.price.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 🔥 APPOINTMENTS (NOVO SISTEMA REAL) */}
                <section className="px-4 mt-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold">Agendamentos</h2>

                        <span className="text-xs text-gray-500">
                            {storeAppointments.length} ativos
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl p-4 space-y-4">

                        {storeAppointments.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                Nenhum agendamento nesta loja
                            </p>
                        ) : (
                            storeAppointments.map((a) => {
                                const labelPessoa =
                                    a.people_count > 1
                                        ? `com ${a.people_count} pessoas`
                                        : 'sozinho'

                                return (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">

                                            <img
                                                src={a.customer_avatar_url}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />

                                            <div>
                                                <p className="text-sm font-semibold">
                                                    @{a.customer_slug}
                                                </p>

                                                <p className="text-[10px] text-gray-500">
                                                    {a.date} • {a.time} • {labelPessoa}
                                                </p>
                                            </div>
                                        </div>

                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 capitalize">
                                            {a.status}
                                        </span>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </section>

            </main>
        </div>
    )
}